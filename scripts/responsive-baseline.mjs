#!/usr/bin/env node
/**
 * responsive-baseline.mjs
 *
 * Width matrix + skin-layout audit.
 *
 * For each width × skin × page:
 *   - screenshot into <out>/<width>/<skin>/<page>.png
 *   - record document scrollWidth, elements outside the viewport, clipped text
 *   - record a geometry signature (every visible element's x/y/w/h)
 *
 * Then compares the geometry signature of the two skins at the same width:
 * switching skins must not move or resize anything, colours may differ.
 *
 * Widths: 1920 / 1440 / 1200 / 768 / 390. Pages dashboard and settings run at
 * every width; the other twelve stay at their default width (1440).
 *
 * Usage
 *   node scripts/responsive-baseline.mjs
 *   node scripts/responsive-baseline.mjs --pages=dashboard --widths=390,768
 *   node scripts/responsive-baseline.mjs --url=http://127.0.0.1:5273/
 *
 * Exit codes: 0 clean, 1 findings, 2 setup failure.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAGES,
  backendStub,
  launchChromium,
  loadLabels,
  navigate,
  resolvePlaywright,
  startDevServer,
  stopDevServer,
} from "./design-screenshots.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DESKTOP = join(REPO_ROOT, "desktop");

const DEFAULT_WIDTHS = [1920, 1440, 1200, 768, 720];
const MULTI_WIDTH_PAGES = ["dashboard", "settings"];
const VIEWPORT_HEIGHT = 900;

/** Smallest window the desktop shell can actually have (Tauri config). */
function windowMinWidth() {
  try {
    const conf = JSON.parse(readFileSync(join(DESKTOP, "src-tauri", "tauri.conf.json"), "utf8"));
    const width = conf?.app?.windows?.[0]?.minWidth;
    return Number.isFinite(width) ? width : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    out: join(DESKTOP, ".design-baseline", "responsive"),
    widths: DEFAULT_WIDTHS,
    skins: ["dark", "light"],
    pages: MULTI_WIDTH_PAGES,
    allPages: false,
    listedOnly: false,
    includeUnreachable: false,
    baseWidth: 1440,
    url: null,
    port: 5275,
    timeoutMs: 60_000,
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
      case "--widths": {
        const list = value().split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
        if (!list.length) throw new Error("--widths needs at least one positive width");
        opts.widths = list;
        break;
      }
      case "--skins": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        for (const skin of list) if (!["dark", "light"].includes(skin)) throw new Error(`unknown skin: ${skin}`);
        opts.skins = list;
        break;
      }
      case "--pages": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        for (const id of list) if (!PAGES.some((p) => p.id === id)) throw new Error(`unknown page: ${id}`);
        opts.pages = list;
        break;
      }
      case "--all-pages":
        opts.allPages = true;
        break;
      case "--listed-only":
        opts.listedOnly = true;
        break;
      case "--include-unreachable":
        opts.includeUnreachable = true;
        break;
      case "--url":
        opts.url = value().replace(/\/$/, "");
        break;
      case "--port":
        opts.port = Number(value());
        if (!Number.isInteger(opts.port)) throw new Error("--port must be an integer");
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  process.stdout.write(`responsive-baseline — width matrix and skin-layout audit

Usage
  node scripts/responsive-baseline.mjs [options]

Options
  --widths=<list>     default ${DEFAULT_WIDTHS.join(" / ")}
  --skins=<list>      dark | light | dark,light        (default: both)
  --pages=<list>      pages that run at every width    (default: ${MULTI_WIDTH_PAGES.join(", ")})
  --all-pages         every page at every width
  --listed-only       only run the pages given by --pages
  --include-unreachable  also measure widths below the window minWidth
  --out=<dir>         default desktop/.design-baseline/responsive
  --url=<url>         reuse a running dev server
  --port=<n>          dev server port                  (default: 5275)
  -h, --help          show this help

Checks
  scroll      document.scrollWidth must not exceed the viewport width
  overflow    no visible element may extend past the viewport edges
              (elements inside a horizontally scrollable box are exempt)
  clipping    text clipped vertically by overflow:hidden outside scrollers, or
              cut horizontally without an ellipsis
  width       the main content column must stay at least 400px wide; below that
              the desktop shell is squeezed and unreadable
  layout      dark and light at the same width must produce identical geometry
              (x/y/width/height of every visible element) — colour may change,
              position may not

Pages not listed with --pages stay at ${1440}px so the matrix stays bounded.
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

// ------------------------------------------------------------------ measure

const MEASURE = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0
      && style.visibility !== "hidden"
      && style.display !== "none"
      && Number(style.opacity) > 0;
  };

  const hasScrollableAncestor = (el, axis) => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const value = axis === "x" ? style.overflowX : style.overflowY;
      if (value === "auto" || value === "scroll") return true;
    }
    return false;
  };

  const label = (el) => {
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
  };

  const all = [...document.querySelectorAll("body *")].filter(isVisible);

  const outside = all
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      if (hasScrollableAncestor(el, "x")) return false;
      return rect.right > vw + 1 || rect.left < -1;
    })
    .slice(0, 12)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return `${label(el)} [${Math.round(rect.left)},${Math.round(rect.right)}]`;
    });

  const horizontallyClipped = all
    .filter((el) => {
      const style = getComputedStyle(el);
      if (style.overflowX !== "hidden") return false;
      if (style.textOverflow === "ellipsis") return false;
      if (el.scrollWidth <= el.clientWidth + 4) return false;
      return Boolean((el.innerText || "").trim());
    })
    .slice(0, 12)
    .map((el) => label(el));

  const main = document.querySelector(".gm-app-main");
  const contentWidth = main ? Math.round(main.getBoundingClientRect().width) : null;

  const clipped = all
    .filter((el) => {
      const style = getComputedStyle(el);
      if (style.overflowY !== "hidden") return false;
      if (el.scrollHeight <= el.clientHeight + 4) return false;
      if (!(el.innerText || "").trim()) return false;
      if (style.webkitLineClamp && style.webkitLineClamp !== "none") return false;
      return !hasScrollableAncestor(el, "y");
    })
    .slice(0, 12)
    .map((el) => label(el));

  // Geometry signature: DOM order + rounded box. Colour is deliberately absent.
  const boxes = all.map((el) => {
    const rect = el.getBoundingClientRect();
    return `${label(el)}@${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`;
  });

  return {
    viewportWidth: vw,
    viewportHeight: vh,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalScroll: document.documentElement.scrollWidth > vw + 1,
    contentWidth,
    horizontallyClipped,
    outside,
    clipped,
    geometry: boxes.join("|"),
  };
};

function geometryHash(geometry) {
  return createHash("sha256").update(geometry).digest("hex").slice(0, 12);
}

// --------------------------------------------------------------------- runs

function serverAlive(url) {
  return new Promise((done) => {
    const req = http.get(url, (res) => { res.resume(); done(true); });
    req.on("error", () => done(false));
    req.setTimeout(700, () => { req.destroy(); done(false); });
  });
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

async function openAt(browser, width, skin, opts) {
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: skin,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript(backendStub("desktop", { emptyState: false }));
  await context.addInitScript((theme) => {
    localStorage.setItem("gitmemo-theme", theme);
    localStorage.setItem("gitmemo-locale", "en");
  }, skin);
  const page = await context.newPage();
  return { context, page };
}

async function captureCase(browser, labels, pageId, width, skin, opts) {
  const route = PAGES.find((p) => p.id === pageId);
  const { context, page } = await openAt(browser, width, skin, opts);
  try {
    await gotoWithRetry(page, opts.url, opts);
    await page.waitForSelector(".gm-app-shell", { timeout: opts.timeoutMs });
    await navigate(page, "desktop", route, labels, { ...opts, allPages: true });
    // Measure only once the skin is actually applied, otherwise both runs can
    // be captured in the same pre-theme frame and the comparison is vacuous.
    await page.waitForFunction((skin) => document.documentElement.dataset.theme === skin, skin, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(400);

    const measured = await page.evaluate(MEASURE);
    const dir = join(opts.out, String(width), skin);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${pageId}.png`);
    await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
    return { pageId, width, skin, file, ...measured, geometryHash: geometryHash(measured.geometry) };
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
  } catch (err) {
    process.stderr.write(`responsive-baseline: ${err.message}\n\nRun with --help for usage.\n`);
    return 2;
  }

  const multiWidth = opts.allPages ? PAGES.map((p) => p.id) : opts.pages;
  const minWindowWidth = windowMinWidth();
  const unreachable = [];
  const cases = [];
  const catalogue = opts.listedOnly ? PAGES.filter((page) => multiWidth.includes(page.id)) : PAGES;
  for (const page of catalogue) {
    const widths = multiWidth.includes(page.id) ? opts.widths : [opts.baseWidth];
    for (const width of widths) {
      if (minWindowWidth && width < minWindowWidth && !opts.includeUnreachable) {
        // Below the desktop window minWidth; only a mobile runtime can be this narrow.
        unreachable.push({ page: page.id, width, minWindowWidth });
        continue;
      }
      for (const skin of opts.skins) cases.push({ page: page.id, width, skin });
    }
  }

  let server = null;
  try {
    const bootServer = async () => {
      server = await startDevServer({ port: opts.port, timeoutMs: opts.timeoutMs });
      opts.url = server.url;
    };
    if (!opts.url) {
      process.stdout.write(`starting vite dev server on port ${opts.port}…\n`);
      await bootServer();
    }
    const revision = gitState();
    process.stdout.write(`revision ${revision.commit ?? "unknown"}${revision.dirty ? " (desktop/src dirty)" : ""}\n`);
    const labels = loadLabels(opts.locale ?? "en");
    const { pw } = await resolvePlaywright();
    const { browser } = await launchChromium(pw.chromium);

    const runPass = async () => {
      const before = sourceFingerprint();
      const results = [];
      const failures = [];
      for (const c of cases) {
        try {
          // Other agents share this checkout and its dev servers; if ours died,
          // bring it back before the next case rather than recording a failure.
          if (!(await serverAlive(opts.url))) {
            process.stderr.write(`  dev server 失联，重启后继续（${c.width}/${c.page}）\n`);
            await stopDevServer(server);
            await bootServer();
          }
          const result = await captureCase(browser, labels, c.page, c.width, c.skin, opts);
          results.push(result);
          const bits = [];
          if (result.horizontalScroll) bits.push(`横向滚动 ${result.scrollWidth}>${result.viewportWidth}`);
          if (result.outside.length) bits.push(`出屏 ${result.outside.length}`);
          if (result.clipped.length) bits.push(`纵向裁切 ${result.clipped.length}`);
          if (result.horizontallyClipped.length) bits.push(`文字裁切 ${result.horizontallyClipped.length}`);
          if (result.contentWidth !== null && result.contentWidth < 400) bits.push(`内容区 ${result.contentWidth}px`);
          process.stdout.write(`  ${String(c.width).padStart(4)} ${c.skin.padEnd(5)} ${c.page.padEnd(15)} ${bits.length ? bits.join(" · ") : "ok"}\n`);
          if (result.horizontalScroll) failures.push({ ...c, kind: "横向滚动", detail: `${result.scrollWidth} > ${result.viewportWidth}` });
          if (result.outside.length) failures.push({ ...c, kind: "元素出屏", detail: result.outside.join(" ; ") });
          if (result.clipped.length) failures.push({ ...c, kind: "纵向裁切", detail: result.clipped.join(" ; ") });
          if (result.horizontallyClipped.length) failures.push({ ...c, kind: "文字水平裁切", detail: result.horizontallyClipped.join(" ; ") });
          if (result.contentWidth !== null && result.contentWidth < 400) {
            failures.push({ ...c, kind: "内容区过窄", detail: `${result.contentWidth}px（阈值 400）` });
          }
        } catch (err) {
          process.stderr.write(`  ${String(c.width).padStart(4)} ${c.skin.padEnd(5)} ${c.page.padEnd(15)} error: ${err.message.split("\n")[0]}\n`);
          failures.push({ ...c, kind: "采集失败", detail: err.message.split("\n")[0] });
        }
      }
      return { before, after: sourceFingerprint(), results, failures };
    };

    let pass = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) process.stdout.write(`\n工作区在采集期间被改动，重跑第 ${attempt} 次…\n`);
      pass = await runPass();
      pass.contaminated = pass.before !== pass.after;
      if (!pass.contaminated) break;
    }
    const { results, failures } = pass;
    await browser.close();

    // Same width + same page, dark vs light: the geometry signature has to match,
    // otherwise switching skins moved something.
    const layoutRows = [];
    const byKey = new Map();
    for (const r of results) {
      const key = `${r.width}/${r.pageId}`;
      const entry = byKey.get(key) ?? { key };
      entry[r.skin] = r.geometryHash;
      byKey.set(key, entry);
    }
    for (const entry of byKey.values()) {
      if (!entry.dark || !entry.light) continue;
      layoutRows.push({ key: entry.key, a: entry.dark, b: entry.light, match: entry.dark === entry.light });
    }
    layoutRows.sort((x, y) => (x.key < y.key ? -1 : 1));
    for (const row of layoutRows) {
      if (!row.match) failures.push({ width: row.key.split("/")[0], page: row.key.split("/")[1], kind: "换肤布局变化", detail: `${row.a} ≠ ${row.b}` });
    }

    const contaminated = pass.contaminated;
    if (contaminated) {
      process.stderr.write(`\n警告：三次采集期间 desktop/src 都在被改动（${pass.before} → ${pass.after}），结果不可作为验收依据。\n`);
    }
    const fingerprintBefore = pass.before;
    const fingerprintAfter = pass.after;
    mkdirSync(opts.out, { recursive: true });
    writeFileSync(join(opts.out, "report.json"), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      windowMinWidth: minWindowWidth,
      unreachableWidths: unreachable,
      sourceFingerprint: { before: fingerprintBefore, after: fingerprintAfter, contaminated },
      git: gitState(),
      widths: opts.widths,
      skins: opts.skins,
      results: results.map(({ geometry, ...rest }) => rest),
      layout: layoutRows,
      failures,
    }, null, 2)}\n`);

    if (unreachable.length) {
      const widths = [...new Set(unreachable.map((c) => c.width))].join(", ");
      process.stdout.write(`\n跳过不可达宽度 ${widths}：低于桌面窗口最小宽度 ${minWindowWidth}px（Tauri minWidth），桌面运行时不会出现。\n`);
    }
    process.stdout.write("\n换肤布局对齐（同宽度下深/浅几何签名对比）\n");
    for (const row of layoutRows) {
      process.stdout.write(`  ${row.key.padEnd(20)} ${row.match ? "一致" : `不一致 ${row.a} ≠ ${row.b}`}\n`);
    }

    if (failures.length) {
      process.stdout.write(`\n发现 ${failures.length} 项：\n`);
      for (const failure of failures.slice(0, 20)) {
        process.stdout.write(`  [${failure.kind}] ${failure.width ?? ""} ${failure.page ?? ""} ${failure.detail ?? ""}\n`);
      }
      if (failures.length > 20) process.stdout.write(`  … 其余 ${failures.length - 20} 项见 report.json\n`);
    } else {
      process.stdout.write("\n全部检查通过。\n");
    }
    process.stdout.write(`截图与报告：${opts.out}\n`);
    return contaminated ? 2 : failures.length ? 1 : 0;
  } catch (err) {
    process.stderr.write(`responsive-baseline: ${err.message}\n`);
    return 2;
  } finally {
    await stopDevServer(server);
  }
}

main().then((code) => { process.exit(code); });
