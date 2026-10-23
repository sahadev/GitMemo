#!/usr/bin/env node
/**
 * design-screenshots.mjs
 *
 * Repeatable visual baseline for the GitMemo Desktop UI.
 *
 * Starts the desktop Vite dev server, walks the six primary routes, and writes
 * one PNG per route per viewport into desktop/.design-baseline/. A manifest
 * records a sha256 per image so runs can be compared.
 *
 * Why a backend stub: the app talks to Tauri commands. In a plain browser those
 * commands are missing, so the UI renders "cannot read invoke" error states.
 * This script installs a Playwright-only stub (window.__TAURI_INTERNALS__) that
 * answers get_runtime_info / get_stats / get_recent_activity and rejects every
 * other command, which produces the app's real empty states instead. Nothing in
 * desktop/src is modified. Use --no-stub to capture the raw no-backend state.
 *
 * Playwright is intentionally NOT added to package.json. The script reuses an
 * existing install (project, repo, or npx cache); if none exists it runs
 * `npm exec --yes --package=playwright` once to fetch one. If the matching
 * browser build is missing it falls back to any Chromium already in the
 * Playwright browser cache.
 *
 * Usage
 *   node scripts/design-screenshots.mjs                    # capture both viewports
 *   node scripts/design-screenshots.mjs --viewport=desktop
 *   node scripts/design-screenshots.mjs --routes=dashboard,notes
 *   node scripts/design-screenshots.mjs --compare          # diff vs previous run
 *   node scripts/design-screenshots.mjs --help
 *
 * Exit codes
 *   0 captured (or identical when --compare)
 *   1 --compare found differences
 *   2 bad invocation / server or browser unavailable
 *
 * No dependencies, Node >= 20.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DESKTOP = join(REPO_ROOT, "desktop");
const DEFAULT_OUT = join(DESKTOP, ".design-baseline");
const MANIFEST = "manifest.json";

const ROUTES = [
  { id: "dashboard", navKey: "dashboard", marker: ".gm-inst-dashboard" },
  { id: "search", navKey: "search", marker: ".gm-page-frame-column" },
  { id: "ai-records", navKey: "aiRecords", marker: ".gm-ai-records-page" },
  // notes and favorites share their root classes, so navigation state is the check
  { id: "notes", navKey: "notes", marker: null },
  { id: "clipboard", navKey: "clipboard", marker: ".gm-clipboard-page" },
  { id: "favorites", navKey: "favorites", marker: null },
];

/**
 * Every navigable surface in the desktop app. `nav` describes how to reach it
 * from a cold load; `marker` is what has to be visible before the shutter.
 * `theme` runs are desktop-only, which is why mobile entries are absent here.
 */
const PAGES = [
  { id: "dashboard", nav: { kind: "sidebar", key: "dashboard" }, marker: ".gm-inst-dashboard" },
  { id: "search", nav: { kind: "sidebar", key: "search" }, marker: ".gm-page-frame-column" },
  { id: "ai-records", nav: { kind: "sidebar", key: "aiRecords" }, marker: ".gm-ai-records-page" },
  { id: "ai-records-plans", nav: { kind: "tab", page: "aiRecords", tab: "plans" }, marker: '.gm-split-pane[data-panel-key="plans"]' },
  { id: "notes", nav: { kind: "sidebar", key: "notes" }, marker: null },
  { id: "clipboard", nav: { kind: "sidebar", key: "clipboard" }, marker: ".gm-clipboard-page" },
  { id: "vault", nav: { kind: "more", key: "vault" }, marker: ".gm-vault-page" },
  { id: "favorites", nav: { kind: "sidebar", key: "favorites" }, marker: null },
  { id: "imports", nav: { kind: "more", key: "imports" }, marker: '.gm-split-pane[data-panel-key="imports"]' },
  { id: "claude-config", nav: { kind: "more", key: "claudeConfig" }, marker: '.gm-split-pane[data-panel-key="claude-config"]' },
  { id: "editor-home", nav: { kind: "settings-editor" }, marker: '.gm-split-pane[data-panel-key="editor-home"]' },
  { id: "external-files", nav: { kind: "more", key: "externalFiles" }, marker: '.gm-split-pane[data-panel-key="external-files"]' },
  { id: "settings", nav: { kind: "more", key: "settings" }, marker: ".gm-settings-page" },
  { id: "quick-paste", nav: { kind: "url", path: "quick-paste.html" }, marker: ".gm-quick-paste-shell" },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, family: "desktop", os: "macos", dir: "desktop-1440" },
  mobile: { width: 390, height: 844, family: "mobile", os: "android", dir: "mobile-390" },
};

