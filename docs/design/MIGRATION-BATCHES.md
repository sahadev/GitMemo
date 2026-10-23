# 迁移批次表（V1 → V2）

配套文档：`docs/design/DESIGN-V2.md`（唯一标准）。
范围：`desktop/src/index.css` 与 `desktop/src/**/*.tsx` 里的 `var(--gm-*)` 引用。
基线事实（实测，不是估计）：`index.css` 共 994 个顶层规则块、约 5000 行属性；共 249 个唯一声明的自定义属性 = 226 个 `--gm-*` + 17 个别名（`--bg` / `--text` / `--accent` 等）+ 6 个 `@theme` 的 radius。其中 239 个被规则引用，12 个声明了但从未被引用，2 个被引用却没声明（见 §4 陷阱 6）。目标：`--gm-*` 88 个（取值层已按「C 骨架 + A 报头」重定，原双主题的 89 个作废），加 `@theme` 的 6 个 Tailwind radius（只取 4px 与 8px）。

### 数字怎么来的（方法论，后续任何一批都要按这个口径复核）

1. **数块，不数感觉。** 用「顶层选择器到收尾大括号」解析一遍文件，得到 994 个规则块；每个块归属哪个批次由选择器前缀决定，所以「本批多少块」是可复算的，不是估的。
2. **单行规则必须单独计。** 文件里有 69 条一行写完的规则（`.gm-icon-size-dot { … }` 这种），它们不以 `{` 结尾，按行号或按「缩进块」扫描都会整条漏掉。解析器必须同时认 `^选择器 { 属性 }$` 这种形态。
3. **按 token 名搜，不按行号改。** 同一族的选择器在文件里分散（`gm-button` 在基础组件段与页面段各有一处），按行号区间切一定会切碎。
4. **区分「声明」与「引用」。** 只有出现在 `var(...)` 里的名字才需要迁移；token 层里声明、却没有任何规则引用的，属于收尾批要删的死定义，不要当成使用点处理。
5. **幽灵变量要单列。** `--text-primary`（`.gm-external-file-change-banner` 引用它、全文无定义，靠颜色继承凑巧生效）与 `--gm-icon-render-size`（写在单行规则里就地声明）这类名字不在 token 层，按「旧 token 映射」处理会出错，必须逐个点名。
6. **退役判定按「最后引用」而不是「首次出现」。** 一个 token 只有在最后一个引用它的批次结束时才能删定义，否则后续批次会拿到空值、构建却照样通过——这是本表最容易出错的地方。

## 0 批次原则

1. **新 token 一次性落地，旧 token 分批判死。** 88 个新 token 全在 B1 建立；旧 token 的定义一直留到「最后一个引用它的批次」结束才删。这样每批单独构建都能过，不需要半成品中间态。
2. **按选择器族切，不按行号切。** 文件里各族交织（`gm-button` 在文件首尾各有一段），批次 = 按名字捞块，不是连续行区间。下表的块数与行数是实测归属。
3. **每批一个本地提交，不推送**（本仓库 `AGENTS.md` 第 40 行的约定）。
4. **批次内不夹带交互改动。** 迁移只改取值与规则写法，不改行为、不改 DOM 结构、不改文案。
5. **每批必须能独立构建。** 判定命令固定为：

```sh
cd desktop
npx tsc --noEmit && npx vite build
```

6. **每批结束做三件事**：构建通过、本批退役 token 引用数归零、对应界面截图留档（`docs/design/` 之外的本地目录，不入库）。
7. **B2 必须单独一个 commit**，不许与任何其它批混提。理由：它是唯一一次整站同时变样，评审只该发生一次，回滚只需一条 revert。
8. **B2 的验收是 14 个页面的全量截图**，不是首屏：仪表盘、笔记、对话、剪贴板、计划、导入、外部文件、收藏、搜索、AI 记录、Claude 配置、仓库、设置、编辑器首页，两套主题各一轮（28 张）。缺一张不算过。

提交信息模板：

```
refactor(design): migrate <批次名> to DESIGN-V2 tokens

- 替换：<旧 token 族> → <新 token>
- 退役：<N> 个旧 token 定义
- 构建：tsc --noEmit + vite build 通过
- 视觉：<哪个页面/哪块>
```

## 1 总表

「轨」这一列是本文的核心分类，定义见 §1.1：
**结构** = 改规则的形态（拆合、去层、换承载方式、改布局机制、增删视觉层）；
**取值** = 只改数值或 token 名，规则形态不动。

