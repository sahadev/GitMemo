#!/usr/bin/env node
// 按 docs/design/LANGUAGE.md 的规则扫描 desktop/src，输出候选违规。
// 用法：
//   node scripts/audit_design_language.mjs           # 打印报告，退出码 0
//   node scripts/audit_design_language.mjs --strict  # 有任何违规则退出码 1
//   node scripts/audit_design_language.mjs --json    # 机器可读输出

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "desktop/src");

const ALLOWED_SPACE_PX = new Set([0, 2, 4, 8, 12, 16, 24, 32]);
const ALLOWED_RADIUS_PX = new Set([0, 2, 4, 6, 8, 999]);
const ALLOWED_WEIGHTS = new Set([400, 650, 720]);
const ALLOWED_DURATIONS = new Set(["0s", "0.01ms", "150ms", "0.15s", "200ms", "0.2s"]);
const ALLOWED_FONT_PX = new Set([11, 12, 13, 15, 17, 20, 24]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

// 允许存在的例外，每条都写明理由，不要在报告里当违规统计。
const IGNORE = [
  { file: "desktop/src/components/base/AppIcon.tsx", reason: "tone 类型定义，LANGUAGE §3.5 允许保留以便过渡" },
];
const SKIP_LINE = /^\s*(--|\/\/|\*|\/\*)/;

const rules = [
  {
    id: "T1",
    level: "J",
    title: "字号字面量（应全部走 --gm-font-*）",
    ref: "LANGUAGE §1.1 / 反面 16",
    test: (line, ext) =>
      ext === "css" && /font-size:\s*[0-9.]+px/.test(line)
        ? line.match(/font-size:\s*[0-9.]+px/)[0]
        : null,
  },
  {
    id: "T2",
    level: "S",
    title: "使用 --gm-font-xs（12px，与正文 13px 只差 1px，属迁移中间态）",
    ref: "LANGUAGE §1.1",
    test: (line) => (line.includes("--gm-font-xs") ? "--gm-font-xs" : null),
  },
  {
    id: "T3",
    level: "J",
    title: "白名单外的字重（只允许 400 / 650 / 720）",
    ref: "LANGUAGE §1.2 / 反面 2",
    test: (line) => {
      const m = line.match(/font-weight:\s*(\d+)/);
      return m && !ALLOWED_WEIGHTS.has(Number(m[1])) ? `font-weight: ${m[1]}` : null;
    },
  },
  {
    id: "T4",
    level: "J",
    title: "间距字面量（padding/margin/gap 只用 --gm-space-* 覆盖的 8 档）",
    ref: "LANGUAGE §2.2 / 反面 16",
    test: (line, ext) => {
      if (ext !== "css") return null;
      const m = line.match(/(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?:\s*([^;]+);/);
      if (!m) return null;
      if (m[1].includes("var(") || m[1].includes("calc(")) return null;
      const px = [...m[1].matchAll(/(-?[0-9.]+)px/g)].map((x) => Math.abs(Number(x[1])));
      const bad = px.filter((v) => !ALLOWED_SPACE_PX.has(v));
      return bad.length ? `间距 ${bad.join("/")}px 无对应 token` : null;
    },
  },
  {
    id: "T5",
    level: "J",
    title: "圆角字面量（只用 --gm-radius-* 的 0/2/4/6/8/999）",
    ref: "LANGUAGE 反面 12",
    test: (line, ext) => {
      if (ext !== "css") return null;
      const m = line.match(/border-radius:\s*([^;]+);/);
      if (!m || m[1].includes("var(")) return null;
      const px = [...m[1].matchAll(/([0-9.]+)px/g)].map((x) => Number(x[1]));
      const bad = px.filter((v) => !ALLOWED_RADIUS_PX.has(v));
      return bad.length ? `圆角 ${bad.join("/")}px` : null;
    },
  },
  {
    id: "T6",
    level: "J",
    title: "动效时长或缓动不在白名单（只允许 150ms / 200ms + ease）",
    ref: "LANGUAGE §4.1 / 反面 15",
    test: (line, ext) => {
      if (ext !== "css") return null;
      if (/transition:\s*all\b/.test(line)) return "transition: all";
      if (/cubic-bezier/.test(line)) return "自定义 cubic-bezier";
      if (!/transition/.test(line)) return null;
      const times = [...line.matchAll(/([0-9.]+m?s)\b/g)].map((x) => x[1]);
      const bad = times.filter((t) => !ALLOWED_DURATIONS.has(t));
      return bad.length ? `时长 ${[...new Set(bad)].join("/")}` : null;
    },
  },
  {
    id: "T7",
    level: "J",
    title: "无限循环动画（只允许加载指示器）",
    ref: "LANGUAGE §4.2 / 反面 14",
    test: (line) => (/animation[^;]*infinite/.test(line) && !/animation:\s*spin\b/.test(line) ? "infinite 动画" : null),
  },
  {
    id: "T8",
    level: "J",
    title: "奥运五色作为分类身份色（应统一 tone=\"muted\"）",
    ref: "LANGUAGE §3.5 / 反面 4",
    test: (line) => (line.includes("olympic-") ? "olympic-* 分类色" : null),
  },
  {
    id: "T9",
    level: "J",
    title: "非 0 letter-spacing / 全大写标签",
    ref: "LANGUAGE 反面 11",
    test: (line, ext) => {
      if (ext !== "css") return null;
      const m = line.match(/letter-spacing:\s*([^;]+);/);
      return m && !/^0(px)?$/.test(m[1].trim()) ? `letter-spacing: ${m[1].trim()}` : null;
    },
  },
  {
    id: "T10",
    level: "S",
    title: "max-width 字面量（应引用已存在的 --gm-size-*）",
    ref: "LANGUAGE §2.3",
    test: (line, ext) => {
      if (ext !== "css") return null;
      const m = line.match(/max-width:\s*([^;]+);/);
      if (!m || m[1].includes("var(") || m[1].includes("%")) return null;
      return /[0-9.]+px/.test(m[1]) ? `max-width: ${m[1].trim()}` : null;
    },
  },
  {
    id: "T11",
    level: "S",
    title: "字号 token 落在白名单外（--gm-font-md 只允许对话框与移动页标题）",
    ref: "LANGUAGE §1.1",
    test: (line) => (line.includes("--gm-font-md") ? "--gm-font-md" : null),
  },
];

const findings = new Map(rules.map((r) => [r.id, []]));

for (const file of files) {
  const ext = file.endsWith(".css") ? "css" : "tsx";
  const rel = relative(ROOT, file);
  if (IGNORE.some((x) => x.file === rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  const stack = [];
  lines.forEach((line, i) => {
    // 打印输出按 LANGUAGE §0.1 豁免字号、间距、动效白名单（含其内部嵌套选择器）
    const inPrintRoot = stack.some((s) => /print/.test(s));
    if (/\{/.test(line)) stack.push(line);
    if (/\}/.test(line) && stack.length) stack.pop();
    if (inPrintRoot) return;
    if (SKIP_LINE.test(line)) return;
    for (const rule of rules) {
      const hit = rule.test(line, ext);
      if (hit) findings.get(rule.id).push({ file: rel, line: i + 1, hit, text: line.trim().slice(0, 110) });
    }
  });
}

const json = process.argv.includes("--json");
const strict = process.argv.includes("--strict");
const total = [...findings.values()].reduce((n, list) => n + list.length, 0);

if (json) {
  console.log(JSON.stringify(
    rules.map((r) => ({ id: r.id, level: r.level, title: r.title, ref: r.ref, count: findings.get(r.id).length, findings: findings.get(r.id) })),
    null,
    2,
  ));
} else {
  console.log(`扫描 ${files.length} 个文件，命中 ${total} 处候选违规\n`);
  for (const rule of rules) {
    const list = findings.get(rule.id);
    if (!list.length) continue;
    console.log(`[${rule.level}] ${rule.id} ${rule.title} — ${list.length} 处  (${rule.ref})`);
    for (const f of list.slice(0, 8)) console.log(`    ${f.file}:${f.line}  ${f.hit}  |  ${f.text}`);
    if (list.length > 8) console.log(`    …另有 ${list.length - 8} 处`);
    console.log("");
  }
}

process.exit(strict && total > 0 ? 1 : 0);