const FREEZE_CSS = `*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}

/* Transient toasts are not part of the layout baseline. */
.mantine-Notifications-root,
[data-mantine-shared-portal-node] {
  display: none !important;
}`;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    out: DEFAULT_OUT,
    viewports: ["desktop", "mobile"],
    routes: ROUTES.map((r) => r.id),
    allPages: false,
    themes: ["dark"],
    themeDirs: false,
    url: null,
    port: 5273,
    theme: null,
    locale: "en",
    stub: true,
    emptyState: false,
    compare: false,
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
      case "--viewport": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        for (const v of list) if (!VIEWPORTS[v]) throw new Error(`unknown viewport: ${v} (desktop, mobile)`);
        opts.viewports = list;
        break;
      }
      case "--routes": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        for (const r of list) if (!ROUTES.some((route) => route.id === r)) {
          throw new Error(`unknown route: ${r} (${ROUTES.map((route) => route.id).join(", ")})`);
        }
        opts.routes = list;
        break;
      }
      case "--pages": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        if (list.includes("all")) {
          opts.allPages = true;
          opts.routes = PAGES.map((page) => page.id);
        } else {
          for (const id of list) if (!PAGES.some((page) => page.id === id)) {
            throw new Error(`unknown page: ${id} (${PAGES.map((page) => page.id).join(", ")})`);
          }
          opts.allPages = true;
          opts.routes = list;
        }
        opts.viewports = ["desktop"];
        opts.themeDirs = true;
        break;
      }
      case "--themes": {
        const list = value().split(",").map((s) => s.trim()).filter(Boolean);
        for (const t of list) if (!["dark", "light"].includes(t)) throw new Error(`unknown theme: ${t} (dark, light)`);
        opts.themes = list;
        opts.themeDirs = true;
        break;
      }
      case "--theme-dirs":
        opts.themeDirs = true;
        break;
      case "--url":
        opts.url = value().replace(/\/$/, "");
        break;
      case "--port":
        opts.port = Number(value());
        if (!Number.isInteger(opts.port)) throw new Error("--port must be an integer");
        break;
      case "--theme":
        opts.theme = value();
        if (!["dark", "light"].includes(opts.theme)) throw new Error("--theme must be dark or light");
        opts.themes = [opts.theme];
        break;
      case "--locale":
        opts.locale = value();
        if (!["en", "zh"].includes(opts.locale)) throw new Error("--locale must be en or zh");
        break;
      case "--no-stub":
        opts.stub = false;
        break;
      case "--empty-state":
        opts.emptyState = true;
        break;
      case "--compare":
        opts.compare = true;
        break;
      case "--timeout":
        opts.timeoutMs = Number(value()) * 1000;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!opts.theme) opts.theme = opts.themes[0];
  return opts;
}

function printHelp() {
  process.stdout.write(`design-screenshots — capture the GitMemo Desktop visual baseline

Usage
  node scripts/design-screenshots.mjs [options]

Options
  --viewport=<list>   desktop | mobile | desktop,mobile        (default: both)
  --routes=<list>     ${ROUTES.map((r) => r.id).join(" | ")}
  --pages=<list>      14 desktop surfaces, or "all": ${PAGES.map((p) => p.id).join(", ")}
                      (forces desktop viewport and per-theme folders)
  --themes=<list>     dark | light | dark,light                (default: dark)
  --out=<dir>         output directory (default: desktop/.design-baseline)
  --url=<url>         use an already running dev server instead of spawning one
  --port=<n>          dev server port (default: 5273)
  --theme=dark|light  single theme (same as --themes with one value)
  --locale=en|zh      UI language pinned in localStorage (default: en)
  --no-stub           do not stub the Tauri backend (captures error states)
  --empty-state       stub zero counts instead of sample counts (first-run UI)
  --compare           compare against the previous manifest, exit 1 on any diff
  --timeout=<seconds> per-navigation timeout (default: 60)
  -h, --help          show this help

Output
  routes mode:  <out>/<desktop-1440|mobile-390>/<route>.png
  pages mode:   <out>/<theme>/<page>.png
  <out>/manifest.json            one entry per screenshot, with sha256

Notes
  * Playwright is used from an existing install; nothing is added to package.json.
  * The Tauri backend is stubbed in-page so empty states render deterministically.
  * Theme switching uses the product's own localStorage key (gitmemo-theme).
  * desktop/.design-baseline/ is git-ignored; it is a local baseline.
`);
}