| 批次 | 范围（选择器族） | 块 | 行 | 退役 | 轨 | 依赖 | 可见变化 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | token 层骨架（新增 88 个） | 5 | 319 | 0 | 结构 | — | 无 |
| B2 | 颜色值与别名层 | 5 | 319 | 11 | 取值 | B1 | 全站变色（唯一一次，单独 commit） |
| B3 | 页面外壳与骨架 | 157 | 630 | 31 | 结构 | B2 | 页头变矮、分栏手柄、图标档位 |
| B3b | 分类图标去色 | 5 | 5 | 9 | 结构 | B3 | 五个分类图标由彩色变单色 |
| B4 | 基础组件 | 92 | 448 | 16 | 结构 + 取值 | B3 | 按钮四态、输入框边界、焦点环 |
| B5 | 列表与行 | 104 | 457 | 4 | 结构 + 取值 | B3 | 行高机制、搜索结果变平面行 |
| B6 | 卡片与面板 | 79 | 408 | 9 | 结构 | B3,B4 | 卡片去投影、仪表盘栅格统一 |
| B7 | 剪贴板族 | 122 | 661 | 28 | 取值 | B4,B5 | 内边距与行高归一 |
| B8 | 设置页 | 135 | 520 | 25 | 结构 | B4,B5 | 设置行三段对齐、模态去模糊 |
| B9 | 设置向导 | 134 | 578 | 27 | 结构 | B4,B8 | 左栏取消、改单列 |
| B10 | 其余页面 | 88 | 453 | 36 | 取值 | B4,B5 | 间距与圆角微调 |
| B11 | 阅读面与打印 | 73 | 500 | 43 | 结构 | B3,B5 | 换字族分工、正文 15px、66ch 行长 |
| B12 | 收尾与上限 | — | — | 7 | 结构 | 全部 | 无 |

合计 994 块（token 层 5 块在 B1、B2 各处理一次，只计一遍）；行数随迁移变动，不作为口径。每批的退役名单是该批结束后「引用数归零」的那一批 token，逐批累加即覆盖全部旧名字；`@theme` 的 6 个 Tailwind radius 变量保留，但只取 4px 与 8px 两值。

### 1.1 两条轨：方向定了以后只跑结构轨

方向未定之前，取值可能整体作废，但形态问题不会作废。所以把迁移拆成两条互不阻塞的轨：

**轨 1（结构轨，现在就能跑）**：只改规则形态，一律继续引用**现有的 token 名**。跑完页面该有的层级、密度、平面化都到位，颜色仍是旧色。任何一批都能单独构建、单独回滚。

**轨 2（取值轨，方向定后跑）**：换数值、换 token 名、删旧定义。它能机械执行，不需要设计判断。

规则：结构轨期间不许改名（改名会把「形态错」和「名字错」两种问题混在一起）；取值轨期间不许改形态。两轨都做完，等价于本文 13 批（B1–B12 加 B3b）的全量迁移。

| 批次 | 轨 1 要做的结构项 | 轨 2 才做的取值项 |
| --- | --- | --- |
| B1 | 建立新 token 层，值先别名到现有 token | — |
| B2 | 别名层收拢为一层（形式变化） | 27 色 × 2 主题的真实色值 |
| B3 | 页头改固定 52→44 高；分栏手柄由 4px 视觉线改为 1px 线 + 8px 热区；图标由 11 档并到 5 档（改选哪个尺寸类） | 留白 24/16、标题 16px、图标像素值 |
| B3b | 删 5 条 `.gm-icon-tone-olympic-*` 规则，`DashboardPage` 五个 tone 改 `muted`，去掉颜色承担分类 | — |
| B4 | 按钮四态矩阵重写；输入框加静止边界 + 2px 焦点环；空态改单图标 + 两行文字；加全局 `prefers-reduced-motion` 块；删无限摆动动画 | 高度 32/28/36、圆角 4、徽标 18 |
| B5 | 行高由内边距堆高改为 `min-height`；搜索结果由卡片改整宽行；列表头改固定高；选中态改底色 + 左竖条 | 40/56/44、水平内边距 12、字号 13 |
| B6 | 卡片去掉投影层；统计格统一 span；去掉左侧彩色 rail | 24px 间距、16px 内边距 |
| B7 | 仅一处：移动端底部固定条改 `env(safe-area-inset-bottom)` | 10/14/18/40/76/80 → 8 档；行高 |
| B8 | 设置行改三段对齐；删除输入框固定宽度约束改占满列；模态去背景模糊 | 520/720 宽、48px 分组间距 |
| B9 | 取消左栏 280/300 宽，改单列 | 720 内容宽、20px 标题 |
| B10 | — | 间距与圆角 |
| B11 | 字族分工（界面等宽 / 阅读系统无衬线）；正文阶由 13 换到 15；行长 66ch；代码块换字族；删 420px 最小高 | 26/20/17 三档标题 |
| B12 | 删除 7 条死定义 | — |

