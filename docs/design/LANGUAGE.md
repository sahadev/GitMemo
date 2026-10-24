# GitMemo 界面语言

适用范围：`desktop/src` 下所有界面代码。
数值来源：`desktop/src/index.css` 的实际定义（本文所有 px、字重、时长都取自该文件，不取 `DESIGN.md`）。
方向：瑞士国际主义排版——硬边、留白由线承担、层级靠尺寸与位置、颜色只表达状态与交互。
本文只定义规则，不新增字体、图标包、插画、token。文中出现的每个 token 都已在 `index.css` 中定义。

---

## 0 怎么用这份文件

### 0.1 等级

- **J**（硬规则）：出现即驳回，不需要讨论理由。
- **S**（建议）：可以违反，改动说明里写一句为什么。
- **N**（现状记录）：只描述事实，不作规则。

判定顺序：数一屏字号（§1.2）→ 查字重字距（§1.3、§1.5）→ 查颜色种类（§3.5）→ 查间距与圆角来源（§2.1、§2.5）→ 查动效参数（§4.1）。五步都过才合规。

### 0.2 怎么数「一屏」

计一个屏幕上同时可见的**不同 font-size token 的数量**。同一个 token 出现多次只算一次。以下不计入：

- `#gitmemo-print-root` 下的打印输出（纸张不是屏幕）。
- `.markdown-body` 内部的 `em` 相对标题（1.84em / 1.42em / 1.18em）。其正文 `font-size` 仍会计入。
- 图标尺寸（`--gm-icon-*`）与 `--gm-font-*` 无关，不计入。

### 0.3 豁免（J）

以下位置不受字号档位、间距字面量、动效白名单约束，其余规则仍然适用：

- `#gitmemo-print-root` 下的打印输出：允许 `pt` 单位、固定毫米边距、非 0 字距。
- `index.css` 中 `--gm-*` 的 token 定义行本身。
- Mantine / CodeMirror 等第三方组件内部默认样式：只约束我们覆盖的属性。
- 组件常量白名单（`index.css` 中「组件常量白名单」注释块）：触控热区 44/38、媒体画框 40/56/48/80、状态点与进度条 4/8/22/2、焦点环 `outline: 2px`、`env(safe-area-inset-*)`。

### 0.4 自检

```sh
# 字号字面量（应为空）
rg -n 'font-size: *[0-9.]+px' desktop/src --glob '!index.css'
# 白名单外的字重（应只剩 400 / 650 / 720）
rg -n 'font-weight: *(500|560|600|620|700|750|760|800)' desktop/src
# 白名单外的时长
rg -n 'transition:.*(0\.1s|0\.3s|all|cubic-bezier)' desktop/src/index.css
# 圆角字面量
rg -n 'border-radius: *[0-9]' desktop/src
# 全量规则（按本文 §0.1 分级）
node scripts/audit_design_language.mjs
```

审计脚本与本文的对应关系见附录 B。脚本的常量必须与本文一致；两者冲突时以本文为准，并按附录 B 同步脚本。

---

## 1 层级

### 1.1 字号阶梯（J）

| token | 实际值 | 唯一用途 | 禁止用于 |
| --- | --- | --- | --- |
| `--gm-font-2xs` | 11px | 元信息、微标签、表格单元格、计数、时间、路径、占位符、标签块（tag） | 列表行标题、正文、按钮文字、摘要 |
| `--gm-font-xs` | 12px | 无。迁移存量，仅允许出现在尚未改造的旧组件 | 新增代码一律不用 |
| `--gm-font-sm` | 13px | 正文、列表行标题、摘要、按钮、表单值、表格行、标签页、空态文字 | 页级大标题 |
| `--gm-font-md` | 15px | 只允许两处：对话框动作文字、移动端页标题 | 桌面页面内任何区块标题 |
| `--gm-font-lg` | 17px | 对话框标题、设置向导步骤标题 | 列表页、工作台 |
| `--gm-font-xl` | 20px | 整页大标题（`gm-page-header-title`） | 面板内读数 |
| `--gm-font-2xl` | 24px | 读数（仪表带数字、结果数值） | 一行内与 20px 标题同屏 |

判定：任何 `font-size` 用了上表之外的 token、或用了字面量 px（打印块除外），即违规。

### 1.2 一屏三档（J）

一屏最多三档，且必须落在下面某一组合内：

| 页面类型 | 允许组合 | 说明 |
| --- | --- | --- |
| 分栏列表页（Notes、Conversations、Plans、Imports、Favorites、Clipboard、Search、Dashboard） | `2xs + sm` | 元信息 11、内容 13。不再有第三档 |
| 带读数的仪表页（Dashboard 的仪表带在屏时） | `2xs + sm + 2xl` | 读数 24 是第三档 |
| 整页文档页（Editor Home、设置） | `2xs + sm + xl` | 页面标题 20 是第三档 |
| 对话框 / 向导 | 页内 `2xs + sm`，标题 `lg` | `lg` 是标题档，不计入页内三档 |

