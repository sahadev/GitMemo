#!/usr/bin/env node
/**
 * design-token-scan.mjs
 *
 * Measures design-token drift in GitMemo Desktop's frontend.
 *
 * Scans every .tsx and .css file under desktop/src and reports four kinds of
 * violations against the token ladders declared in desktop/src/index.css:
 *
 *   font-size   font sizes that are not on the --gm-font-* ladder
 *   spacing     margin / padding / gap values that are not on the --gm-space-* ladder
 *   color       hard-coded hex / rgb() / hsl() colours written in components
 *               (custom property definitions in .css are excluded, because that
 *               is where tokens are *supposed* to be declared)
 *   important   `!important` usage anywhere in .tsx / .css
 *
 * Usage:
 *   node scripts/design-token-scan.mjs                 # summary only
 *   node scripts/design-token-scan.mjs --detail        # summary + file:line detail
 *   node scripts/design-token-scan.mjs --json           # machine readable
 *   node scripts/design-token-scan.mjs --only=color
 *   node scripts/design-token-scan.mjs --max-detail=20
 *
 * Exit codes:
 *   0  clean — no violations found
 *   1  violations found (safe to use as a CI gate)
 *   2  bad invocation or unreadable input
 *
 * No dependencies, Node >= 20.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DEFAULT_ROOT = join(REPO_ROOT, "desktop", "src");
const TOKEN_CSS = join(REPO_ROOT, "desktop", "src", "index.css");

// Fallback ladders, used only when index.css cannot be parsed.
const FONT_FALLBACK = [11, 12, 13, 15, 17, 20, 24];
const SPACE_FALLBACK = [0, 2, 4, 8, 12, 16, 24, 32];

const RULES = ["font-size", "font-weight", "spacing", "color", "tsx-color", "hover", "important"];
const RULE_LABEL = {
  "font-size": "off-ladder font size",
  "font-weight": "off-ladder font weight (400/650/720)",
  spacing: "off-ladder spacing",
  hover: "transition without :hover",
  color: "hard-coded colour (index.css)",
  "tsx-color": "hard-coded colour (.tsx)",
  important: "!important",
};
const RULE_LAYER = {
  "font-size": "structure",
  "font-weight": "structure",
  hover: "structure",
  spacing: "structure",
  important: "structure",
  color: "skin",
  "tsx-color": "skin",
};

const FONT_WEIGHTS = new Set([400, 650, 720]);

const CSS_FONT_SIZE_KEYWORDS = new Set([
  "inherit", "initial", "unset", "revert", "revert-layer",
  "xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large",
  "larger", "smaller",
]);

const SPACING_PROP =
  /^(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end|start|end))?$/;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    root: DEFAULT_ROOT,
    detail: false,
    json: false,
    maxDetail: Infinity,
    only: new Set(RULES),
    failOnViolations: true,
    exempt: true,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--detail") { opts.detail = true; continue; }
    if (arg === "--summary") { opts.detail = false; continue; }
    if (arg === "--json") { opts.json = true; opts.detail = true; continue; }
    if (arg === "--no-fail") { opts.failOnViolations = false; continue; }
    if (arg === "--no-exempt") { opts.exempt = false; continue; }
    if (arg.startsWith("--root=")) { opts.root = resolve(process.cwd(), arg.slice(7)); continue; }
    if (arg.startsWith("--max-detail=")) {
      const n = Number(arg.slice(13));
      if (!Number.isFinite(n) || n < 0) throw new Error(`bad --max-detail value: ${arg}`);
      opts.maxDetail = n;
      continue;
    }
    if (arg.startsWith("--only=")) {
      const wanted = arg.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = wanted.filter((r) => !RULES.includes(r));
      if (unknown.length) throw new Error(`unknown rule(s): ${unknown.join(", ")} (valid: ${RULES.join(", ")})`);
      opts.only = new Set(wanted);
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function printHelp() {
  process.stdout.write(`design-token-scan — measure design-token drift in desktop/src

Usage
  node scripts/design-token-scan.mjs [options]

Options
  --detail            print a file:line:col line for every violation
  --max-detail=<n>    cap the detail list at n entries (default: no cap)
  --json              print a machine-readable report (implies --detail)
  --only=<rules>      comma-separated subset of: ${RULES.join(", ")}
  --root=<dir>        scan another directory (default: desktop/src)
  --no-exempt         count print / reduced-motion blocks too (raw view)
  --no-fail           always exit 0 (report only, no CI gate)
  --summary           summary only (default)
  -h, --help          show this help

What counts as a violation
  font-size   font-size literals not on the --gm-font-* ladder; also Tailwind
              text-[13px] arbitrary values and inline fontSize: 13
  spacing     margin/padding/gap literals not on the --gm-space-* ladder;
              also Tailwind p-[13px] / m-[7px] / gap-[10px] and inline styles
  color       #hex / rgb() / hsl() in index.css outside a custom-property
              definition (token definitions are where colours belong)
  tsx-color   any #hex / rgb() / hsl() in a .tsx file, hard failure: the
              light skin can only work if components take colours from vars
  important   every !important

  The report is split into two layers:
    structure   font-size, spacing, !important
    skin        color (index.css), tsx-color (components)

  Values expressed with var(), calc() or clamp() are treated as computed and
  are not flagged. Keywords (inherit, auto, ...) and percentages are allowed.

  Exempt (counted separately, not part of the headline number):
    @media print { ... }
    @media (prefers-reduced-motion: reduce) { ... }
    #gitmemo-print-root and .gitmemo-print-* blocks
    .markdown-body, the reading surface (sizes are em, relative to the
      container, so prose proportions follow the user's base size)
    any declaration marked `/* design-scan: constant - <reason> */`
      (component-local size constants listed in desktop/src/index.css)
  Print output and reduced-motion overrides are supposed to win with
  !important and literal pt/hex values; the docs treat them as an exempt zone.
  Everything else, including a selector-specificity !important, still counts.

Exit codes
  0 clean   1 violations found   2 bad invocation

Examples
  node scripts/design-token-scan.mjs
  node scripts/design-token-scan.mjs --detail --max-detail=15
  node scripts/design-token-scan.mjs --only=font-size,spacing --json > /tmp/tokens.json
`);
}