结论：方向定下来以后，**能立刻跑的是 B1、B2（形式部分）、B3、B3b、B4、B5、B6、B8、B9、B11、B12**；B7、B10 几乎纯取值，可以整批押后；B4、B5 里混的取值项等取值轨再补。

---

## B1 token 层骨架（零视觉）

改动：在 `:root` 之后插入 `docs/design/DESIGN-V2.md` 附录 B 的完整 token 块，值暂时写成对旧 token 的引用（`--gm-canvas: var(--gm-color-bg-canvas)` 这种形式）。旧 token 一个不删。

- 只新增定义，不改任何规则。
- 此时新 token 全部可用但没有规则引用它们，页面渲染结果必须与改动前逐像素一致。
- 验收：构建通过；截图与改动前 diff 为空；`rg 'var\(--gm-(canvas|sp-[0-9]|fs-|font-ui|canvas)' src/index.css` 只命中 token 定义行。

风险：无。这一步纯新增。

## B2 颜色值与别名层

轨：本批跨两轨。结构轨只做「别名层收拢为一层」这一件形式改动（把 17 个别名指向新 token 名，色值不变）；27 色 × 2 主题的真实色值属于取值轨，等方向定了再跑。

改动：把 B1 里所有 `var(--旧)` 形式的别名值替换成纸面实值（27 个颜色，单主题；原双主题取值作废），并把 `@theme` 的 6 个 Tailwind radius 变量收到 4 档（`--radius-sm: 4px`、`--radius-md: 4px`、`--radius-lg: 8px`、`--radius-xl: 8px`、`--radius-2xl: 8px`，`--radius-default: 4px` 保留）。别名层（`--bg`、`--text`、`--accent`、`--green` 等）改成指向新 token。

退役 11 个（只被 token 层自身引用的最底层色与移动端偏移）：

```
--gm-color-bg-canvas --gm-color-border-strong --gm-color-brand --gm-color-brand-hover
--gm-color-pink --gm-color-purple --gm-color-text-inverse --gm-color-warning
--gm-size-mobile-bottom-content-offset --gm-size-mobile-dashboard-bottom-offset --gm-size-mobile-selection-bottom-offset
```

可见变化：整站底色从偏绿灰变成暖灰，正文与层级文字的对比度整体提高（主文字 16.17:1、次级 9.61:1、三级 6.30:1）。这是唯一一次「整站同时变样」的批次。

验收（两条都要过）：

1. **14 个页面 × 2 套主题 = 28 张全量截图**，逐个与改动前比对：仪表盘、笔记、对话、剪贴板、计划、导入、外部文件、收藏、搜索、AI 记录、Claude 配置、仓库、设置、编辑器首页。只截首屏不算过。
2. 用取色器核对 `--gm-canvas`、`--gm-surface`、`--gm-text` 三个值；`--gm-color-pink` 等 11 个 token 引用数归零。

提交要求：**单独一个 commit**，不与任何其它批混提；提交说明里附 28 张截图所在目录。

风险：视觉全站变化，且此时字号、间距还是旧值，画面会「配色新、排版旧」。这是预期中间态，不要在 B2 顺手调版式。

## B3 页面外壳与骨架

范围：`gm-page`、`gm-app`、`gm-layout`、`gm-sidebar`、`gm-bottom`（移动底栏）、`gm-pane`、`gm-split`、`gm-toolbar`、`gm-icon`、`gm-section`、`gm-muted`、`gm-min`、`gm-selectable`、`gm-inline`，以及 `body` / `*` / `#root` / `button` / `select` / `a:focus-visible` / `textarea:focus` / 滚动条 / `@media (max-width: 860px)` / `html[data-mobile]`。共 157 块（图标类规则里的 5 条 tone 规则已划到 B3b）。

改动：

- 页面留白：`--gm-page-pad-x` → `--gm-sp-6`，`--gm-page-pad-y` → `--gm-sp-5`。
- 侧栏与分栏：`--gm-size-sidebar-width` → `--gm-w-sidebar`，`--gm-size-split-pane-left-*` → `--gm-w-pane-*`，手柄 4px → `--gm-w-handle`（1px 线 + 8px 热区）。
- 页头/分栏头：`--gm-pane-header-height`（50）→ `--gm-h-pane-header`（44）；标题字号 `--gm-font-sm` → `--gm-fs-ui-lg`（16）；图标统一 `--gm-icon-lg`。
- 图标族：`--gm-icon-2xs/xs/md/result/empty` 收敛到 `--gm-icon-xs/sm/md/lg/xl` 五档（`gm-icon-size-*` 七个单行规则一并改）。
- 分类图标去色不放在本批，见 B3b（用户可感知的产品变化单独成批，抱怨时能定位到具体哪一步）。
- 字重：本批出现的 760 / 700 → 600 或 720 合并为 600。
- `--gm-sync-shimmer-bg`（渐变）删除，同步中改用旋转图标。