判定：

- 同屏出现 4 个及以上不同字号 → 违规。
- `xl` 与 `2xl` 同屏 → 违规（读数页不设 20px 标题，标题页不设 24px 读数）。
- `md`（15px）出现在桌面页面内 → 违规。
- `xs`（12px）与 `sm`（13px）同为可读文字 → 违规。二者相差 1px，在等宽字体下不构成层级。

当前三页实测（2026-10-24，`desktop/src/index.css`）：

| 页面 | 实测字号 | 判定 |
| --- | --- | --- |
| Dashboard | 11 / 13 / 15 / **16** / 24 | 违规：`md` 来自 `.gm-inst-banner-title`；16px 来自没写样式的 `.gm-inst-gauge-detail`，继承浏览器默认 |
| Notes | 11 / 12 / 13 | 违规：`xs` 来自 `.gm-pane-tab-button` |
| Search | 11 / 12 / 13 | 违规：`xs` 来自 `.gm-search-result-count` 与 `.gm-search-result-snippet` |

16px 不在字号阶梯里，出现即违规——`index.css` 没有任何 token 等于 16px。凡是新写的 `<span>` 没被任何选择器命中，就会掉到这一档。

### 1.3 字重（J）

全仓三个值：

| 字重 | 承担 | 判定要点 |
| --- | --- | --- |
| 400 | 正文、描述、摘要、微标签（含全大写）、表格单元格、读数、标签页未选中 | 默认值；未写 `font-weight` 等于 400 |
| 650 | 列表行标题、页标识、按钮文字、徽标、标签块、不高亮的区块标题 | 一行内只允许一个 650 |
| 720 | 页面级大标题、对话框标题 | 每屏最多一处 |

- `500` `560` `600` `620` `700` `750` `760` `800` 一律违规。迁移映射：`760 → 720`、`700/600 → 650`、`500/560 → 400`。
- 读数用 400，不靠加粗建立层级——等宽字体加尺寸已经足够。`.gm-dashboard-stat-value` 的 720 所在选择器已无引用（DashboardPage 改用 `gm-inst-gauge`），删掉即可。
- 存量：35 处（审计 T3）。这是当前最大一块债务，纯替换，零布局风险。

### 1.4 文字明度（J）

文字颜色只由三个 token 决定，一个元素只用其中一个：

| token | 用于 | 实测对比度（深色面板 / 浅色面板） |
| --- | --- | --- |
| `--gm-text` | 页标题、页标识、列表行标题、读数、选区当前行标题 | 14.75:1 / 19.67:1 |
| `--gm-text-2` | 正文、摘要、说明、未选中的行标题、工具栏文字 | 8.09:1 / 10.83:1 |
| `--gm-text-3` | 时间、计数、路径、占位符、禁用文字、快捷键提示、微标签 | 4.88:1 / 5.99:1 |

- `--gm-text-3` 是唯一的最低档，实测下限 4.88:1（深色面板），只剩 4.5:1 以上的 0.38 余量，因此不设第四档。出现比它更淡的文字（更低透明度的 token、`opacity`、`color-mix(...transparent)`）即低于底线，违规。
- 禁止用 `opacity` 调文字或图标明度。`opacity` 只允许用于显隐切换与遮罩。当前 `.gm-note-send-button` 用 `opacity: 0.4` 表达未激活，应改为 `color: var(--gm-text-3)`。
- 禁止用 `color-mix(...)` 生成文字色。
- 选中态不得提高字号或字重，只用 `--gm-selected` 底色加 `--gm-accent` 左标记。

### 1.5 字距（J）

默认 0。只有三种例外：

| 场景 | 允许值 | 依据 |
| --- | --- | --- |
| 11px 全大写等宽微标签（表头、分栏头、仪表标签、页标识） | `0.14em` | 小字号大写需要开字距才成行 |
| 11px 标签块（tag） | `0.06em` | 与微标签同族，但底有色块，字距收一半 |
| ≥20px 的读数与页标题 | `-0.02em` | 大字号需要负字距收紧 |

- 上述三种之外出现非 0 `letter-spacing` 即违规。特别是小字号加负字距：当前 `.gm-bottom-nav-label`（11px / `-0.01em`）违规，改为 0。
- `letter-spacing: inherit` 合规（属于传值，不是设定）。
- 全大写只允许与上表第一、二行的 11px 背景同时出现；13px 及以上禁止 `text-transform: uppercase`。

### 1.6 行高（J）