// -------------------------------------------------------------- dev server

function waitForServer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolvePromise();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`dev server did not answer within ${Math.round(timeoutMs / 1000)}s: ${url}`));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

async function startDevServer(opts) {
  const viteBin = join(DESKTOP, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  if (!existsSync(viteBin)) {
    throw new Error(`vite not found at ${viteBin}. Run "pnpm install" inside desktop/ first.`);
  }
  const child = spawn(viteBin, ["--host", "127.0.0.1", "--port", String(opts.port), "--strictPort"], {
    cwd: DESKTOP,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d.toString(); });
  child.stderr.on("data", (d) => { log += d.toString(); });

  const url = `http://127.0.0.1:${opts.port}/`;
  try {
    await waitForServer(url, opts.timeoutMs);
    if (child.exitCode !== null) {
      throw new Error(`port ${opts.port} is already in use by another dev server — stop it or pass --port=<n>`);
    }
  } catch (err) {
    child.kill("SIGTERM");
    throw new Error(`${err.message}\n--- vite output ---\n${log.slice(-1200)}`);
  }
  return { child, url: `http://127.0.0.1:${opts.port}/`, log: () => log };
}

function stopDevServer(server) {
  return new Promise((done) => {
    const child = server?.child;
    if (!child || child.exitCode !== null) { done(); return; }
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }, 3000);
    timer.unref();
    child.once("exit", () => { clearTimeout(timer); done(); });
    child.kill("SIGTERM");
  });
}

