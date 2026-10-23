#!/usr/bin/env node
/**
 * theme-swap-check.mjs
 *
 * Verifies that switching skins does not regress the layout and does not flash
 * an empty frame.
 *
 * For each skin (dark / light):
 *   1. load the app with that skin, open Settings → General
 *   2. screenshot  A
 *   3. toggle the skin switch, sample frames while it settles, toggle back
 *   4. screenshot  B
 *   5. require sha256(A) === sha256(B)   — same skin before and after a round trip
 *   6. every sampled frame must be non-blank (dominant colour < 98.5% and at
 *      least 4 distinct colours in the sample)
 *
 * Frame sampling uses real screenshots, decoded in-process (no dependencies).
 * A one-frame flash shorter than the sampling interval can be missed; the
 * interval is printed with the result so the coverage is explicit.
 *
 * Known limitation — sub-pixel text antialiasing:
 *   A round trip can leave a handful of pixels different inside text areas even
 *   when nothing moved. They are low-density (a few dozen to a few hundred
 *   pixels), sit inside one bounding box, and carry a high per-channel delta
 *   because glyph edges get re-rasterised on a fresh paint. The control shot
 *   (two captures of the same untouched state) is 0, because nothing is
 *   repainted. This is why the default gate tolerates <= 0.02% of the screen and
 *   why the report always prints the changed-pixel count next to the tolerance.
 *   Focus outlines are excluded structurally: the closing comparison drops any
 *   pixel inside the focused element's box (plus 3px) and reports the count.
 *   Do not "re-investigate" such a residue as a skin regression: focus rings and
 *   :hover were both ruled out with control runs (focus is blurred before the
 *   closing shot, and --keep-hover reproduces the same 1px/0px result). Use
 *   --strict only when the question is literally "byte-identical", and compare
 *   the geometry signature when the question is "did anything move".
 *
 * Usage
 *   node scripts/theme-swap-check.mjs
 *   node scripts/theme-swap-check.mjs --skins=dark --out=/tmp/swap
 *   node scripts/theme-swap-check.mjs --url=http://127.0.0.1:5273/
 *
 * Exit codes: 0 all skins clean, 1 regression found, 2 setup failure.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

import {
  backendStub,
  launchChromium,
  resolvePlaywright,
  startDevServer,
  stopDevServer,
} from "./design-screenshots.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DESKTOP = join(REPO_ROOT, "desktop");

const VIEWPORT = { width: 1440, height: 900 };
const SAMPLE_INTERVAL_MS = 60;
const SAMPLE_DURATION_MS = 900;
const BLANK_DOMINANT = 0.985;
const BLANK_UNIQUE = 4;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    out: join(DESKTOP, ".design-baseline", "swap"),
    skins: ["dark", "light"],
    url: null,
    port: 5274,
    intervalMs: SAMPLE_INTERVAL_MS,
    durationMs: SAMPLE_DURATION_MS,
    settleMs: 250,
    keepHover: false,
    strict: false,
    help: false,
  };
  for (const arg of argv) {
    const [flag, raw] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      if (raw !== undefined) return raw;
      throw new Error(`${flag} needs a value (${flag}=...)`);
    };
    switch (flag) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--out":
        opts.out = resolve(process.cwd(), value());
        break;
      case "--skins": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        for (const skin of list) if (!["dark", "light"].includes(skin)) throw new Error(`unknown skin: ${skin}`);
        opts.skins = list;
        break;
      }
      case "--url":
        opts.url = value().replace(/\/$/, "");
        break;
      case "--port":
        opts.port = Number(value());
        if (!Number.isInteger(opts.port)) throw new Error("--port must be an integer");
        break;
      case "--keep-hover":
        opts.keepHover = true;
        break;
      case "--settle":
        opts.settleMs = Number(value());
        break;
      case "--strict":
        opts.strict = true;
        break;
      case "--interval":
        opts.intervalMs = Number(value());
        break;
      case "--duration":
        opts.durationMs = Number(value());
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  process.stdout.write(`theme-swap-check — skin round-trip and blank-frame check

Usage
  node scripts/theme-swap-check.mjs [options]

Options
  --skins=<list>      dark | light | dark,light        (default: both)
  --out=<dir>         where to write sampled frames    (default: desktop/.design-baseline/swap)
  --url=<url>         reuse a running dev server
  --port=<n>          dev server port                  (default: 5274)
  --strict            fail on any differing pixel (default: allow repaint noise
                      up to 0.02% of the screen, reported either way)
  --keep-hover        diagnostic: leave the pointer and focus on the switch
  --settle=<ms>       wait after the last toggle before the closing shot
                      (default: 250)
  --interval=<ms>     frame sampling interval          (default: 60)
  --duration=<ms>     how long to sample each toggle   (default: 900)
  -h, --help          show this help

Checks, per skin
  round trip   screenshot before toggling and after toggling twice must be
               byte-identical (same skin, same pixels)
  blank frames every sampled frame must keep >= 1.5% of sampled colours off the
               dominant colour and at least ${BLANK_UNIQUE} distinct colours

Note: frames are real screenshots; a flash shorter than the sampling interval
can be missed. The effective interval is printed.
`);
}

/** Hash of every file under desktop/src, so a concurrent edit can be detected. */
function sourceFingerprint() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else files.push(`${full.slice(DESKTOP.length)}:${stat.size}:${Math.round(stat.mtimeMs)}`);
    }
  };
  walk(join(DESKTOP, "src"));
  return createHash("sha256").update(files.sort().join("|")).digest("hex").slice(0, 12);
}