| token | 实际值 | 用于 |
| --- | --- | --- |
| `--gm-leading-none` | 1 | 打印微标签 |
| `--gm-leading-tight` | 1.2 | 微标签、徽标、时间 |
| `--gm-leading-title` | 1.25 | 页标题、读数、标签行 |
| `--gm-leading-heading` | 1.3 | Markdown 标题、面板内密集标题 |
| `--gm-leading-normal` | 1.5 | 列表行、按钮、输入、工具栏 |
| `--gm-leading-relaxed` | 1.6 | 代码块、多行说明 |
| `--gm-leading-reading` | 1.72 | Markdown 阅读面（桌面） |
| `--gm-leading-reading-mobile` | 1.78 | Markdown 阅读面（移动） |

判定：`line-height` 出现字面量（`1.1`、`18px` 等）即违规。当前 `.gm-dashboard-stat-value` 的 `line-height: 1.1` 违规，改 `--gm-leading-title`。

### 1.7 层级总表（J）

逐行给用途，实现时照抄这一行，不要临场组合。

| 元素 | 字号 | 字重 | 颜色 | 行高 | 字距 / 大写 |
| --- | --- | --- | --- | --- | --- |
| 页标识（`gm-inst-identity-mark`，兼页面标题） | `2xs` | 650 | `--gm-text` | `--gm-leading-tight` | 0.14em / 大写 |
| 整页大标题（`gm-page-header-title`） | `xl` | 720 | `--gm-text` | `--gm-leading-title` | 0 |
| 对话框标题 | `lg` | 720 | `--gm-text` | `--gm-leading-title` | 0 |
| 分栏头 / 表头 / 仪表标签（微标签） | `2xs` | 400 | `--gm-text-3` | `--gm-leading-tight` | 0.14em / 大写 |
| 区块标题（不高亮，如 `gm-inst-banner-title`） | `sm` | 650 | `--gm-text` | `--gm-leading-title` | 0 |
| 列表行标题 | `sm` | 650 | `--gm-text` | `--gm-leading-normal` | 0 |
| 表格行文字 | `sm` | 400 | `--gm-text` | `--gm-leading-normal` | 0 |
| 正文 / 摘要 | `sm` | 400 | `--gm-text-2` | `--gm-leading-normal` | 0 |
| 元信息（时间、路径、计数、来源） | `2xs` | 400 | `--gm-text-3` | `--gm-leading-tight` | 0 |
| 标签块（tag） | `2xs` | 650 | `--gm-on-tag`（底色 `--gm-tag-*`） | `--gm-leading-tight` | 0.06em / 大写 |
| 读数（仪表带数字） | `2xl` | 400 | `--gm-text` | `--gm-leading-title` | -0.02em |
| 按钮文字 | `sm` | 650 | 见 §3.3 | `--gm-leading-normal` | 0 |
| 标签页（未选中 / 选中） | `sm` | 400 / 650 | `--gm-text-2` / `--gm-text` | `--gm-leading-normal` | 0 |
| 占位符 | 随所属输入 | 400 | `--gm-text-3` | 随所属输入 | 0 |
| 空态主文案 | `sm` | 400 | `--gm-text-3` | `--gm-leading-normal` | 0 |
| 对话框动作文字 | `md` | 650 | 见 §3.3 | `--gm-leading-normal` | 0 |

### 1.8 字体族（J）

- `--gm-font-mono`（JetBrains Mono）：页标识、微标签、表格、时间、读数、路径、标签块、命令输入。
- `--gm-font-sans`：Markdown 阅读面与非代码正文。
- 两族不得在同一行文字内混排；`font-family` 出现字面量族名即违规（`--gm-font-mono` / `--gm-font-sans` 之外）。

---

## 2 网格与间距