退役 31 个：

```
--bg-danger --gm-color-muted-icon --gm-empty-icon-color --gm-find-bar-app-left
--gm-icon-2xs --gm-icon-empty --gm-icon-md --gm-icon-render-size --gm-icon-result
--gm-icon-sm --gm-icon-xs --gm-nav-item-pad-x --gm-nav-item-pad-y --gm-nav-stack-gap
--gm-offset-split-handle-hover --gm-page-header-icon-size --gm-page-header-title-font
--gm-pane-header-height --gm-pane-header-icon-size --gm-pane-header-title-font
--gm-size-layout-toggle --gm-size-scrollbar --gm-size-sidebar-collapsed-width
--gm-size-sidebar-width --gm-size-split-collapsed-rail-width
--gm-size-split-handle-hover-width --gm-size-split-handle-line-width
--gm-size-split-handle-width --gm-size-split-pane-left-default --gm-sync-shimmer-bg
--gm-z-bottom-nav
```

可见变化：页头矮 8px（52→44），侧栏内边距变紧，图标尺寸从 11 档收到 5 档，页边留白左右 24 / 上下 16。分类图标仍是彩色，等 B3b。

验收：构建通过；侧栏、页头、分栏手柄可拖动且热区宽度 8px；31 个 token 引用数归零。

风险：手柄从 4px 视觉线改成 1px 线 + 8px 热区，拖拽命中范围要在四种布局下试一遍（单栏、双栏、收起侧栏、移动端）。

## B3b 分类图标去色

插在 B3 之后、B4 之前。单独成批的理由：用户直接感知的产品变化，混在页面外壳里出了抱怨分不清是哪一步导致的。

范围：`.gm-icon-tone-olympic-*` 五条单行规则与 `DashboardPage.tsx` 里五个 `tone="olympic-*"` 调用点，加上 `gm-icon-tone-*` 里 category / provider 的颜色分支。共 5 块。

改动：

- 五条 tone 规则删除；`DashboardPage` 的 `categoryVisuals` 五处 `tone` 改 `"muted"`。
- 分类身份改由图标形状 + 文字标签承担（图标本来就不同：MessageSquare / BookOpen / FileText / Clipboard / Lightbulb）。
- 其余 tone（accent / success / warning / danger）保留，它们表达状态，不表达分类。

退役 9 个：`--gm-olympic-blue` `--gm-olympic-yellow` `--gm-olympic-black` `--gm-olympic-green` `--gm-olympic-red` `--gm-category-gray` `--gm-category-teal` `--pink` `--purple`。

可见变化：仪表盘与各列表里的分类图标从五种颜色变成同一种灰；同一屏上的彩色种类从最多五种降到零（状态除外）。

验收：构建通过；仪表盘、笔记、对话、剪贴板、计划五个页面的分类图标全部单色；把整屏截图转灰度，分类信息不减少任何一项（形状与文字仍可区分）；9 个 token 引用数归零。

风险：这是本轮唯一「功能没变但用户会立刻发现」的改动。回退成本一条 revert，建议单独放行、单独告知产品。

## B4 基础组件

范围：`gm-button`、`gm-control`、`gm-switch`、`gm-badge`、`gm-menu`、`gm-segment`、`gm-compact`、`gm-kbd`、`gm-toast`、`gm-notification`、`gm-loading`、`gm-spinner`、`gm-empty`、`gm-status`、`gm-error`、`gm-floating`、`@keyframes`。共 92 块。

改动：

- 按钮按 `DESIGN-V2 §6.1` 重写四种类型的状态矩阵；高度 32 / 小 28 / 大 36，圆角 `--gm-r-2`，字重 600。
- 输入框：高度 32，底 `--gm-input-bg`，边 `--gm-line-strong`，聚焦边 `--gm-focus-ring` + 2px 焦点环。
- 开关：`--gm-size-switch-*`（44/24/18/3）→ 36/20/16/2 固定值，删除四个 token。
- 徽标：高度 18，内边距 6，字号 `--gm-fs-micro`，圆角 `--gm-r-1`。
- 菜单与弹出层：`--gm-shadow-popover` / `--gm-shadow-soft` → `--gm-shadow-1`；圆角 `--gm-r-3`。
- 空态：图标 `--gm-icon-xl`（24），主标题 `--gm-fs-ui`（13），内边距 `--gm-sp-7`。
- **全局 `prefers-reduced-motion` 块落在本批**，写在 `index.css` 顶部；`.gm-spinner` 作为唯一动画类名，删除 `gm-dashboard-quick-note-hand-nudge` 的无限动画与 `transition: background 0.1s`。
- 状态胶囊、结果标记的 28px 图标 → 24px。