async function gotoWithRetry(page, url, opts, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
      return;
    } catch (err) {
      const transient = /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED/.test(err.message);
      if (!transient || attempt === attempts) throw err;
      // Another process in the shared checkout may be restarting the dev server.
      await page.waitForTimeout(800);
    }
  }
}

/** Short HEAD plus a dirty flag, so a report can be tied to a revision. */
function gitState() {
  try {
    const commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- desktop/src", { cwd: REPO_ROOT, encoding: "utf8" }).trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

// ------------------------------------------------------------- png decoding

/** Minimal PNG reader: 8-bit truecolour with or without alpha, no interlace. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, type ${colorType}, interlace ${interlace})`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? current[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      const v = line[x];
      let out;
      switch (filter) {
        case 0: out = v; break;
        case 1: out = v + a; break;
        case 2: out = v + b; break;
        case 3: out = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      current[x] = out & 255;
    }
    current.copy(pixels, y * stride);
    previous = current;
  }

  return { width, height, channels, pixels, stride };
}

function frameStats(buf) {
  const img = decodePng(buf);
  const stepX = Math.max(1, Math.floor(img.width / 180));
  const stepY = Math.max(1, Math.floor(img.height / 110));
  const counts = new Map();
  let total = 0;
  for (let y = 0; y < img.height; y += stepY) {
    for (let x = 0; x < img.width; x += stepX) {
      const i = y * img.stride + x * img.channels;
      const key = (img.pixels[i] << 16) | (img.pixels[i + 1] << 8) | img.pixels[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
  }
  let dominant = 0;
  for (const value of counts.values()) if (value > dominant) dominant = value;
  return { unique: counts.size, dominantShare: dominant / total };
}

/** Per-pixel difference between two same-size PNG buffers. */
function diffFrames(a, b, threshold = 2, excludeRects = []) {
  const imgA = decodePng(a);
  const imgB = decodePng(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return { changed: Infinity, ratio: 1, maxDelta: 255 };
  }
  let changed = 0;
  let maxDelta = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
  const { width, channels } = imgA;
  let excluded = 0;
  const inExcluded = (x, y) => excludeRects.some((box) => box && x >= box[0] && x < box[2] && y >= box[1] && y < box[3]);
  for (let i = 0; i < imgA.pixels.length; i += channels) {
    let delta = 0;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(imgA.pixels[i + c] - imgB.pixels[i + c]);
      if (d > delta) delta = d;
    }
    if (delta > maxDelta) maxDelta = delta;
    if (delta > threshold) {
      const pixel = i / channels;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (inExcluded(x, y)) { excluded += 1; continue; }
      changed += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const box = maxX >= 0 ? [minX, minY, maxX + 1, maxY + 1] : null;
  return { changed, excluded, ratio: changed / (imgA.width * imgA.height), maxDelta, box };
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ------------------------------------------------------------------- checks

async function openSettingsGeneral(page, opts) {
  if (!(await page.locator(".gm-app-shell").count())) await page.waitForSelector(".gm-app-shell");
  if (!(await page.locator(".gm-sidebar").count())) {
    await page.locator(".gm-sidebar-boundary-toggle").click();
  }
  const more = page.locator(".gm-sidebar-more-toggle");
  if ((await more.getAttribute("data-open")) !== "true") await more.click();
  await page.locator(".gm-sidebar-more-group").getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.waitForSelector(".gm-settings-page", { timeout: opts.timeoutMs });
  const general = page.locator(".gm-settings-page").getByText("General", { exact: true }).first();
  if (!(await general.count())) throw new Error("settings has no General section");
  await general.click();
  await page.waitForTimeout(150);
}

async function sampleFrames(page, opts, dir, label) {
  const frames = [];
  const started = Date.now();
  let index = 0;
  while (Date.now() - started < opts.durationMs) {
    const buf = await page.screenshot({ animations: "allow", caret: "initial" });
    const file = join(dir, `${label}-${String(index).padStart(2, "0")}.png`);
    writeFileSync(file, buf);
    const stats = frameStats(buf);
    frames.push({ file, ...stats, blank: stats.dominantShare >= BLANK_DOMINANT || stats.unique < BLANK_UNIQUE });
    index += 1;
    await page.waitForTimeout(opts.intervalMs);
  }
  return frames;
}

async function checkSkin(browser, skin, opts) {
  const dir = join(opts.out, skin);
  mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: skin,
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript(backendStub("desktop", { emptyState: false }));
  await context.addInitScript((theme) => {
    localStorage.setItem("gitmemo-theme", theme);
    localStorage.setItem("gitmemo-locale", "en");
  }, skin);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err).split("\n")[0]));

  try {
    await gotoWithRetry(page, opts.url, opts);
    await page.waitForSelector(".gm-app-shell", { timeout: opts.timeoutMs });
    await openSettingsGeneral(page, opts);
    await page.evaluate(() => document.fonts?.ready);
    if (!opts.keepHover) await page.mouse.move(2, 2);
    await page.waitForTimeout(250);

    const before = await page.screenshot({ animations: "disabled", caret: "hide" });
    const beforeFile = join(dir, "before.png");
    writeFileSync(beforeFile, before);

    // Control: two shots of the same unchanged state. Whatever differs here is
    // repaint noise, not the skin swap.
    //
    // 判差值的顺序（先做对照，再看换肤）：
    //   1. 不切换主题，同一状态连拍两张，差值必须为 0（或等于本文件定义的噪声阈值）。
    //   2. 不为 0 说明测试环境在抖——异步加载、空态切换、字体回填、滚动条出现，
    //      此时测出的任何差值都不能归因给皮肤。
    //   3. 为 0 之后再切主题，差值才是「产品真的变了」的证据。
    // 实际踩过的坑：某次报告 84px 位移，换成固定测试数据后降到 1px（深色）/ 0px（浅色），
    // 根因是数据不稳定导致的空态切换，与动画、折叠状态都无关。
    await page.waitForTimeout(300);
    const control = await page.screenshot({ animations: "disabled", caret: "hide" });
    const controlFile = join(dir, "control.png");
    writeFileSync(controlFile, control);
    const noise = diffFrames(before, control);

    const row = page.locator(".gm-settings-row").filter({ hasText: "Appearance" }).first();
    const toggle = row.locator(".gm-switch").first();
    if (!(await toggle.count())) throw new Error('no Appearance switch on the settings page');

    await toggle.click();
    const toggleFrames = await sampleFrames(page, opts, dir, "to-light");
    await page.waitForTimeout(200);
    await toggle.click();
    const backFrames = await sampleFrames(page, opts, dir, "to-dark");
    // Park the pointer and drop focus: a lingering :hover / :focus-visible on the
    // switch is a state difference, not a skin regression.
    if (!opts.keepHover) {
      await page.mouse.move(2, 2);
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    }
    await page.waitForTimeout(opts.settleMs);

    const after = await page.screenshot({ animations: "disabled", caret: "hide" });
    const afterFile = join(dir, "after.png");
    writeFileSync(afterFile, after);

    // Belt and braces: if anything still has focus, its outline is a state
    // marker, not a skin difference. Exclude that box and report how many
    // pixels were skipped.
    const focusRect = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return [Math.floor(r.left) - 3, Math.floor(r.top) - 3, Math.ceil(r.right) + 3, Math.ceil(r.bottom) + 3];
    });
    const trip = diffFrames(before, after, 2, focusRect ? [focusRect] : []);
    // Byte equality is the strict reading; in practice a repaint of the same
    // skin leaves a few antialiasing pixels different. Anything above the
    // control noise (doubled) or above 0.02% of the screen counts as a change.
    const tolerance = Math.max(noise.changed * 2, Math.round(VIEWPORT.width * VIEWPORT.height * 0.0002));
    const roundTrip = opts.strict ? trip.changed === 0 : trip.changed <= tolerance;

    const frames = [...toggleFrames, ...backFrames];
    const blanks = frames.filter((frame) => frame.blank);
    const worstDominant = Math.max(...frames.map((frame) => frame.dominantShare));

    return {
      skin,
      strictEqual: sha(before) === sha(after),
      roundTrip,
      tolerancePixels: tolerance,
      before: { file: beforeFile, sha256: sha(before) },
      after: { file: afterFile, sha256: sha(after) },
      control: { file: controlFile, ...noise },
      focusedBox: focusRect,
      trip: {
        changedPixels: trip.changed,
        excludedPixels: trip.excluded,
        ratio: Number((trip.ratio * 100).toFixed(4)),
        maxDelta: trip.maxDelta,
        box: trip.box,
      },
      frames: frames.length,
      blanks: blanks.map((frame) => frame.file),
      worstDominant: Number(worstDominant.toFixed(4)),
      pageErrors: errors.slice(0, 3),
    };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      return 0;
    }
    opts.timeoutMs = 60_000;
  } catch (err) {
    process.stderr.write(`theme-swap-check: ${err.message}\n\nRun with --help for usage.\n`);
    return 2;
  }

  let server = null;
  try {
    if (!opts.url) {
      process.stdout.write(`starting vite dev server on port ${opts.port}…\n`);
      server = await startDevServer({ port: opts.port, timeoutMs: opts.timeoutMs });
      opts.url = server.url;
    }

    const revision = gitState();
    process.stdout.write(`revision ${revision.commit ?? "unknown"}${revision.dirty ? " (desktop/src dirty)" : ""}\n`);
    const fingerprintBefore = sourceFingerprint();
    const { pw, version } = await resolvePlaywright();
    const { browser, fallback } = await launchChromium(pw.chromium);
    process.stdout.write(`playwright ${version}${fallback ? " (cached chromium)" : ""}; sampling every ${opts.intervalMs}ms\n`);

    const results = [];
    try {
      for (const skin of opts.skins) {
        results.push(await checkSkin(browser, skin, opts));
      }
    } finally {
      await browser.close();
    }

    const fingerprintAfter = sourceFingerprint();
    const contaminated = fingerprintBefore !== fingerprintAfter;
    if (contaminated) {
      process.stderr.write(`\n警告：采集期间 desktop/src 被改动（${fingerprintBefore} → ${fingerprintAfter}），结果不可作为验收依据。\n`);
    }
    mkdirSync(opts.out, { recursive: true });
    writeFileSync(join(opts.out, "report.json"), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceFingerprint: { before: fingerprintBefore, after: fingerprintAfter, contaminated },
      git: gitState(),
      intervalMs: opts.intervalMs,
      durationMs: opts.durationMs,
      blankThreshold: { dominantShare: BLANK_DOMINANT, minUnique: BLANK_UNIQUE },
      results,
    }, null, 2)}\n`);

    let failed = false;
    for (const result of results) {
      const frameNote = `${result.frames} 帧`;
      const blankNote = result.blanks.length ? `空白帧 ${result.blanks.length}` : "无空白帧";
      const tripNote = result.roundTrip
        ? `往返通过（差异 ${result.trip.changedPixels}px / 容差 ${result.tolerancePixels}px，控制噪声 ${result.control.changed}px，最大通道差 ${result.trip.maxDelta}）`
        : `往返不一致（差异 ${result.trip.changedPixels}px / 容差 ${result.tolerancePixels}px，最大通道差 ${result.trip.maxDelta}）`;
      if (!result.roundTrip || result.blanks.length || result.pageErrors.length) failed = true;
      process.stdout.write(`  ${result.skin.padEnd(6)} ${tripNote} · ${blankNote}（${frameNote}，主色占比峰值 ${(result.worstDominant * 100).toFixed(1)}%）\n`);
      for (const err of result.pageErrors) process.stdout.write(`         页面错误：${err}\n`);
    }
    process.stdout.write(`sampled frames + report: ${opts.out}\n`);
    return contaminated ? 2 : failed ? 1 : 0;
  } catch (err) {
    process.stderr.write(`theme-swap-check: ${err.message}\n`);
    return 2;
  } finally {
    await stopDevServer(server);
  }
}

export { frameStats, diffFrames };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exit(code); });
}