### 2.1 间距只有 8 档（J）

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-space-0` | 0 | 贴边（分栏容器、表格容器） |
| `--gm-space-1` | 2px | 标签与数值、状态点与文字、读数与条 |
| `--gm-space-2` | 4px | 微距：徽标内边距、行内两段文字的缝 |
| `--gm-space-3` | 8px | 行内：图标与文字、控件内边距 |
| `--gm-space-4` | 12px | 节律：行内水平内边距、模块间距、仪表带每格内边距 |
| `--gm-space-5` | 16px | 卡片内边距、对话框内边距 |
| `--gm-space-6` | 24px | 页边留白（仅整页可滚动页） |
| `--gm-space-7` | 32px | 大断点留白 |

- `6px` `10px` `14px` `18px` `20px` `28px` `40px` 以上：没有对应 token，写出即违规。存量 2 处（`58px`、`64px 76px 76px`）。
- `--gm-density-pad-panel`（14px）是既有 token，不属新增字面量，但只用于面板内边距，不得扩散。
- 数值型间距优先用语义 token；无对应语义时才用 `--gm-space-*`。

### 2.2 语义间距（J）

| 位置 | token | 实际值 |
| --- | --- | --- |
| 整页可滚动容器四边 | `--gm-page-pad-x` / `--gm-page-pad-y` / `--gm-page-pad-bottom` | 24 / 12 / 24 |
| 移动端页面四边 | `--gm-page-pad-mobile-x` / `--gm-page-pad-mobile-y` | 12 / 12 |
| 同级模块之间 | `--gm-section-gap`（大断点 `--gm-section-gap-lg`） | 12 / 16 |
| 卡片内边距 | `--gm-card-pad-x` / `--gm-card-pad-y` / `--gm-card-pad-mobile` | 16 / 16 / 12 |
| 卡片标题到内容 | `--gm-card-header-gap` | 12 |
| 列表头 / 过滤条 | `--gm-list-header-pad-x` / `--gm-list-header-pad-y` | 12 / 8 |
| 列表行 | `--gm-list-row-pad-x` / `--gm-list-row-pad-y`（紧凑 `-compact`） | 12 / 12 / 8 |
| 阅读面 / 详情面 | `--gm-detail-pad-x` / `--gm-detail-pad-y` | 16 / 16 |
| 图标与文字 | `--gm-icon-text-gap` | 8 |
| 工具条按钮组 | `--gm-toolbar-gap` | 8 |
| 控件内部 | `--gm-control-gap` / `--gm-control-pad-x` / `--gm-control-pad-y` | 4 / 8 / 4 |

- 分栏页横向留白由竖线承担，容器内边距只用 `--gm-space-4`，**不再叠加** `--gm-page-pad-x`。只有不分栏、整页滚动的页面才用 `--gm-page-pad-*`。
- 页面留白只放滚动容器上，内层包裹元素不得再补一次。

### 2.3 行与栏的高度（J）

行高、栏高只用既有密度 token，不写字面量：

| token | 值 | 用于 |
| --- | --- | --- |
| `--gm-density-subheader` | 28px | 表头 |
| `--gm-density-row-compact` | 30px | 表格行、命令输入底部键位条 |
| `--gm-density-row` | 32px | 列表行、待处理行 |
| `--gm-density-header` | 34px | 页标识条、分栏头、搜索结果行最小高 |
| `--gm-density-control` | 34px | 输入、按钮 |
| `--gm-pane-header-height` | 50px | 旧分栏头（迁移中） |

判定：出现 `height: 36px` / `min-height: 40px` 这类无 token 值即违规。

### 2.4 分隔与栅格（J）

- 三种线，各司其职，不得混用：

| token | 用在 |
| --- | --- |
| `--gm-line` | 行分隔、格内分隔（弱） |
| `--gm-line-section` | 区块与区块之间（中） |
| `--gm-line-strong` | 控件边界、分栏主分隔、表格外框（强） |

- 结构线宽一律 `--gm-border-w`（1px）。2px 只允许三种：选中行左标记（`border-left: 2px` 或 `box-shadow: inset 2px 0 0`）、焦点环（`outline: 2px`）、底部导航选中标记。除此之外出现 2px 或 `0.5px` 边框即违规。
- 栅格 `gap` 为 0，格与格之间用 1px 竖线，不靠留白分格。当前仪表带即此做法。
- 页级栅格列数只允许 `2`、`3`、`5`（≈1100 收 3 列、≈700 收 2 列、≈480 收 1 列）。表格列数固定 4 列可视（`source` 列在窄屏隐藏）。
- 同一页出现两种 `gap` 值 → 违规。

### 2.5 圆角（J）

- 组件里不得写圆角字面量，只用 token：`0`、`--gm-r-1`（2px）、`--gm-radius-pill`（999px）、`--gm-radius-control` / `--gm-radius-panel` / `--gm-radius-card`（随皮肤取值：深色 4/6/4、浅色 0）。
- 内容面（面板、列表、表格、行）圆角目标为 `0`，与浅色皮肤一致；深色皮肤残留的 4/6px 属未收敛，不作为新代码参考。
- 唯一的固定非零圆角是标签块与标签类的 `--gm-r-1`（2px）。`--gm-radius-pill` 只用于状态点、圆形头像、进度胶囊。
- 现行存量：`--gm-radius-control` 71 处、`--gm-radius-panel` 17 处、`--gm-radius-pill` 13 处、`--gm-radius-card` 1 处。字面量 0 处（审计 T5）。

### 2.6 对齐与行长（J）

- 标题、正文、标签一律左对齐。居中只允许：空态整体块、对话框动作行、结果页。
- 数字列右对齐，且必须等宽（`--gm-font-mono`）。
- 正文单行超过 80 字符（中文约 40 字）即收窄容器或拆行。
- 路径、标题类单行文本用省略号且必须有 `title`；不允许换行成三行以上。

---

## 3 颜色克制

### 3.1 三层颜色职责（J）

| 层 | token 白名单 | 规则 |
| --- | --- | --- |
| 结构 | `--gm-canvas`、`--gm-panel`、`--gm-inset`、`--gm-hover`、`--gm-selected`、`--gm-line`、`--gm-line-section`、`--gm-line-strong`、`--gm-border-w` | 布局与分区只由这 8 个表达，不用彩色 |
| 文字 | `--gm-text`、`--gm-text-2`、`--gm-text-3`、`--gm-on-accent`、`--gm-on-tag` | 见 §1.4 |
| 语义 | `--gm-accent`（+`-hover`、`-fill`）、`--gm-success`、`--gm-warning`、`--gm-danger`（各带 `-tint`）、`--gm-tag-*` | 见 §3.3、§3.4 |

- 旧别名（`--bg`、`--bg-card`、`--bg-hover`、`--bg-input`、`--border`、`--border-strong`、`--text`、`--text-secondary`、`--accent`、`--green`、`--yellow`、`--red`、`--purple`、`--pink`）是结构层与语义层的等价入口，值指向同一批变量。新代码直接用上面三层，不新增别名。
- 十六进制、`rgb()`、`hsl()` 出现在组件里即违规（打印块与 `--gm-media-*` 除外）。当前组件内颜色字面量 11 处，全部在打印块内。

### 3.2 明度只由 token 决定（J）

见 §1.4。补一条：同一个元素不得同时用「颜色 + 透明度」两级压暗；要更弱就换下一个 token。

### 3.3 蓝色只标「可交互 / 当前」（J）

`--gm-accent` 及其衍生（`--gm-accent-hover`、`--gm-accent-fill`、`--gm-accent-soft`、`--gm-accent-muted`、`--gm-accent-border`、`--gm-selected`）只允许出现在：

1. 当前所在位置：选中行底色 + `--gm-accent` 左标记（`box-shadow: inset 2px 0 0` 或 2px 左边框）；
2. 焦点环（`outline: 2px solid var(--gm-accent)`）与聚焦输入框的边框；
3. 主按钮填充（文字 `--gm-on-accent`）；
4. 读数条、进度条的填充部分。

禁止：蓝色区块标题、蓝色图标身份色、蓝色装饰条、蓝色渐变、蓝色大背景块（主按钮除外）。

存量违规：`.gm-page-header-icon`（在用，`AppHeaders.tsx`）用 `--accent` 当图标身份色，改为 `--gm-text-3`；`.gm-page-kicker` 已无引用，直接删掉。

### 3.4 身份色（J）

四个类型色是「身份」，不表状态：`--gm-tag-chat`、`--gm-tag-note`、`--gm-tag-clip`、`--gm-tag-plan`，文字用 `--gm-on-tag`。

- 只允许作为 11px 标签块的底色，不得扩散成整行背景、图标色、边框色、左侧色条。
- `--gm-category-*`（blue / green / yellow / gray / teal）只允许用于数据可视化（图表系列、统计色块），不得用于列表行、导航、图标身份色。
- 图标身份色一律 `--gm-text-3`（`--gm-color-muted-icon` 等价）。分类靠图标形状与文字承担，不靠颜色。
- 光标色、焦点色不得借用分类色：`.gm-quick-paste-input[data-mode="command"|"file"]` 的 `caret-color` 用了 `--gm-category-yellow` / `--gm-category-green`，违规，改用 `--gm-accent`。
- Git 托管商色（`--gm-provider-*`）只允许用于托管商徽标本身。

### 3.5 状态色（J）

`--gm-success` / `--gm-warning` / `--gm-danger` 只允许出现在：同步状态、错误提示、危险动作、成功结果、待推送计数。

- 必须同时有文字或图标，不得只靠颜色。
- 不得用于分类、导航、装饰线、图标身份色、区块标题。
- 浅色与深色都需 ≥4.5:1；实测最低 5.32:1（深色 danger）。

### 3.6 同屏颜色上限（J）

一屏内非中性色不超过两种：`--gm-accent` + 最多一种状态色。标签块四色不计入上限，但同屏最多两种标签色同时出现。

### 3.7 阴影与皮肤（J）

- 内容面（面板、列、行、表）默认无阴影，分区靠 1px 线。当前内容面阴影已归零，保留的阴影只允许三处：`--gm-shadow-popover`（菜单）、`--gm-shadow-modal`（对话框）、`--gm-shadow-soft`（吸底工具条）。
- 组件里不得出现 `[data-theme="..."]` 分支；皮肤差异只能由 `index.css` 的变量块表达。
- 皮肤块里只放颜色与圆角，宽度与密度两套共用。

---

## 4 动效

### 4.1 参数表（J）

| 交互 | 时长 | 缓动 | 允许变化的属性 |
| --- | --- | --- | --- |
| 悬停 / 聚焦 / 按下（颜色类） | `150ms` | `ease` | `background`、`background-color`、`border-color`、`color`、`text-decoration-color`、`opacity` |
| 显隐 / 位移 / 展开收起 | `200ms` | `ease` | `transform`、`opacity` |
| 进度填充 | `200ms` | `ease` | `transform`（`scaleX`） |
| 光标闪烁 | `1.1s` | `steps(1)` | `opacity` |

- 过渡时长只有 `0.15s` 与 `0.2s` 两个值，另有 `0` / `0.01ms`（减少动效时使用）。出现 `0.1s`、`0.3s`、自定义值即违规。存量 1 处（`.gm-quick-paste-result` 的 `background 0.1s, color 0.1s`）。
- 禁止 `transition: all`、`transition-delay`、自定义 `cubic-bezier`、`spring`。
- 禁止对 `box-shadow`、`filter`、`width`、`height`、`top`、`left` 做过渡。存量 1 处（`box-shadow 0.15s ease`）。
- 退出隐藏允许一次 `visibility 0s linear 0.15s`。
- `transform` 只允许 `200ms`；出现在 `150ms` 里即违规（存量 1 处）。

### 4.2 允许的循环动画（J）

只允许两类，超出即违规：

| 动画 | 参数 | 用途 |
| --- | --- | --- |
| `spin` | `1s linear infinite` | 加载指示器 |
| `shimmer` | `1.5s linear infinite` | 同步中条带 |
| `gm-inst-caret` | `1.1s steps(1) infinite` | 命令输入光标 |

- 禁止弹跳、回弹、过冲（`cubic-bezier` 含负值）、跟手 spring、无限漂移。
- 必须有动效的：按钮与行的颜色过渡、面板显隐、Toast 进出、加载指示。
- 必须没有动效的：悬停位移（`translateY`）、悬停放大、悬停加深阴影、页面切换动画、列表逐项淡入、装饰性摆动。

### 4.3 减少动效（J）

`@media (prefers-reduced-motion: reduce)` 下所有 `animation` 停止、所有 `transition-duration` 归零、位移无位移。

- 只允许一个全局块（`index.css` 中一处），不允许各组件各写一份。当前两处局部块（`.gm-clip-*` 与 `.gm-inst-command-caret`），需合并为一处全局块。
- 全局块必须同时覆盖 `animation-name: none` 与 `transition-duration: 0.01ms`，不得只列个别类名。

### 4.4 无动效状态（N）

改版后内容面不再有悬停位移与阴影变化；悬停只改 `background`（`--gm-hover`），按下只改 `background`（`--gm-selected`），选中态只改 `background` + 左标记。当前 `.gm-dashboard-stat-card:hover` 还会改 `border-color`（`--gm-accent-border`），属旧组件，改造时删除该行。

---

## 5 三个页面的改造前后

每页两段：现状（`desktop/src` 里的事实）、目标（照抄即可的组合）。目标里的每个 token 都已存在。

### 5.1 仪表盘（Dashboard）

**现在**

- 顶部一条页标识带：`11px / 650 / --gm-text / 0.14em / 大写` 的页标识，右侧依次是路径（`11 / --gm-text-3 / mono`）、同步状态（`11 / --gm-text-2`，异常时 `--gm-warning` / `--gm-danger`）、待推送计数（数字 `650 + --gm-warning`）。
- 左列「最近条目」：分栏头 `11 / 400 / --gm-text-3 / 0.14em / 大写`，右侧计数 `--gm-text-2`；行高 32px，行内标题 `13 / --gm-text`、时间 `11 / --gm-text-3`。
- 主区顶部横幅：边框 `--gm-line-strong`，空态时底色 `--gm-accent-soft`；标题 `15px / 650`（**第四档，违规**），右侧 meta `11 / --gm-text-3 / mono`。
- 仪表带：5 列，`gap: 0`，格间 1px `--gm-line` 竖线，外框 `--gm-line-strong`；标签 `11 / 400 / --gm-text-3 / 0.14em / 大写`，读数 `24 / 400 / mono / --gm-text / -0.02em`，下面 2px 读数条（底 `--gm-line`、填充 `--gm-accent`），末行 detail **没有任何样式规则，实际继承 16px 与 `--gm-text`**（第五档，违规）。
- 表格：表头 `11 / 400 / --gm-text-3 / 0.14em / 大写`，行高 30px，行内 `13 / --gm-text`，时间与来源 `11 / --gm-text-3 / mono`，状态右对齐 `11 / --gm-text-3`，类型标签块 `11 / 650 / --gm-on-tag` 铺 `--gm-tag-*` 底色。
- 命令输入：标题行 `11 / 400 / --gm-text-3 / mono`，输入 `mono / 13`，无边框，占位符 `--gm-text-3`，右侧 1px `--gm-accent` 闪烁光标（`1.1s steps(1)`）；聚焦时容器边框 `--gm-accent` 加 2px 外环；底栏键位提示 `11 / --gm-text-3 / mono`。
- 待处理：标题行 `11 / --gm-text-3 / mono`，行高 32px，标签 `13 / --gm-text-2`，meta `11 / --gm-text-3 / mono`。
- 空态与错误态：`.gm-muted-text` 是 `12px`（`xs`，违规）；`.gm-inst-list-error-text` 没有任何样式规则，实际继承 16px 与 `--gm-text`（违规）。

**目标**

三处，全部是「把跑出阶梯的字收回来」：

| 元素 | 现在 | 改成 |
| --- | --- | --- |
| 横幅标题 | `15 / 650` | `13 / 650 / --gm-leading-title` |
| 仪表带每格的 detail | 无样式，继承 16px / `--gm-text` | `11 / 400 / --gm-text-3 / mono / --gm-leading-tight` |
| 空态 / 错误文案 | `12px`（`.gm-muted-text`）、16px（`.gm-inst-list-error-text`） | `13 / 400 / --gm-text-3`，错误态用 `--gm-danger` 时同时保留文字 |

改完 Dashboard 只有 `2xs + sm + 2xl` 三档，符合 §1.2 的「带读数的仪表页」组合。

其余全部保留：分栏 5 列 `gap: 0` + 1px 竖线、悬停只改 `--gm-hover`、按下只改 `--gm-selected`、状态色只出现在同步与待推送、蓝色只出现在读数条、光标与焦点环。

### 5.2 笔记（Notes）

**现在**

- 分栏头的标签页文字用 `12px / 650`（**`xs` 与 `sm` 混用，违规**）；未选中 `--gm-text-2`，选中 `--gm-text`。
- 输入区是一块独立面板：底色 `--bg-card`，下边 1px `--gm-line`；标题输入框与正文输入框都是 `13px`，各自带 `1px --gm-line-strong` 边框与 `--gm-radius-control` 圆角，静止态就有框。
- helper 文字 `11px / 400 / --gm-text-2`。
- 发送按钮 24px 图标，未激活时 `--gm-text-2` + `opacity: 0.4`（**用透明度压暗，违规**），激活时 `--gm-accent`，保存中 `--gm-green`。
- 列表行：高 32px，标题 `13 / --gm-text`，时间 `11 / --gm-text-3`。
- 详情：工具栏 + Markdown 阅读面，正文 `13 / --gm-font-sans / --gm-leading-reading`，标题按 `em` 相对缩放。

**目标**

| 元素 | 改成 |
| --- | --- |
| 标签页文字 | `sm`（13px） / 未选中 400 `--gm-text-2`、选中 650 `--gm-text` |
| 输入区容器 | 去掉底色与圆角，只留一条下边框 `--gm-line`；内边距 `--gm-space-4` |
| 标题 / 正文输入框 | `sm / 400`，静止态无边框、无底色；聚焦时 `1px --gm-accent` |
| 占位符 | `--gm-text-3`（标题与正文同一档，不靠边框区分） |
| helper | `11 / 400 / --gm-text-3` |
| 发送按钮 | 未激活 `--gm-text-3`（去掉 `opacity`），激活 `--gm-accent`，保存中 `--gm-success` |
| 列表行 | 不动（已合规） |

改完 Notes 只有 `2xs + sm` 两档。

### 5.3 搜索（Search）

**现在**

- 结果条数 `12px / --gm-text-2`（`xs`，违规）。
- 结果行已改为平面列表：无底色、无圆角、无阴影，行间 1px `--gm-line` 分隔，行内边距 `--gm-list-row-pad-y` / `--gm-list-row-pad-x`，最小高 `--gm-density-header`。
- 行内：标题 `13 / 650 / --gm-text`、右侧时间 `11 / --gm-text-2`、下面摘要 `12px / --gm-text-2`（`xs`，违规）。
- 悬停只改 `--gm-hover`；选中行 `--gm-selected` 底色 + 2px `--gm-accent` 左标记。

**目标**

| 元素 | 改成 |
| --- | --- |
| 结果条数 | `11 / 400 / --gm-text-3`，放在列表上方一行，内边距 `--gm-list-header-pad-x` / `--gm-list-header-pad-y` |
| 摘要 | `13 / 400 / --gm-text-2`，与标题同字号，靠颜色与位置区分 |
| 时间 | `11 / --gm-text-3`，固定宽度右对齐 |
| 选中 | 不动（底色 + 2px 左标记，符合 §3.3 第 1 条） |

改完 Search 只有 `2xs + sm` 两档，全页字号梯度为 13 → 11。

---

## 6 反面清单（全部 J）

出现任一项即驳回：

1. 同屏四个及以上字号；`xl` 与 `2xl` 同屏；`md`(15px) 出现在桌面页面内；`xs`(12px) 与 `sm`(13px) 同为可读文字。
2. `--gm-font-xs` 用于新增代码。
3. `400` / `650` / `720` 之外的字重；一屏出现两个 720。
4. 用 `opacity` 或 `color-mix(...transparent)` 压暗文字或图标。
5. 比 `--gm-text-3` 更淡的文字。
6. 蓝色出现在区块标题、图标身份色、装饰条、大背景块（主按钮除外）。
7. 状态色用于非状态场景；用颜色做分类编码。
8. 类型色（`--gm-tag-*`）扩散成整行背景、边框、图标色。
9. 「边框 + 阴影 + 彩色竖条」三者同时出现在同一容器。
10. 内容面出现投影；出现 `--gm-shadow-*` 之外的阴影。
11. 渐变（`--gm-sync-shimmer-bg` 只允许用于同步条带）。
12. 发光、光晕、模糊装饰、噪点、纹理、网格底纹。
13. 正文或页标题居中；非数字列右对齐。
14. 非 0 字距除 §1.5 三种例外；13px 及以上全大写。
15. 圆角超过 `--gm-r-1`（2px）用于内容面；出现圆角字面量。
16. 悬停位移、悬停放大、悬停加深阴影、逐项入场动画、装饰性循环摆动。
17. 无限动画除 `spin`、`shimmer`、`gm-inst-caret`；超过 200ms 的过渡；`transition: all`；自定义 `cubic-bezier`。
18. 手写 `font-size` / `padding` / `margin` / `gap` / `border-radius` / `max-width` / `line-height` 字面量，且无对应 token。
19. 组件内出现十六进制 / `rgb()` / `hsl()` 颜色（打印块与 `--gm-media-*` 除外）。
20. 组件内出现 `[data-theme="..."]` 分支。
21. 新增字体、图标包、插画、图形资产、外部设计系统类名。
22. 为「看起来更现代」而增加的分层、卡片、留白堆叠。

---

## 附录 A：本文与 `DESIGN.md` 的数值冲突（N）

`DESIGN.md` 已与 `index.css` 脱节。实现一律以本文与 token 为准。

| 项 | `DESIGN.md` | 实际 |
| --- | --- | --- |
| 最大字号 | `21px` | `--gm-font-xl: 20px` |
| 最小正文档 | `13px`（`--gm-font-xs`） | `--gm-font-xs: 12px` |
| 间距刻度 | 0/2/4/6/8/10/12/14/16/20/24/28/32 | 0/2/4/8/12/16/24/32 八档 |
| 字重 | 未定义 | 400 / 650 / 720 |
| 圆角 | 4 / 6 / 8px 三档 | `--gm-r-1`(2) + 三个皮肤圆角 + `--gm-radius-pill`，浅色全为 0 |
| `--gm-page-header-height` | 有引用 | 未定义；只有 `--gm-pane-header-height: 50px` |
| 底色 | 暖灰 | `--gm-canvas: #0e1012`（冷灰） |
| 字距 | 「保持 0」 | 微标签允许 0.06–0.14em，读数允许 -0.02em |