退役 16 个：

```
--accent-hover --gm-offset-floating-toast --gm-shadow-danger-ring --gm-shadow-popover
--gm-size-drop-result-list-max-height --gm-size-empty-state-min-height --gm-size-error-log-max-height
--gm-size-floating-toast-gutter --gm-size-floating-toast-width --gm-size-kbd-min-width
--gm-size-spinner-sm --gm-size-status-pill-min-height --gm-size-switch-height
--gm-size-switch-padding --gm-size-switch-thumb --gm-size-switch-width
```

可见变化：按钮变矮变方（圆角 6→4）、输入框有可见边界、开关变小、菜单阴影更收敛、Toast 变窄、所有悬停只用底色不用投影。

验收：构建通过；键盘 Tab 走一遍工具栏、设置行、对话框，焦点环全部可见且不被裁切；开关在浅色主题下轨道边界 ≥3:1；无限动画只剩 `.gm-spinner`。

风险：焦点环 `outline-offset` 在 `overflow: hidden` 容器里会被裁掉，列表行用内描边（`-2px`），其他控件用外描边（`+2px`），本批要逐个容器确认。

## B5 列表与行

范围：`gm-list`、`gm-note`、`gm-search`、`gm-conversation`、`gm-import`、`gm-external`、`gm-file`、`gm-detail`、`gm-center`、`gm-load`、`gm-ai`。共 104 块。

改动：

- 行高从「内边距堆高度」改为 `min-height`：单行 40px、带摘要 56px、触摸 44px；删除 `--gm-row-pad-y`、`--gm-list-row-pad-y`、`--gm-list-row-pad-y-compact` 的垂直内边距用法，水平内边距统一 `--gm-sp-4`。
- 列表头：固定 `--gm-h-pane-header`（44），标题 `--gm-fs-ui-lg`，删除 `--gm-list-header-pad-y`。
- 选中态：`--gm-selected` 底 + 左 2px `--gm-accent`，去掉描边与投影。
- 搜索结果的卡片形态改平面行：删除卡片底、边、`--gm-shadow-card`、圆角；时间列右对齐 `tabular-nums`。
- 详情栏内边距 `--gm-sp-6` / `--gm-sp-5`，正文行高 `--gm-lh-read`。

退役 4 个：`--gm-control-height-md`、`--gm-detail-pad-mobile-y`、`--gm-warning-soft`、`--text-primary`。

注：`--text-primary` 是被引用但从未声明的幽灵变量（`.gm-external-file-change-banner` 在用），现在靠颜色继承凑巧生效，改后写成 `--gm-text`。

可见变化：所有列表密度变匀，带摘要的行比以前高，搜索结果从「浮起卡片」变「一行一条」。

验收：构建通过；笔记、搜索、对话、收藏四个列表的滚动不跳；带两行摘要的行不裁切文字；↑/↓ 移动时选中块不抖。

风险：行高改 `min-height` 会改变剪贴板虚拟滚动的可视数量（B7 才处理剪贴板，此处只看列表类）。

## B6 卡片与面板

范围：`gm-card`、`gm-panel`、`gm-dashboard`、`gm-state`、`gm-version`、`gm-image`、`gm-mono`、`gm-export`、`gm-find`。共 79 块。

改动：

- 卡片：去 `--gm-shadow-card` 与 `--gm-shadow-soft`，底 `--gm-surface` + 边 1px `--gm-line` + 圆角 `--gm-r-2`，内边距 `--gm-sp-5`。
- 仪表盘统计格：6 栏统一 `span 2`，删除 `span 3` 分支与左侧彩色 rail（`--gm-size-card-rail`）；统计数字 `--gm-fs-title`（20）/600；值后标签 `--gm-fs-micro`。
- 模块间距 `--gm-section-gap` → `--gm-sp-6`（24）。
- 删除 `--gm-size-dashboard-quick-note-*`、`--gm-size-dashboard-cli-desc-max-width` 的宽高约束，改由栅格与 `72ch` 决定。

退役 9 个：

```
--gm-mobile-dashboard-bottom-padding --gm-row-pad-y --gm-shadow-card --gm-shadow-soft
--gm-size-dashboard-cli-desc-max-width --gm-size-dashboard-quick-note-actions-width
--gm-size-dashboard-quick-note-min-height --gm-size-find-input-min-height --gm-toolbar-gap
```

可见变化：仪表盘从「六张不等宽卡片 + 彩色竖条」变成「一条等宽统计带 + 最近条目列表」；所有卡片失去投影。

验收：构建通过；仪表盘四档宽度（≥1280、1024、768、390）下统计带不断行；卡片之间没有被双线分隔。

风险：仪表盘是首页，改动最显眼，需与产品确认「统计带是否保留六项」。