// ---------------------------------------------------------------- utilities

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if ([".tsx", ".css"].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

/** Blank out block comments and line-leading `//` comments, preserving offsets. */
function stripComments(text) {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlocks
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? line.replace(/[^\n]/g, " ") : line))
    .join("\n");
}

function makeLocator(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: index - starts[lo] + 1 };
  };
}

function snippetOf(text, index, max = 120) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  let lineEnd = text.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd).trim().replace(/\s+/g, " ");
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function displayPath(file, base) {
  const rel = relative(base, file);
  if (!rel || rel.startsWith("..")) return file;
  return rel.split(sep).join("/");
}

// -------------------------------------------------------------- token ladder

function loadLadders(cssPath) {
  const result = {
    font: new Set(FONT_FALLBACK),
    space: new Set(SPACE_FALLBACK),
    source: null,
  };
  try {
    const css = readFileSync(cssPath, "utf8");
    const font = new Set();
    const space = new Set();
    for (const m of css.matchAll(/--gm-font-[a-z0-9-]+\s*:\s*(-?\d+(?:\.\d+)?)px/g)) {
      font.add(Number(m[1]));
    }
    for (const m of css.matchAll(/--gm-space-\d+\s*:\s*(-?\d+(?:\.\d+)?)(?:px)?\s*;/g)) {
      space.add(Number(m[1]));
    }
    if (font.size) result.font = font;
    if (space.size) result.space = space;
    result.source = cssPath;
  } catch {
    result.source = null;
  }
  return result;
}

// ------------------------------------------------------------------ scanning

