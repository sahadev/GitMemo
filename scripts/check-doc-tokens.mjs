#!/usr/bin/env node
// 校验设计文档里出现的 --gm-* 变量名是否真实存在于 desktop/src/index.css。
// 用法：node scripts/check-doc-tokens.mjs [文件...]
// 退出码：0 全部存在；1 有不存在或不在文档规范内的变量名。

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(root, "desktop/src/index.css"), "utf8");
const defined = new Set([...css.matchAll(/(--gm-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

// 待新增列表：文档已规定但实现里还没有的变量，单独统计，不算名字写错
const pending = new Set(
  (() => {
    try {
      return readFileSync(join(root, "docs/design/pending-tokens.txt"), "utf8")
        .split("\n").map((l) => l.trim().split(/\s+/)[0])
        .filter((t) => t.startsWith("--"));
    } catch { return []; }
  })(),
);

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  // 默认只校验「实现说明书」类文档。
  // DESIGN-V2 是设计目标规格，里面的 token 是待实现的目标，不在此校验范围。
  : ["docs/design/SKIN-LIGHT.md", "docs/design/PAGE-CHECKLIST.md"];

let bad = 0;
const pendingHits = new Set();
for (const rel of files) {
  const text = readFileSync(join(root, rel), "utf8");
  // 迁移表里左侧是历史名字，标记为 allowed-missing 的段落跳过
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.includes("旧 token")) return;
    for (const m of line.matchAll(/`(--(?:gm|skin)-[a-z0-9-]+)`/g)) {
      const name = m[1];
      if (name.startsWith("--skin-")) {
        console.log(`${rel}:${i + 1} 皮肤名不在实现里：${name}`);
        bad++;
      } else if (!defined.has(name)) {
        if (pending.has(name)) { pendingHits.add(name); continue; }
        console.log(`${rel}:${i + 1} 未定义：${name}`);
        bad++;
      }
    }
  });
}
if (pendingHits.size) {
  console.log(`待新增 ${pendingHits.size} 个（已登记在 docs/design/pending-tokens.txt，实现前不得在组件里引用）：${[...pendingHits].join(" ")}`);
}
console.log(bad === 0 ? "文档里的变量名全部存在于 index.css 或已登记为待新增" : `发现 ${bad} 处问题`);
process.exit(bad === 0 ? 0 : 1);