## B7 剪贴板族

范围：`gm-clipboard`、`gm-clip-*`（含 clip-cleaner）、`gm-quick`（快捷粘贴）。共 122 块。

改动：行高改 `min-height`（40/56/44）；图片卡的圆角与边框统一；`clip-cleaner` 的 10/14/18/40/76/80px 字面量全部落回 `--gm-sp-*`；快捷粘贴弹层宽 320、圆角 `--gm-r-3`、阴影 `--gm-shadow-1`；底部固定条的移动端偏移改为 `52px + env(safe-area-inset-bottom)`。

退役 28 个：

```
--bg-success --gm-category-blue --gm-category-green --gm-category-yellow --gm-color-bg-hover
--gm-color-border-subtle --gm-color-danger --gm-color-success --gm-color-text-primary
--gm-color-text-secondary --gm-control-height-sm --gm-danger-soft --gm-list-header-pad-x
--gm-list-header-pad-y --gm-mobile-bottom-selection-padding --gm-mobile-fixed-bar-bottom
--gm-offset-menu-popover-top --gm-selection-border --gm-shadow-bottom --gm-shadow-bottom-soft
--gm-shadow-control --gm-shadow-control-strong --gm-shadow-inset-top --gm-size-divider
--gm-size-menu-popover-min-width --gm-size-mobile-bottom-nav-height
--gm-size-quick-paste-list-max-height --gm-size-quick-paste-result-icon
```

可见变化：剪贴板列表更密，图片卡边框变细，剪贴清洁预览页的 76px 大留白收成 32px。

验收：构建通过；滚到列表底部后新增条目位置不跳；图片卡在 2 倍图下不模糊；快捷粘贴（⌘⇧V）弹层位置在光标上下都正确。

风险：剪贴板有滚动位置保持与虚拟列表逻辑，改行高必须回归「滚动中新增条目」这一个场景。

## B8 设置页

范围：`gm-settings`（含各分组、模态、日志区）。共 135 块。

改动：设置行改为「图标 20px + 标签 13/400 + 值 13/400 右对齐」三段；输入框宽度约束（`--gm-size-settings-input-*`、`copy-*`、`range-width`）全部删除，改为占满所在列；模态宽 520 / 720，阴影 `--gm-shadow-2`，圆角 `--gm-r-3`；日志区最大高 `40vh`；分组之间 `--gm-sp-8`（48）。

退役 25 个：

```
--gm-accent-border --gm-blur-modal --gm-danger-border --gm-overlay-dialog --gm-page-pad-bottom
--gm-page-pad-mobile-x --gm-page-pad-mobile-y --gm-row-pad-x --gm-settings-row-icon-gap
--gm-size-settings-copy-lg --gm-size-settings-copy-md --gm-size-settings-copy-sm
--gm-size-settings-input-branch --gm-size-settings-input-proxy --gm-size-settings-input-remote
--gm-size-settings-modal-inline --gm-size-settings-modal-lg --gm-size-settings-modal-max-height-lg
--gm-size-settings-modal-max-height-md --gm-size-settings-modal-md --gm-size-settings-progress-width
--gm-size-settings-range-width --gm-size-settings-row-icon-offset --gm-success-border --gm-warning-border
```

可见变化：设置页从「每行一个自由宽度控件」变成「右列固定对齐」，模态不再做背景模糊。

验收：构建通过；16 个设置分组逐个滚一遍；窄窗口（768）下输入框不溢出；模态内滚动条出现时内容不抖。

风险：`--gm-page-pad-bottom` 在此批退役，说明页底留白只在这一族里用；删除后要确认其他滚动页面底部不被遮挡。

## B9 设置向导

范围：`gm-setup`。共 134 块。

改动：取消左栏 280/300 宽，改单列 720（`--gm-w-content-max`）；步骤索引 24px 用 `--gm-icon-xl`；候选列表最大高 `40vh`；按钮全部走 `DESIGN-V2 §6.1`；引导性大标题从 24px 降到 20（`--gm-fs-title`）。

退役 27 个：

```
--bg-input --border-strong --gm-card-pad-x --gm-card-pad-y --gm-font-2xl --gm-icon-dot
--gm-icon-lg --gm-leading-title --gm-mobile-bottom-content-padding --gm-provider-bitbucket
--gm-provider-gitee --gm-provider-github --gm-provider-gitlab --gm-provider-other
--gm-radius-none --gm-radius-pill --gm-size-settings-log-max-height
--gm-size-setup-candidate-list-max-height --gm-size-setup-logo-box
--gm-size-setup-nav-back-min-width --gm-size-setup-nav-back-min-width-mobile
--gm-size-setup-panel-max-width --gm-size-setup-sidebar-width
--gm-size-setup-sidebar-width-done --gm-size-setup-step-index --red --yellow
```