## 附录 B：审计脚本需要同步的常量（N）

`scripts/audit_design_language.mjs` 按旧版规则写的常量与本文冲突三处。改脚本不在本轮范围，以此清单为准：

| 规则 | 脚本现值 | 按本文应改为 |
| --- | --- | --- |
| T7 无限动画 | 只放行 `animation: spin` | 追加 `shimmer`、`gm-inst-caret` |
| T9 字距 | 只放行 `0` / `0px` | 追加 `inherit`；放行 11px 大写微标签的 `0.06em`–`0.14em` 与 ≥20px 读数的 `-0.02em`，其余仍报 |
| T11 `--gm-font-md` | 一律报 | 排除对话框动作文字与移动端页标题，仍报页面内区块标题 |

以下常量与本文一致，不动：字重 `400/650/720`、间距 `0/2/4/8/12/16/24/32`、圆角 `0/2/4/6/8/999`、过渡 `0 / 0.01ms / 0.15s / 0.2s`。

校准后基线（`node scripts/audit_design_language.mjs`，2026-10-24）：156 处候选，其中字号字面量 0、圆角字面量 0、分类色 0。按本文口径仍需处理：

| 类别 | 处数 | 等级 |
| --- | --- | --- |
| 白名单外字重 | 35 | J |
| `--gm-font-xs`（12px） | 93 | S（迁移存量；但 Dashboard 与 Search 上的这几处算必修） |
| 无样式继承 16px（`gm-inst-gauge-detail`、`gm-inst-list-error-text`） | 2 个选择器 | J |
| `--gm-font-md` | 10 | J（1 处必修：Dashboard 横幅标题） |
| 字距 | 1 | J（`.gm-bottom-nav-label` 的 `-0.01em`） |
| 间距字面量 | 2 | J |
| 过渡时长 / 属性 | 2 | J（`0.1s`、`transform 0.15s`、`box-shadow` 过渡各一处） |
| `max-width` 字面量 | 4 | S |