function scanCssFile(file, text, ladders, enabled, loc, push, exemptLines, constantLines) {
  const isExemptAt = (lineNumber) => Boolean(
    (exemptLines && exemptLines[lineNumber - 1])
    || (constantLines && constantLines.has(lineNumber)),
  );
  const lines = text.split("\n");
  let offset = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = offset;
    const rawLine = lines[i];
    offset += rawLine.length + 1;

    // A rule may start mid-line (`@media (...) { .a { padding: 7px } }`), so
    // only the text after the last `{` can hold declarations.
    const brace = rawLine.lastIndexOf("{");
    let body = brace >= 0 ? rawLine.slice(brace + 1) : rawLine;
    let bodyStart = lineStart + (brace >= 0 ? brace + 1 : 0);

    if (!body.trim()) continue;

    // Multi-line values: keep appending while parentheses are unbalanced.
    let lookahead = i + 1;
    let guard = 0;
    while (
      lookahead < lines.length
      && guard < 8
      && (body.match(/\(/g) ?? []).length > (body.match(/\)/g) ?? []).length
    ) {
      body = `${body} ${lines[lookahead].trim()}`;
      offset += lines[lookahead].length + 1;
      lookahead += 1;
      guard += 1;
    }
    i = lookahead - 1;

    // Drop closing braces / trailing selector fragments.
    body = body.replace(/}\s*$/, "");

    let cursor = 0;
    for (const part of body.split(";")) {
      const partStart = bodyStart + cursor;
      cursor += part.length + 1;
      const decl = part.trim();
      if (!decl || !decl.includes(":")) continue;

      const colon = part.indexOf(":");
      const prop = part.slice(0, colon).trim();
      const value = part.slice(colon + 1).trim();
      if (!prop || /[\s.,#&[\]()>+~*]/.test(prop)) continue;

      const isCustomProperty = prop.startsWith("--");
      const at = partStart + part.indexOf(":");
      const position = loc(at);
      const exempt = isExemptAt(position.line);

      if (enabled.has("font-size") && prop === "font-size") {
        const verdict = checkFontSizeValue(value, ladders.font);
        if (verdict) {
          push({
            rule: "font-size",
            file,
            ...position,
            exempt,
            value: verdict,
            snippet: snippetOf(text, partStart),
          });
        }
      }

      if (enabled.has("font-weight") && prop === "font-weight") {
        const weight = value.trim();
        if (/^\d+$/.test(weight) && !FONT_WEIGHTS.has(Number(weight))) {
          push({
            rule: "font-weight",
            file,
            ...position,
            exempt,
            value: weight,
            snippet: snippetOf(text, partStart),
          });
        }
      }

      if (enabled.has("spacing") && SPACING_PROP.test(prop)) {
        for (const verdict of checkSpacingValue(value, ladders.space)) {
          push({
            rule: "spacing",
            file,
            ...position,
            exempt,
            value: `${verdict} (${prop})`,
            snippet: snippetOf(text, partStart),
          });
        }
      }

      // Token declarations are allowed to contain colour literals.
      if (enabled.has("color") && !isCustomProperty) {
        const colour = findColorLiteral(value);
        if (colour) {
          push({
            rule: "color",
            file,
            ...position,
            exempt,
            value: colour,
            snippet: snippetOf(text, partStart),
          });
        }
      }
    }
  }
}

function scanTsxFile(file, text, ladders, enabled, loc, push) {
  const pushAt = (index, rule, value) => push({
    rule,
    file,
    ...loc(index),
    value,
    snippet: snippetOf(text, index),
  });

  if (enabled.has("font-size")) {
    for (const m of text.matchAll(/\btext-\[([^\]\s]{1,40})\]/g)) {
      // `text-[#fff]` / `text-[var(--x)]` are colour utilities, not sizes.
      if (!/^-?\d*\.?\d+\s*(?:px|rem|em|pt|%)$/.test(m[1].toLowerCase())) continue;
      const verdict = checkFontSizeValue(m[1], ladders.font, { tailwind: true });
      if (verdict) pushAt(m.index + m[0].indexOf("[") + 1, "font-size", `text-[${m[1]}]`);
    }
    for (const m of text.matchAll(/\bfontSize\s*:\s*(?:"([^"]{1,40})"|'([^']{1,40})'|(-?\d+(?:\.\d+)?))/g)) {
      const raw = m[1] ?? m[2] ?? (m[3] !== undefined ? `${m[3]}px` : null);
      if (!raw) continue;
      const verdict = checkFontSizeValue(raw, ladders.font, { inline: true });
      if (verdict) pushAt(m.index, "font-size", `fontSize: ${raw}`);
    }
  }

  if (enabled.has("spacing")) {
    for (const m of text.matchAll(
      /\b(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-\[([^\]\s]{1,40})\]/g,
    )) {
      const verdicts = checkSpacingValue(m[1], ladders.space, { tailwind: true });
      if (verdicts.length) pushAt(m.index, "spacing", `${m[0]}`);
    }
    for (const m of text.matchAll(
      /\b(?:margin|padding|gap)(?:Top|Right|Bottom|Left|X|Y)?\s*:\s*(?:"([^"]{1,40})"|'([^']{1,40})'|(-?\d+(?:\.\d+)?))/g,
    )) {
      const raw = m[1] ?? m[2] ?? (m[3] !== undefined ? `${m[3]}px` : null);
      if (!raw) continue;
      const verdicts = checkSpacingValue(raw, ladders.space, { inline: true });
      if (verdicts.length) pushAt(m.index, "spacing", `${m[0].split(":")[0]}: ${raw}`);
    }
  }

  if (enabled.has("color") || enabled.has("tsx-color")) {
    const colourRe = /(?<!url\()#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;
    for (const m of text.matchAll(colourRe)) pushAt(m.index, "tsx-color", m[0]);
  }
}