function readVersion(pkgDir) {
  try {
    return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  const pa = a.split(/[.-]/).map((n) => Number(n) || 0);
  const pb = b.split(/[.-]/).map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function candidatePlaywrightDirs() {
  const dirs = [
    join(DESKTOP, "node_modules", "playwright"),
    join(REPO_ROOT, "node_modules", "playwright"),
  ];
  for (const npxRoot of [join(os.homedir(), ".npm", "_npx")]) {
    if (!existsSync(npxRoot)) continue;
    for (const entry of readdirSync(npxRoot)) {
      const dir = join(npxRoot, entry, "node_modules", "playwright");
      if (existsSync(join(dir, "package.json"))) dirs.push(dir);
    }
  }
  return dirs
    .map((dir) => ({ dir, version: readVersion(dir) }))
    .filter((entry) => entry.version)
    .sort((a, b) => compareVersions(b.version, a.version));
}

function loadPlaywrightFrom(dir) {
  const req = createRequire(join(dir, "package.json"));
  return req(dir);
}

async function resolvePlaywright() {
  const found = candidatePlaywrightDirs();
  for (const entry of found) {
    try {
      return { pw: loadPlaywrightFrom(entry.dir), version: entry.version, dir: entry.dir };
    } catch {
      // try the next candidate
    }
  }
  // Nothing usable: fetch a throwaway copy through npx, exactly as the task allows.
  process.stderr.write("playwright not found locally — fetching a temporary copy via npm exec (not added to package.json)\n");
  spawnSync("npm", ["exec", "--yes", "--package=playwright", "--", "playwright", "--version"], {
    stdio: "ignore",
    timeout: 300_000,
  });
  for (const entry of candidatePlaywrightDirs()) {
    try {
      return { pw: loadPlaywrightFrom(entry.dir), version: entry.version, dir: entry.dir };
    } catch {
      // keep looking
    }
  }
  throw new Error(
    "could not obtain playwright. Install it out-of-band, e.g.\n"
    + "  npm exec --package=playwright -- playwright install chromium\n"
    + "  npm exec --package=playwright -- playwright --version",
  );
}

function browserCacheRoots() {
  return [
    join(os.homedir(), "Library", "Caches", "ms-playwright"),
    join(os.homedir(), ".cache", "ms-playwright"),
  ].filter((p) => existsSync(p));
}

function installedChromium() {
  const candidates = [];
  for (const root of browserCacheRoots()) {
    for (const dir of readdirSync(root)) {
      const full = join(root, dir);
      if (dir.startsWith("chromium_headless_shell-")) {
        const inner = join(full, `${dir.replace(/_headless_shell-\d+$/, "")}-headless-shell`);
        // layout differs per platform; probe both shapes
        for (const guess of [
          join(full, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
          join(full, "chrome-headless-shell-mac-x64", "chrome-headless-shell"),
          join(full, "chrome-headless-shell-linux64", "chrome-headless-shell"),
          join(inner, "chrome-headless-shell"),
        ]) {
          if (existsSync(guess)) candidates.push({ path: guess, revision: Number(dir.split("-").pop()) || 0 });
        }
      }
      if (dir.startsWith("chromium-")) {
        for (const guess of [
          join(full, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
          join(full, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
          join(full, "chrome-linux", "chrome"),
        ]) {
          if (existsSync(guess)) candidates.push({ path: guess, revision: Number(dir.split("-").pop()) || 0 });
        }
      }
    }
  }
  candidates.sort((a, b) => b.revision - a.revision);
  return candidates[0]?.path ?? null;
}

async function launchChromium(chromium) {
  try {
    return { browser: await chromium.launch(), fallback: null };
  } catch (err) {
    const exe = installedChromium();
    if (!exe) {
      throw new Error(
        `${err.message.split("\n")[0]}\nNo installed Chromium to fall back to. Run:\n  npm exec --package=playwright -- playwright install chromium`,
      );
    }
    return { browser: await chromium.launch({ executablePath: exe }), fallback: exe };
  }
}

// ---------------------------------------------------------------- fixtureing

function backendStub(viewport, opts) {
  const { family, os: osName } = VIEWPORTS[viewport];
  const stats = opts.emptyState
    ? { conversations: 0, manuals: 0, scratch_notes: 0, clips: 0, plans: 0, tracked_files: 0, total_size_kb: 0, repository_size_kb: 0 }
    // Sample counts so the dashboard renders its populated layout instead of
    // the first-run guide. No user data is involved.
    : { conversations: 128, manuals: 42, scratch_notes: 16, clips: 320, plans: 9, tracked_files: 515, total_size_kb: 18432, repository_size_kb: 23120 };
  return `(() => {
    const platform = { family: ${JSON.stringify(family)}, os: ${JSON.stringify(osName)} };
    const sampleStats = ${JSON.stringify(stats)};
    const sampleEmpty = ${opts.emptyState ? "true" : "false"};
    const sampleSearch = [
      { source_type: "conversation", title: "Claude：把 roomlog 的抽取规则收敛成词表", file_path: "~/.gitmemo/conversations/claude/roomlog-rules.md", snippet: "规则收敛成词表之后，抽取准确率从 82% 提到 94%，剩下 6% 是术语别名。", date: "2026-10-23T23:17:00Z" },
      { source_type: "note", title: "合同第二版：付款节点与验收口径", file_path: "~/.gitmemo/notes/manual/contract-v2.md", snippet: "付款分三段：签约 30%、验收 50%、尾款 20%。验收口径以附录 B 为准。", date: "2026-10-23T17:42:00Z" },
      { source_type: "clip", title: "cargo test --manifest-path desktop/src-tauri/Cargo.toml", file_path: "~/.gitmemo/clips/terminal/cargo-test.md", snippet: "cargo test --manifest-path desktop/src-tauri/Cargo.toml -- --nocapture", date: "2026-10-23T16:08:00Z" },
      { source_type: "plan", title: "视觉改造三阶段：审计 → 改造 → 验收", file_path: "~/.gitmemo/plans/visual-overhaul.md", snippet: "1 审计基线；2 结构轨与取值轨并行；3 全站回归与截图差分。", date: "2026-10-23T15:31:00Z" },
      { source_type: "conversation", title: "Codex：Tauri 打包签名失败的三种成因", file_path: "~/.gitmemo/conversations/codex/tauri-signing.md", snippet: "证书链缺失、entitlements 不匹配、时间戳服务器不可达。", date: "2026-10-22T20:10:00Z" },
      { source_type: "clip", title: "awwwards.com/sites/format — Obys × DES 版式实验", file_path: "~/.gitmemo/clips/browser/awwwards-format.md", snippet: "FORMAT 用版式本身当叙事工具，网格显式可见。", date: "2026-10-22T11:05:00Z" },
    ];
    const noteEntry = (name, path, preview, hoursAgo, size) => ({
      name, path, source_type: "note", modified: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
      size, preview, modifiedTs: Date.now() - hoursAgo * 3600000,
    });
    const sampleNotes = [
      noteEntry("合同第二版：付款节点与验收口径", "notes/manual/contract-v2.md", "付款分三段：签约 30%、验收 50%、尾款 20%", 1, 4820),
      noteEntry("视觉改造三阶段：审计 → 改造 → 验收", "notes/manual/visual-overhaul.md", "结构轨与取值轨并行，最后统一回归", 3, 3120),
      noteEntry("设计语言 V2：把允许清单改成封闭清单", "notes/manual/design-language-v2.md", "允许清单只能收紧，不能扩张", 26, 6740),
      noteEntry("Obsidian 迁移：frontmatter 保留策略", "notes/manual/obsidian-migration.md", "保留 aliases 与 tags，其余字段重建", 50, 2980),
      noteEntry("roomlog 字段表", "notes/scratch/roomlog-fields.md", "speaker / intent / decision / open", 2, 920),
      noteEntry("评审要点：层级与节奏", "notes/scratch/review-notes.md", "一屏三层响度；一个方向一条线", 5, 1180),
    ];
    let nextId = 1;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event, id) => { delete window["_" + id]; },
    };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback: (cb) => { const id = nextId++; window["_" + id] = cb; return id; },
      unregisterCallback: (id) => { delete window["_" + id]; },
      convertFileSrc: (p) => p,
      invoke: (cmd, args) => {
        switch (cmd) {
          case "get_runtime_info":
          case "get_runtime_platform":
            return Promise.resolve(platform);
          case "get_stats":
            return Promise.resolve(sampleStats);
          case "get_recent_activity": {
            if (sampleEmpty) return Promise.resolve([]);
            const now = Date.now();
            const sample = [
              ["Claude：把 roomlog 的抽取规则收敛成词表", "conversations", "claude", 2],
              ["合同第二版：付款节点与验收口径", "notes", "manual", 62],
              ["cargo test --manifest-path desktop/src-tauri/Cargo.toml", "clips", "terminal", 168],
              ["视觉改造三阶段：审计 → 改造 → 验收", "plans", "plan", 221],
              ["Codex：Tauri 打包签名失败的三种成因", "conversations", "codex", 1500],
              ["awwwards.com/sites/format — Obys × DES 版式实验", "clips", "browser", 1560],
            ];
            return Promise.resolve(sample.map(([name, cat, src, minsAgo], i) => ({
              name,
              path: '~/.gitmemo/' + cat + '/' + src + '/' + name.slice(0, 12).replace(/[\s:：]/g, '-') + '.md',
              category: cat,
              modified: new Date(now - minsAgo * 60000).toISOString(),
            })));
          }
          case "search_all":
            return Promise.resolve(sampleEmpty ? [] : sampleSearch);
          case "list_files_page": {
            const folder = String(args?.folder ?? "");
            if (sampleEmpty || !folder.startsWith("notes/")) {
              return Promise.resolve({ entries: [], total: 0, offset: 0, limit: 50, has_more: false });
            }
            return Promise.resolve({ entries: sampleNotes, total: sampleNotes.length, offset: 0, limit: 50, has_more: false });
          }
          case "frontend_loaded":
          case "plugin:event|unlisten":
            return Promise.resolve(null);
          case "plugin:event|listen":
            return Promise.resolve(1);
          default:
            return Promise.reject(new Error("design-screenshots stub: " + cmd));
        }
      },
    };
  })();`;
}

function loadLabels(locale) {
  const file = join(DESKTOP, "src", "locales", `${locale}.json`);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const nav = data.nav ?? {};
  const settings = data.settings ?? {};
  const missing = PAGES
    .filter((page) => page.nav.key && page.nav.key !== "plans" && !nav[page.nav.key])
    .map((page) => page.nav.key);
  if (missing.length) throw new Error(`locale ${locale} is missing nav labels: ${missing.join(", ")}`);
  if (!nav.plans) throw new Error(`locale ${locale} is missing nav.plans`);
  return { nav, settings };
}

// ------------------------------------------------------------------- capture

async function openPage(browser, viewport, opts, theme) {
  const { width, height } = VIEWPORTS[viewport];
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: opts.locale === "zh" ? "zh-CN" : "en-US",
    timezoneId: "UTC",
    acceptDownloads: false,
  });
  if (opts.stub) await context.addInitScript(backendStub(viewport, opts));
  // The product reads the theme from this key on boot; do not invent a switch.
  await context.addInitScript(
    ({ theme, locale }) => {
      localStorage.setItem("gitmemo-theme", theme);
      localStorage.setItem("gitmemo-locale", locale);
    },
    { theme, locale: opts.locale },
  );

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err).split("\n")[0]));

  await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
  await page.waitForSelector(".gm-app-shell", { timeout: opts.timeoutMs });
  if (!opts.stub) {
    const hasTauri = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
    if (!hasTauri) {
      process.stderr.write(`warning: ${viewport}: no Tauri backend in the browser — pages will show backend errors (use the default stub).\n`);
    }
  }
  await page.addStyleTag({ content: FREEZE_CSS });
  return { context, page, errors };
}

