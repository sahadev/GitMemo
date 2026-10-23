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

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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

const DEFAULT_WIDTHS = [1920, 1440, 1200, 768, 390];
const MULTI_WIDTH_PAGES = ["dashboard", "settings"];
const VIEWPORT_HEIGHT = 900;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    out: join(DESKTOP, ".design-baseline", "responsive"),
    widths: DEFAULT_WIDTHS,
    skins: ["dark", "light"],
    pages: MULTI_WIDTH_PAGES,
    allPages: false,
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
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
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
  const cases = [];
  for (const page of PAGES) {
    const widths = multiWidth.includes(page.id) ? opts.widths : [opts.baseWidth];
    for (const width of widths) {
      for (const skin of opts.skins) cases.push({ page: page.id, width, skin });
    }
  }

  let server = null;
  try {
    if (!opts.url) {
      process.stdout.write(`starting vite dev server on port ${opts.port}…\n`);
      server = await startDevServer({ port: opts.port, timeoutMs: opts.timeoutMs });
      opts.url = server.url;
    }
    const labels = loadLabels(opts.locale ?? "en");
    const { pw } = await resolvePlaywright();
    const { browser } = await launchChromium(pw.chromium);

    const results = [];
    const failures = [];
    try {
      for (const c of cases) {
        try {
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
    } finally {
      await browser.close();
    }

    // Skin layout alignment at the same width.
    const byKey = new Map();
    for (const result of results) {
      const key = `${result.width}/${result.pageId}`;
      if (!byKey.has(key)) byKey.set(key, {});
      byKey.get(key)[result.skin] = result;
    }
    const layoutRows = [];
    for (const [key, pair] of byKey) {
      const skins = Object.keys(pair);
      if (skins.length < 2) continue;
      const [a, b] = skins;
      const match = pair[a].geometry === pair[b].geometry;
      layoutRows.push({ key, match, a: pair[a].geometryHash, b: pair[b].geometryHash });
      if (!match) failures.push({ kind: "换肤布局变化", page: pair[a].pageId, width: pair[a].width, detail: `${a} ${pair[a].geometryHash} ≠ ${b} ${pair[b].geometryHash}` });
    }

    mkdirSync(opts.out, { recursive: true });
    writeFileSync(join(opts.out, "report.json"), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      widths: opts.widths,
      skins: opts.skins,
      results: results.map(({ geometry, ...rest }) => rest),
      layout: layoutRows,
      failures,
    }, null, 2)}\n`);

    process.stdout.write("\n换肤布局对齐（同宽度下深/浅几何签名对比）\n");
    for (const row of layoutRows.sort((x, y) => (x.key < y.key ? -1 : 1))) {
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
    return failures.length ? 1 : 0;
  } catch (err) {
    process.stderr.write(`responsive-baseline: ${err.message}\n`);
    return 2;
  } finally {
    await stopDevServer(server);
  }
}

main().then((code) => { process.exit(code); });