可见变化：向导从「左导航 + 右内容」变成「单列居中」，供应商选择不再用品牌色。

验收：构建通过；首次启动完整走一遍向导（选仓库 → 授权 → 完成）；步骤回退按钮在窄屏可用；候选列表超过 10 项时可滚动。

风险：向导是首启必经路径，改动影响新用户第一印象；建议放在 B10 之前完成，避免和其他批次的样式互相干扰。

## B10 其余页面

范围：`gm-onboarding`、`gm-privacy`、`gm-vault`、`gm-drop`。共 88 块。

改动：引导清单行高与设置行一致；隐私弹窗 480 宽、圆角 `--gm-r-3`；仓库解锁页输入框 32 高；拖拽导入卡最大宽 720、虚线改 1px `--gm-line-strong`、拖入态用 `--gm-accent` 描边。

退役 36 个：

```
--bg --bg-card --bg-hover --gm-accent-soft --gm-color-bg-selected --gm-color-on-accent
--gm-color-text-muted --gm-control-height-xs --gm-control-pad-x --gm-control-pad-y
--gm-font-2xs --gm-font-lg --gm-font-xl --gm-icon-empty-lg --gm-icon-hero --gm-icon-text-gap
--gm-leading-normal --gm-leading-tight --gm-list-row-pad-x --gm-list-row-pad-y --gm-nav-item-gap
--gm-overlay-scrim --gm-overlay-soft --gm-page-pad-x --gm-page-pad-y --gm-radius-lg
--gm-radius-xs --gm-row-pad-y-comfort --gm-shadow-modal --gm-size-card-rail
--gm-size-drop-card-max-width --gm-space-0 --gm-space-3 --gm-space-7 --gm-z-overlay --green
```

可见变化：这几个页面基本只变间距与圆角，观感变化最小。

验收：构建通过；拖拽导入用真实文件试一次（单文件、多文件、目录）；解锁错误提示位置不跳。

风险：B10 之后 `--page-pad-*`、`--list-row-pad-*` 全部退役，任何遗漏的引用会直接变成无效值，构建不报错但样式丢失。验收时要把这 36 个 token 的引用数全部验零，并肉眼过一遍全站页面。

## B11 阅读面与打印

范围：`gm-markdown`、`.markdown-body`、`gm-editor`、`gm-code`、`@media print`、`#gitmemo-print-root`、其余 `@media (max-width: 768/760/480)`、`@media (prefers-reduced-motion)`。共 73 块。

改动：正文 `--gm-font-read` 15px / 1.72 / `66ch`；标题 `26/20/17` 三档；代码块 `--gm-font-ui` 13px / 1.6；打印根节点保留 `pt` 单位（`DESIGN-V2 §0.1` 豁免），但字号阶与 `letter-spacing` 按 9pt / 0.02em 保留；编辑器占满父容器，删除 420px 最小高。

退役 43 个：

```
--accent --border --gm-card-content-gap --gm-card-header-gap --gm-card-pad-mobile
--gm-color-bg-elevated --gm-color-bg-inset --gm-color-bg-page --gm-color-bg-surface
--gm-control-gap --gm-control-height-lg --gm-control-height-xl --gm-control-pad-x-lg
--gm-control-pad-y-lg --gm-detail-pad-mobile-x --gm-detail-pad-x --gm-detail-pad-y
--gm-font-md --gm-font-mono --gm-font-sans --gm-font-sm --gm-font-xs --gm-icon-xl
--gm-leading-heading --gm-leading-none --gm-leading-reading --gm-leading-reading-mobile
--gm-leading-relaxed --gm-radius-md --gm-radius-sm --gm-row-gap --gm-section-gap
--gm-section-gap-lg --gm-size-code-editor-min-height --gm-size-mobile-row-min-height
--gm-space-1 --gm-space-2 --gm-space-4 --gm-space-5 --gm-space-6 --gm-z-sticky --text
--text-secondary
```

可见变化：Markdown 正文变大（13 → 15）、行距拉开、行长受限；这是「长时阅读优化」真正生效的一批。

验收：构建通过；打开一篇长笔记，检查 66ch 行长与代码块横向滚动；打印预览（⌘P）与改动前逐页比对；浅色主题下正文对比度 15.75:1。

风险：43 个 token 在此批退役，是全表最大的一批；`--text` / `--border` / `--accent` 这类高频别名的删除必须一条不漏，否则样式静默失效。建议本批改完立刻跑一次全站截图，与 B2 之后的基线对比。

## B12 收尾与上限

改动：删除最后 7 条无人引用的定义，把 `--gm-*` 锁到 88。