async function clickSidebar(page, label, opts) {
  if (!(await page.locator(".gm-sidebar").count())) {
    await page.locator(".gm-sidebar-boundary-toggle").click();
  }
  const item = page.locator(".gm-sidebar-nav").getByRole("button", { name: label, exact: true });
  if (!(await item.count())) throw new Error(`sidebar has no "${label}" entry`);
  await item.first().click();
}

async function clickMore(page, label, opts) {
  const toggle = page.locator(".gm-sidebar-more-toggle");
  if ((await toggle.getAttribute("data-open")) !== "true") await toggle.click();
  const item = page.locator(".gm-sidebar-more-group").getByRole("button", { name: label, exact: true });
  if (!(await item.count())) throw new Error(`More menu has no "${label}" entry`);
  await item.first().click();
}

async function navigateDesktop(page, route, labels, opts) {
  const nav = route.nav;

  if (nav.kind === "url") {
    await page.goto(`${opts.url}${nav.path}`, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    await page.waitForSelector(route.marker, { timeout: opts.timeoutMs });
    return page.locator(route.marker).first();
  }

  // Come back from a secondary window/route if the previous page was one.
  if (!(await page.locator(".gm-app-shell").count())) {
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    await page.waitForSelector(".gm-app-shell", { timeout: opts.timeoutMs });
  }

  if (nav.kind === "sidebar") {
    await clickSidebar(page, labels.nav[nav.key], opts);
  } else if (nav.kind === "more") {
    await clickMore(page, labels.nav[nav.key], opts);
  } else if (nav.kind === "tab") {
    await clickSidebar(page, labels.nav[nav.page], opts);
    const tab = page.getByRole("button", { name: labels.nav[nav.tab], exact: true });
    // The tab strip mounts with the page, so give it a moment instead of
    // querying in the same tick as the navigation click.
    await tab.first().waitFor({ state: "visible", timeout: opts.timeoutMs }).catch(() => {});
    if (!(await tab.count())) throw new Error(`no "${labels.nav[nav.tab]}" tab`);
    await tab.first().click();
  } else if (nav.kind === "settings-editor") {
    await clickMore(page, labels.nav.settings, opts);
    await page.waitForSelector(".gm-settings-page", { timeout: opts.timeoutMs });
    // Local folders are a settings sub-section, not a row on the index screen.
    const section = page.locator(".gm-settings-page").getByText(labels.settings.sectionIntegrations, { exact: true }).first();
    if (!(await section.count())) throw new Error("settings has no integrations section");
    await section.click();
    const row = page.locator(".gm-settings-row").filter({ hasText: labels.settings.localDirs }).first();
    if (!(await row.count())) throw new Error("settings has no local-dirs row");
    await row.getByRole("button", { name: labels.settings.open, exact: true }).first().click();
  } else {
    throw new Error(`unknown navigation kind: ${nav.kind}`);
  }

  const marker = route.marker
    ? page.locator('.gm-app-page-mount[data-active="true"]').locator(route.marker).first()
    : null;
  if (marker) await marker.waitFor({ state: "visible", timeout: opts.timeoutMs });
  return marker;
}

async function navigate(page, viewport, route, labels, opts) {
  if (opts.allPages) {
    const marker = await navigateDesktop(page, route, labels, opts);
    // The search page starts empty by design; type a query so the flat result
    // rows are actually rendered and the screenshots carry content.
    if (route.id === "search") {
      const input = page.locator(".gm-search-input");
      if (await input.count()) {
        await input.first().fill("claude");
        await input.first().press("Enter");
        await page.locator(".gm-search-result-card").first()
          .waitFor({ state: "visible", timeout: opts.timeoutMs }).catch(() => {});
      }
    }
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(250);
    return marker;
  }

  const label = labels.nav[route.navKey];
  let activeNav = null;

  if (viewport === "desktop") {
    await clickSidebar(page, label, opts);
    activeNav = page.locator('.gm-sidebar-nav-item[data-active="true"]').filter({ hasText: label }).first();
  } else {
    const tab = page.locator(".gm-bottom-nav-item").filter({ hasText: label });
    if (await tab.count()) {
      await tab.first().click();
      activeNav = page.locator('.gm-bottom-nav-item[data-active="true"]').filter({ hasText: label }).first();
    } else if (route.id === "search") {
      // The mobile tab bar has no search entry; the dashboard header owns it.
      await page.locator(".gm-bottom-nav-item").first().click();
      await page.waitForSelector(".gm-inst-dashboard", { timeout: opts.timeoutMs });
      const entry = page.locator(`.gm-inst-dashboard button[title="${label}"]`);
      if (!(await entry.count())) throw new Error(`dashboard header has no "${label}" entry`);
      await entry.first().click();
    } else {
      throw new Error(`no mobile navigation entry for route "${route.id}"`);
    }
  }

  if (activeNav) await activeNav.waitFor({ state: "visible", timeout: opts.timeoutMs });

  const marker = route.marker
    ? page.locator('.gm-app-page-mount[data-active="true"]').locator(route.marker).first()
    : null;
  if (marker) await marker.waitFor({ state: "visible", timeout: opts.timeoutMs });

  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
  return marker;
}

async function capture(page, file) {
  await page.screenshot({ path: file, animations: "disabled", caret: "hide", scale: "css" });
  const buf = readFileSync(file);
  return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
}

async function runCapture(opts) {
  const labels = loadLabels(opts.locale);
  const { pw, version: pwVersion } = await resolvePlaywright();
  const { browser, fallback } = await launchChromium(pw.chromium);

  if (opts.stub) {
    process.stdout.write("note: Tauri backend stubbed in-page — screenshots show real empty states, not live data.\n");
  }
  if (fallback) {
    process.stdout.write(`note: bundled Chromium for playwright ${pwVersion} missing, using ${fallback}\n`);
  }

  const catalogue = opts.allPages ? PAGES : ROUTES;
  const startedAt = new Date().toISOString();
  const shots = [];
  const errorsByRoute = [];

  try {
    for (const theme of opts.themes) {
      for (const viewport of opts.viewports) {
        const dir = join(opts.out, opts.themeDirs ? theme : VIEWPORTS[viewport].dir);
        mkdirSync(dir, { recursive: true });
        const { context, page, errors } = await openPage(browser, viewport, opts, theme);
        try {
          for (const routeId of opts.routes) {
            const route = catalogue.find((r) => r.id === routeId);
            if (!route) throw new Error(`unknown capture target: ${routeId}`);
            await navigate(page, viewport, route, labels, opts);
            const file = join(dir, `${route.id}.png`);
            const { sha256, bytes } = await capture(page, file);
            shots.push({
              route: route.id,
              viewport,
              theme,
              width: VIEWPORTS[viewport].width,
              height: VIEWPORTS[viewport].height,
              file: `${opts.themeDirs ? theme : VIEWPORTS[viewport].dir}/${route.id}.png`,
              sha256,
              bytes,
            });
            const label = theme === "dark" ? viewport : `${viewport}/${theme}`;
            process.stdout.write(`  ${label.padEnd(15)} ${route.id.padEnd(17)} ${String(bytes).padStart(7)} B  ${sha256.slice(0, 12)}\n`);
          }
        } catch (err) {
          errorsByRoute.push({ viewport: `${viewport}/${theme}`, message: err.message.split("\n")[0] });
        } finally {
          if (errors.length) errorsByRoute.push({ viewport: `${viewport}/${theme}`, message: `page errors: ${errors.slice(0, 3).join(" | ")}` });
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  // A partial run must not erase the rest of the baseline; merge instead.
  const expected = opts.themes.length * opts.viewports.length * opts.routes.length;
  const partial = shots.length < expected;
  let mergedShots = shots;
  if (partial && existsSync(join(opts.out, MANIFEST))) {
    try {
      const previous = JSON.parse(readFileSync(join(opts.out, MANIFEST), "utf8"));
      const keyOf = (s) => `${s.theme || "dark"}/${s.viewport}/${s.route}`;
      const fresh = new Set(shots.map(keyOf));
      mergedShots = [...previous.shots.filter((s) => !fresh.has(keyOf(s))), ...shots];
    } catch { /* unreadable manifest: replace it */ }
  }

  const manifest = {
    generatedAt: startedAt,
    partial,
    tool: "scripts/design-screenshots.mjs",
    playwright: pwVersion,
    chromiumFallback: fallback ? "cache" : null,
    mode: opts.allPages ? "pages" : "routes",
    themes: opts.themes,
    locale: opts.locale,
    backendStub: opts.stub,
    viewports: opts.viewports,
    routes: opts.routes,
    shots: mergedShots,
  };
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(join(opts.out, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  if (errorsByRoute.length) {
    for (const e of errorsByRoute) process.stderr.write(`error (${e.viewport}): ${e.message}\n`);
    throw new Error("capture incomplete — see errors above");
  }
  return manifest;
}

// ---------------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`design-screenshots: ${err.message}\n\nRun with --help for usage.\n`);
    return 2;
  }
  if (opts.help) {
    printHelp();
    return 0;
  }

  let server = null;
  try {
    if (!opts.url) {
      process.stdout.write(`starting vite dev server on port ${opts.port}…\n`);
      server = await startDevServer(opts);
      opts.url = server.url;
    }

    if (opts.compare) {
      const manifestPath = join(opts.out, MANIFEST);
      if (!existsSync(manifestPath)) {
        process.stderr.write(`design-screenshots: nothing to compare against (${manifestPath} missing)\n`);
        return 2;
      }
      const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
      const allShots = [...previous.shots];
      rmSync(join(opts.out, MANIFEST), { force: true });
      const fresh = await runCapture(opts);
      writeFileSync(join(opts.out, MANIFEST), `${JSON.stringify({ ...fresh, comparedWith: previous.generatedAt }, null, 2)}\n`);

      const keyOf = (s) => `${s.theme || "dark"}/${s.viewport}/${s.route}`;
      const prevMap = new Map(allShots.map((s) => [keyOf(s), s]));
      const diffs = fresh.shots.filter((s) => prevMap.get(keyOf(s))?.sha256 !== s.sha256);
      if (diffs.length === 0) {
        process.stdout.write(`identical to previous run (${previous.generatedAt}) — ${fresh.shots.length} screenshots\n`);
        return 0;
      }
      process.stdout.write(`changed screenshots vs ${previous.generatedAt}:\n`);
      for (const s of diffs) process.stdout.write(`  ${s.theme || "dark"}/${s.viewport}/${s.route}  ${s.file}\n`);
      return 1;
    }

    await runCapture(opts);
    process.stdout.write(`baseline written to ${opts.out}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`design-screenshots: ${err.message}\n`);
    return 2;
  } finally {
    await stopDevServer(server);
  }
}

export {
  startDevServer,
  stopDevServer,
  resolvePlaywright,
  launchChromium,
  backendStub,
  loadLabels,
  navigate,
  VIEWPORTS,
  PAGES,
  ROUTES,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exit(code); });
}