function findColorLiteral(value) {
  const hex = value.match(/(?<!url\()#[0-9a-fA-F]{3,8}\b/);
  if (hex) return hex[0];
  const fn = value.match(/\b(?:rgba?|hsla?)\([^)]*\)/);
  if (fn) return fn[0];
  return null;
}

/** Returns a reason string when the font size is off-ladder, otherwise null. */
function checkFontSizeValue(rawValue, ladder, ctx = {}) {
  const value = String(rawValue).trim().toLowerCase();
  if (!value) return null;
  if (/^(?:var|calc|clamp)\(/.test(value)) return null; // computed, not a literal
  if (CSS_FONT_SIZE_KEYWORDS.has(value)) return null;

  const token = value.match(/(-?\d*\.?\d+)\s*(px|rem|em|pt|%|vh|vw|ch|ex)?/);
  if (!token) return null;
  const num = Number(token[1]);
  const unit = token[2] ?? (ctx.inline ? "px" : "");
  if (!Number.isFinite(num)) return null;

  if (unit === "%" || unit === "vh" || unit === "vw" || unit === "ch" || unit === "ex") return null;
  if (unit === "px" && ladder.has(num)) return null;

  const ladderText = [...ladder].sort((a, b) => a - b).join(", ");
  const where = unit === "px" ? `${num}px` : `${num}${unit || ""}`;
  return `${where} not in {${ladderText}}px`;
}

/** Returns every off-ladder length found in a spacing value. */
function checkSpacingValue(rawValue, ladder, ctx = {}) {
  let value = String(rawValue).trim().toLowerCase();
  if (!value) return [];
  // Strip computed segments; we only police literals written by hand.
  for (let guard = 0; guard < 4; guard += 1) {
    const before = value;
    value = value.replace(/\b(?:calc|clamp|var|env|min|max)\([^()]*\)/g, " ");
    if (before === value) break;
  }
  if (/^(?:auto|inherit|initial|unset|revert|revert-layer)$/.test(value)) return [];
  if (!/px|rem|em|pt|^\s*-?\d*\.?\d+\s*$/.test(value) && !ctx.inline) return [];

  const out = [];
  for (const m of value.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em|pt)?/g)) {
    const num = Math.abs(Number(m[1]));
    const unit = m[2] ?? "px";
    if (!Number.isFinite(num)) continue;
    if (num === 0) continue;
    if (unit === "px" && ladder.has(num)) continue;
    out.push(`${m[1]}${m[2] ?? ""}`);
  }
  return out;
}

// 交互态：transition 存在但同级选择器没有 :hover 规则 —— 过渡空转，等于 hover 无反馈。
// 只比对「同一个类」，且忽略只做 transform/opacity 动画的类（开关滑块之类靠状态属性驱动）。
function scanInteraction(text, loc, push) {
  const rules = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, " "), body: m[2], index: m.index }));
  // 输入控件的过渡服务于 focus 而非 hover，不参与这条规则
  const isFormControl = (cls) => /-(input|textarea|select|field)$/.test(cls);
  const transitioned = new Map();
  const hovered = new Set();
  for (const rule of rules) {
    for (const part of rule.selector.split(",")) {
      const sel = part.trim();
      const single = sel.match(/^(\.gm-[a-z0-9-]+)$/);
      if (single && !isFormControl(single[1]) && /transition:[^;]*\b(background|border-color|color)\b/.test(rule.body)) {
        transitioned.set(single[1], rule.index);
      }
      // :hover 可能写在复合选择器里（`:hover:not(:disabled)`、`[data-x]:hover`），
      // 只要这一条里出现了 :hover，就认为它命中的类都有 hover 态。
      if (sel.includes(":hover")) {
        for (const hit of sel.matchAll(/\.gm-[a-z0-9-]+/g)) hovered.add(hit[0]);
      }
    }
  }
  for (const [cls, index] of transitioned) {
    if (hovered.has(cls)) continue;
    const position = loc(index);
    push({
      rule: "hover",
      file: "desktop/src/index.css",
      ...position,
      exempt: false,
      value: `${cls} 有 transition 无 :hover`,
      snippet: snippetOf(text, index),
    });
  }
}