```
--gm-list-row-pad-y-compact --gm-size-split-pane-left-min --gm-size-split-pane-left-max
--gm-size-split-pane-right-min --gm-accent-muted --gm-find-bar-left
--gm-icon-render-size（就地声明的中间变量）
```

`@theme` 里的 `--radius-sm/md/lg/xl/2xl/default` 不删：它们是 Tailwind `rounded-*` 工具类的入口，只在 B2 时把值收到 4px 与 8px 两档（`rounded-none` 0、`rounded-sm`/`rounded-md`/`rounded` 4、`rounded-lg`/`rounded-xl`/`rounded-2xl` 8）。

验收（三条都要过）：

```sh
# 1. token 数量（只数 --gm-*，不含 @theme 的 radius）
rg -c '^\s+--gm-[a-z0-9-]+:' desktop/src/index.css   # 期望 88

# 2. 字面量归零（除 --gm-* 定义行与打印块）
rg -n 'font-size:\s*[0-9]|border-radius:\s*[0-9]|gap:\s*[0-9]' desktop/src/index.css

# 3. 白名单外字重、非法动效
rg -n 'font-weight: *(500|550|650|700|750|760|780|800)' desktop/src/index.css
rg -n 'transition:\s*all' desktop/src/index.css
rg -n 'cubic-bezier' desktop/src/index.css | rg -v '0\.2, 0, 0, 1'
```

可见变化：无。

风险：无新增视觉风险；这一批只做减法，但「删掉还能用」的假象最容易漏检，必须三条命令都为空才提交。

---

## 2 批次之间的依赖与顺序约束

- B1 必须最先：新 token 层是所有后续批次的名字来源。
- B2 必须紧接 B1，且必须在 B3 之前：颜色先定，后面的间距与字号改动才有稳定参照。B2 单独 commit、单独评审、单独回滚。
- **B3b 必须紧跟 B3**：它只动图标 tone，独立于其它一切；放早了会和 B3 的图标档位改动互相干扰，放晚了会混进 B4 的组件改动里，导致「图标变灰」这条产品变化说不清归属。
- B4（按钮与输入框）与 B5（列表与行）都碰 `--gm-control-height-*`，按 B3 → B3b → B4 → B5 顺序做，避免同一 token 被两批同时改。
- B7、B8、B9、B10、B11 互相独立，可以并行派人，但共用 B4 的组件规格，必须在 B4 之后。
- B12 只能最后做。

### 方向未定时的执行顺序（只跑结构轨）

B1 → B3 → B3b → B4（结构项）→ B5（结构项）→ B6 → B8 → B9 → B11。

B2、B7、B10 与 B4/B5 里的取值项一律押后到方向落定，理由与做法见 §1.1。押后不影响构建：结构轨里所有改动继续引用现有 token 名，颜色和数值都还是旧的。

## 3 回滚

每批一个本地提交，回滚即 `git revert <commit>`。除 B2 外，任何一批单独 revert 都不会让其它批次的引用失效（因为旧 token 直到最后一个引用批次才删）。

B2 的单独提交是硬要求：它一次改掉全站颜色，和别的批混在一起就没法判断「画面变了」是哪一步造成的，回滚也会连带撤掉无关改动。

## 4 已知陷阱

1. **单行规则**：文件里有 69 条单行规则（`.gm-icon-size-dot { ... }` 这种），全量搜索替换容易漏，用 `rg` 按 token 名找，不要按行号。
2. **就地声明的局部变量**：`--gm-icon-render-size` 写在 `.gm-icon-size-*` 单行规则里，不在 token 层，按 token 名搜才能找到。
3. **`color-mix()` 与 `rgba()`**：`--gm-warning-border`、`--gm-danger-border` 这类由 `color-mix` 生成的 token 删除后，规则里若还有 `color-mix`，会直接报无效值。
4. **Tailwind `@theme`**：`rounded-md` 等工具类读的是 `--radius-md`，改这组变量会影响 TSX 里的类名效果，改完要搜一遍 `rounded-`。
5. **打印块豁免**：`#gitmemo-print-root` 保持 `pt` 与 `letter-spacing`，不要被「字面量归零」的检查命令顺手改掉。
6. **幽灵变量**：`--text-primary`（在 `.gm-external-file-change-banner` 里被引用）与 `--gm-icon-render-size`（在 `.gm-icon-size-*` 里就地声明）是不在 token 层声明的两个名字（后者在单行规则里就地声明，前者根本没有定义）。改到它们的规则时不要当成「旧 token 映射」处理，直接换成 `--gm-text` 与新字号 token。
7. **两轨并行时的命名混乱**：结构轨不许改名、取值轨不许改形态。若发现某批必须两件一起改（例如 B5 的行高机制依赖新的高度 token），把改名推到该批最后一小步并单独标注，不要夹在中间。