// --------------------------------------------------------------- exemptions

function isExemptPrelude(prelude) {
  return /^@media\b[^{]*\bprint\b/i.test(prelude)
    || /^@media\b[^{]*prefers-reduced-motion\s*:\s*reduce/i.test(prelude)
    || /#gitmemo-print-root|\.gitmemo-print-/.test(prelude)
    || /\.markdown-body\b/.test(prelude);
}

/** Marks every line that sits inside a print or reduced-motion block. */
function computeExemptLines(text) {
  const lineCount = text.split("\n").length;
  const flags = new Uint8Array(lineCount);
  const stack = [];
  let line = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") { line += 1; continue; }
    if (ch === "{") {
      const start = Math.max(
        text.lastIndexOf("}", i),
        text.lastIndexOf(";", i),
        text.lastIndexOf("{", i - 1),
      ) + 1;
      const prelude = text.slice(start, i).trim();
      const inherited = stack.length ? stack[stack.length - 1] : false;
      const exempt = inherited || isExemptPrelude(prelude);
      stack.push(exempt);
      if (exempt) flags[line] = 1;
    } else if (ch === "}") {
      stack.pop();
    } else if (stack.length && stack[stack.length - 1]) {
      flags[line] = 1;
    }
  }
  return flags;
}

// -------------------------------------------------------------------- report

function printSummary(report, opts) {
  const byRule = report.counts;
  const rawByRule = report.countsRaw ?? report.counts;
  const total = Object.values(byRule).reduce((sum, n) => sum + n, 0);
  const rawTotal = Object.values(rawByRule).reduce((sum, n) => sum + n, 0);
  const out = [];

  out.push(`design-token-scan — ${report.rootLabel}`);
  out.push(
    `files: ${report.files.total} (${report.files.tsx} .tsx, ${report.files.css} .css)`
    + `   ladders: ${report.ladders.font.length} font / ${report.ladders.space.length} space`
    + `${report.ladders.sourceLabel ? ` (${report.ladders.sourceLabel})` : " (fallback)"}`,
  );
  out.push("");

  const groups = [
    { id: "structure", label: "结构层" },
    { id: "skin", label: "皮肤层" },
  ];
  for (const group of groups) {
    const rules = RULES.filter((rule) => RULE_LAYER[rule] === group.id && opts.only.has(rule));
    if (!rules.length) continue;
    out.push(`  ${group.label}`);
    let subtotal = 0;
    for (const rule of rules) {
      const count = byRule[rule] ?? 0;
      const raw = rawByRule[rule] ?? count;
      subtotal += count;
      const extra = opts.exempt && raw !== count ? `  (raw ${raw})` : "";
      out.push(`    ${rule.padEnd(12)} ${String(count).padStart(4)}  ${RULE_LABEL[rule]}${extra}`);
    }
    out.push(`    ${"subtotal".padEnd(12)} ${String(subtotal).padStart(4)}`);
  }

  out.push(`  ${"-".repeat(10)}`);
  out.push(`  ${"raw".padEnd(10)} ${String(rawTotal).padStart(4)}  all matches`);
  if (opts.exempt) {
    out.push(`  ${"exempt".padEnd(10)} ${String(report.exemptTotal).padStart(4)}  @media print / reduced-motion / #gitmemo-print-root`);
    out.push(`  ${"effective".padEnd(10)} ${String(total).padStart(4)}  ${total ? "violations — exit 1" : "clean — exit 0"}`);
  } else {
    out.push(`  ${"total".padEnd(10)} ${String(total).padStart(4)}  ${total ? "violations — exit 1" : "clean — exit 0"}`);
  }

  if (opts.detail && report.violations.length) {
    out.push("");
    const shown = Number.isFinite(opts.maxDetail) ? report.violations.slice(0, opts.maxDetail) : report.violations;
    for (const v of shown) {
      const mark = v.exempt ? " [exempt]" : "";
      out.push(`  ${v.path}:${v.line}:${v.column}  [${v.rule}]${mark} ${v.value}`);
    }
    if (shown.length < report.violations.length) {
      out.push(`  … ${report.violations.length - shown.length} more (raise --max-detail)`);
    }
  }

  process.stdout.write(`${out.join("\n")}\n`);
}

// ---------------------------------------------------------------------- main

function main() {
  let opts;
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      printHelp();
      process.exit(0);
    }
    opts = parsed;
  } catch (err) {
    process.stderr.write(`design-token-scan: ${err.message}\n\n` + "Run with --help for usage.\n");
    process.exit(2);
  }

  let files;
  try {
    if (!statSync(opts.root).isDirectory()) throw new Error("not a directory");
    files = walk(opts.root);
  } catch (err) {
    process.stderr.write(`design-token-scan: cannot scan ${opts.root} (${err.message})\n`);
    process.exit(2);
  }

  const ladders = loadLadders(TOKEN_CSS);
  const violations = [];
  const push = (v) => violations.push(v);
  const counts = Object.fromEntries(RULES.map((r) => [r, 0]));
  let tsxCount = 0;
  let cssCount = 0;

  for (const file of files) {
    let text;
    let constantLines = null;
    try {
      const raw = readFileSync(file, "utf8");
      constantLines = new Set(
        raw.split("\n")
          .map((line, i) => (/design-scan:\s*constant/.test(line) ? i + 1 : 0))
          .filter(Boolean),
      );
      text = stripComments(raw);
    } catch (err) {
      process.stderr.write(`design-token-scan: skipping ${file} (${err.message})\n`);
      continue;
    }
    const loc = makeLocator(text);
    const isTsx = extname(file) === ".tsx";
    if (isTsx) tsxCount += 1;
    else cssCount += 1;

    const exemptLines = isTsx || !opts.exempt ? null : computeExemptLines(text);
    const marked = opts.exempt ? constantLines : null;

    if (isTsx) scanTsxFile(file, text, ladders, opts.only, loc, push);
    else {
      scanCssFile(file, text, ladders, opts.only, loc, push, exemptLines, marked);
      if (opts.only.has("hover")) scanInteraction(text, loc, push);
    }

    if (opts.only.has("important")) {
      for (const m of text.matchAll(/!\s*important/gi)) {
        const position = loc(m.index);
        push({
          rule: "important",
          file,
          ...position,
          exempt: Boolean(exemptLines && exemptLines[position.line - 1]),
          value: "!important",
          snippet: snippetOf(text, m.index),
        });
      }
    }
  }

  const countsRaw = Object.fromEntries(RULES.map((r) => [r, 0]));
  for (const v of violations) {
    countsRaw[v.rule] += 1;
    // --no-exempt 看的是原始视图：豁免项也必须计入，否则参数只改了表头、没改数字
    if (!v.exempt || !opts.exempt) counts[v.rule] += 1;
  }
  const effective = opts.exempt ? violations.filter((v) => !v.exempt) : violations;
  const exemptTotal = opts.exempt ? violations.length - effective.length : 0;
  violations.sort((a, b) => (a.file === b.file
    ? a.line - b.line || a.column - b.column
    : a.file.localeCompare(b.file)));

  const displayBase = resolve(opts.root, "..", "..");
  const report = {
    root: opts.root,
    rootLabel: displayPath(opts.root, REPO_ROOT) || ".",
    files: { total: files.length, tsx: tsxCount, css: cssCount, list: files.map((f) => displayPath(f, REPO_ROOT)) },
    ladders: {
      font: [...ladders.font].sort((a, b) => a - b),
      space: [...ladders.space].sort((a, b) => a - b),
      source: ladders.source,
      sourceLabel: ladders.source ? displayPath(ladders.source, REPO_ROOT) : null,
    },
    counts,
    countsRaw,
    exemptTotal,
    violations: violations.map((v) => ({ ...v, path: displayPath(v.file, REPO_ROOT), file: undefined })),
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printSummary(report, opts);
  }

  const hasViolations = effective.length > 0;
  process.exit(hasViolations && opts.failOnViolations ? 1 : 0);
}

main();
