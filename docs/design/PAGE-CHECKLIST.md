# 逐页合规检查表

用途：改笔记、搜索、剪贴板、设置页的人，逐条对，对不上就是没改完。
每条都写成可判定的句子。不含设计理念。

## 先看这个数字

全仓当前未迁移的字面量（`rg` 实跑，逐类核对过）：

| 类别 | 处数 | 判定 |
| --- | --- | --- |
| 写死的边框 | **0** | 107 处已全部改为 `var(--gm-border-w)` |
| 写死的圆角 | 8 行 | 全部合法：7 行 `0`、1 行 `50%`（头像/圆形） |
| 写死的行高与控件高 | **0** | 行与控件已全部走 `--gm-density-*`；剩下 14 处 `height: Npx` 是图标框、进度条、开关这类组件常量，不是行高 |
| 写死的色值 | 17 | 其中 11 行在打印块 `#gitmemo-print-root`（规范豁免）、6 行在图片预览 `gm-clip-cleaner-preview`（叠在照片上的控件） |
| 写死的字号 / 内距 | 7 | 待迁移 |

结论：**皮肤层的漏洞已经不在「值」上，而在七个还没换骨架的页面**。图片预览那 6 行色值是目前唯一「组件里写死颜色」的地方——它叠在照片上，两套皮肤都该是白字黑底，建议抽一个媒体遮罩变量正式化，否则它会一直挂在漏洞清单里。

## 0 三页共用的四个变量

| 变量 | 值 | 用在哪 |
| --- | --- | --- |
| `--gm-border-w` | 浅色 2px / 深色 1px | 所有可见边框、分区线、控件边界 |
| `--gm-radius-control`（待新增） | 浅色 0 / 深色 4px | 按钮、输入框、标签、选中块 |
| `--gm-radius-panel`（待新增） | 浅色 0 / 深色 4px | 面板、弹层 |
| `--gm-density-*` | row 32 / row-compact 30 / header 34 / control 34 | 行高、头高、控件高 |

通用判定：

- 出现 `1px solid` 即违规，必须写 `var(--gm-border-w) solid <color>`。
- 出现 `border-radius: 3px|4px|6px|8px` 即违规，必须写 `var(--gm-radius-control)` 或 `var(--gm-radius-panel)`。
- 出现 `height: 32px|34px` 即违规，必须写 `var(--gm-density-row)` 或 `var(--gm-density-header)`。
- 出现 `#` 开头色值或 `rgba(` 即违规，除非在 `:root` / `[data-theme]` 皮肤块内。

自查命令（在这四页的规则段上必须为空）：

```sh
rg -n '1px solid|border-radius: *[0-9]|height: *(30|32|34|36)px' desktop/src/index.css
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' desktop/src/index.css | rg -v -- '--gm-'
rg -n 'font-size: *[0-9]|padding: *[0-9]px|gap: *[0-9]px' desktop/src/index.css | rg -v '--gm-'
```

---

## 1 笔记页

涉及类名：`.gm-pane-tab-header`、`.gm-pane-header`、`.gm-inst-list-rows`、`.gm-inst-list-row`、`.gm-note-composer`、`.gm-note-title-input`、`.gm-note-textarea`、`.gm-file-detail-toolbar`、`.gm-detail-pane`

### 1.1 分区方式

| 位置 A | 位置 B | 用什么 |
| --- | --- | --- |
| 页头 | 列表 | 页头下沿 `var(--gm-border-w) solid var(--gm-line)` |
| 列表栏 | 详情栏 | 竖线 `var(--gm-border-w) solid var(--gm-line)`，只在双栏布局出现 |
| 输入区 | 列表 | 输入区下沿一条 `var(--gm-border-w) solid var(--gm-line)`，输入区本身无底色、无边框 |
| 条目 | 条目 | 行下沿一条 `var(--gm-border-w) solid var(--gm-line)` |
| 详情工具栏 | 正文 | 工具栏下沿 `var(--gm-border-w) solid var(--gm-line)` |

禁止：列表栏或详情栏出现卡片底色、圆角容器、投影。

### 1.2 行高与控件高

| 元素 | 变量 | 值 |
| --- | --- | --- |
| 列表行 | `--gm-density-row` | 32px |
| 分栏头 / 页头 | `--gm-density-header` | 34px |
| 标题输入框 | `--gm-density-control` | 34px |
| 多行输入框 | `min-height: 96px`（唯一允许的字面量） | — |
| 工具栏按钮 | `--gm-density-row-compact` | 30px |

### 1.3 颜色来源

允许：`--gm-canvas`、`--gm-panel`、`--gm-inset`、`--gm-hover`、`--gm-selected`、`--gm-on-selected`、`--gm-line`、`--gm-line-strong`、`--gm-text`、`--gm-text-2`、`--gm-text-3`、`--gm-accent`（焦点环也用它，当前没有独立的焦点环变量）。

禁止：分类色、`--gm-tag-*`（笔记页没有类型标签）、任何字面量色值。

选中行判定：`background: var(--gm-selected)` + 左侧 2px `var(--gm-accent)` 竖条，**文字色不变**（仍用 `--gm-text`）。`--gm-on-selected` 未接线，不得在组件里引用——把选中底改成近黑再指望它反白，就是黑底黑字。

### 1.4 窄屏

| 宽度 | 必须发生 |
| --- | --- |
| ≤768 | 列表与详情不得并排：详情改为整屏覆盖，左栏不显示；返回按钮出现在详情工具栏最左 |
| ≤390 | 分栏头只留标签与新建按钮，计数徽标隐藏；列表行只保留标题与时间两列，来源列隐藏 |

---

## 2 搜索页

涉及类名：`.gm-search-header`、`.gm-search-results`、`.gm-search-result-card`、`.gm-search-result-count`、`.gm-search-list-pane`

### 2.1 分区方式

| 位置 A | 位置 B | 用什么 |
| --- | --- | --- |
| 搜索框 | 结果计数 | 留白 `var(--gm-space-4)`，不画线 |
| 结果计数 | 结果列表 | 一条 `var(--gm-border-w) solid var(--gm-line)` |
| 结果行 | 结果行 | 行下沿 `var(--gm-border-w) solid var(--gm-line)` |
| 双栏时列表栏 | 详情栏 | 竖线 `var(--gm-border-w) solid var(--gm-line)` |

禁止：每条结果做成卡片（无底色、无边框、无圆角、无投影）。结果行是整宽行，不是块。

### 2.2 行高与控件高

| 元素 | 变量 | 值 |
| --- | --- | --- |
| 搜索输入框 | `--gm-density-control` | 34px |
| 结果行 | `--gm-density-row` | 32px |
| 结果计数行 | `--gm-density-row-compact` | 30px |

### 2.3 颜色来源

允许：同 §1.3，另加 `--gm-tag-*`（结果行若有类型标签）。
禁止：命中词用高亮底色（只允许 `font-weight: 600` + `--gm-text`）。

### 2.4 窄屏

| 宽度 | 必须发生 |
| --- | --- |
| ≤768 | 结果列表与详情不得并排；详情整屏覆盖，返回按钮在左 |
| ≤390 | 结果行隐藏来源列，只留标题与时间；结果计数改为单行短文案（「12 条」），去掉耗时 |

---

## 3 剪贴板页

涉及类名：`.gm-clipboard-filter-bar`、`.gm-clipboard-list-body`、`.gm-clipboard-clip-item`、`.gm-clipboard-back-to-top`、`.gm-clipboard-filter-button`

### 3.1 分区方式

| 位置 A | 位置 B | 用什么 |
| --- | --- | --- |
| 过滤条 | 列表 | 一条 `var(--gm-border-w) solid var(--gm-line)` |
| 剪贴项 | 剪贴项 | 每条下沿 `var(--gm-border-w) solid var(--gm-line)` |
| 剪贴项内部 | 文字与操作 | 留白，不画内部分割线 |
| 列表 | 详情 | 竖线 `var(--gm-border-w) solid var(--gm-line)`，仅双栏 |

禁止：剪贴项用左侧彩色条表示类型（类型靠文字标签，颜色用 `--gm-tag-*` 只在标签上）。

### 3.2 行高与控件高

| 元素 | 变量 | 值 |
| --- | --- | --- |
| 过滤条 / 列表头 | `--gm-density-header` | 34px |
| 剪贴项（单行） | `--gm-density-row` | 32px |
| 剪贴项（带预览） | `min-height: 56px` | — |
| 过滤按钮 | `--gm-density-row-compact` | 30px |

### 3.3 颜色来源

允许：§1.3 全部，另加 `--gm-tag-clip`（剪贴类标签）、`--gm-warning`（图片待同步提示）。
禁止：为不同来源（终端 / 浏览器 / 图片）分配不同颜色。

### 3.4 窄屏

| 宽度 | 必须发生 |
| --- | --- |
| ≤768 | 单列列表，无详情栏；点条目进整屏详情 |
| ≤390 | 隐藏预览行，只留标题与时间；回到顶部按钮保持右下 44px 热区 |

---

## 4 设置页

涉及类名：`.gm-settings-page`、`.gm-settings-page-header`、`.gm-settings-card`、`.gm-settings-card-header`、`.gm-settings-row`、`.gm-settings-nav-row`、`.gm-settings-modal-*`、`.gm-settings-divider`

### 4.1 分区方式

| 位置 A | 位置 B | 用什么 |
| --- | --- | --- |
| 页头 | 第一个分组 | 留白 `var(--gm-space-5)`，页头下沿一条 `var(--gm-border-w) solid var(--gm-line)` |
| 分组 | 分组 | 上沿一条 `var(--gm-border-w) solid var(--gm-line)`，分组不做卡片 |
| 设置行 | 设置行 | 行下沿 `var(--gm-border-w) solid var(--gm-line)` |
| 行内标签 | 行内控件 | 留白，不画线 |

禁止：分组出现底色、圆角、投影（`.gm-settings-card` 的 `background`/`border-radius`/`box-shadow` 必须分别为 `transparent`/`0`/`none`）。

### 4.2 行高与控件高

| 元素 | 变量 | 值 |
| --- | --- | --- |
| 分组头 | `--gm-density-header` | 34px |
| 设置行 | `min-height: var(--gm-density-row)` | 32px |
| 输入框 / 下拉 / 开关 | `--gm-density-control` | 34px |
| 导航行 | `min-height: var(--gm-density-row)` | 32px |
| 模态对话框 | `max-height: 80vh`，宽 520 或 720（允许的字面量） | — |

### 4.3 颜色来源

允许：§1.3 全部，另加 `--gm-success` / `--gm-warning` / `--gm-danger` 及其 `-tint`（诊断状态）、`--gm-scrim`（模态遮罩）。
禁止：`--gm-tag-*`；控件边界一律 `--gm-line-strong` 且线宽 `var(--gm-border-w)`（浅色即 2px 硬边）。

### 4.4 窄屏

| 宽度 | 必须发生 |
| --- | --- |
| ≤768 | 导航栏与内容不得并排：导航改为顶部一行可横向滚动，内容整宽 |
| ≤390 | 设置行改为两行堆叠（标签一行、控件一行且整宽）；复制按钮与值同行，不换行 |

---

## 5 四页共同的三条硬判据

1. 换肤时布局零位移：在 1440×900 与 390×844 下分别截图，切深浅两套，两两比对的元素坐标必须完全一致。
2. 一行内不得同时出现两种线宽：`var(--gm-border-w)` 与 `1px` 混用即违规。
3. 任何页面不得出现未在 §0 与各页「允许」清单内的变量。

---

## 6 协作复核项（写在这一轮结束时，逐条带现状）

上一轮提的三条问题，写在这里给正在改的人收工时自查。现状是本次复核的实测，不是当初的观察。

### 6.1 `.gm-inst-list-row` 的边框

现状：已改为 `border-bottom: var(--gm-border-w) solid var(--gm-line)`，不再是字面量 `1px`。
判定：`rg -n 'inst-list-row' -A12 desktop/src/index.css | rg 'border'` 应全部为 `var(--gm-border-w)`。
状态：**已闭环**，收工前再跑一次即可。

### 6.2 设置块的尺寸字面量

现状：从 56 处降到 11 处，剩下的都不是颜色与行高，而是组件常量——`outline-offset: 2px/-3px`、`width: 1px`（分隔线）、`max-height: 220px`（日志区）、`min-width: 56px`（复制按钮）、`height/width: 8px|4px|22px`（状态点与滑块）。
判定：`awk '/^\.gm-settings/,/^@media/' desktop/src/index.css | grep -E '#[0-9a-fA-F]{3,6}|rgba?\(|[0-9]+px' | grep -v 'var('` 应只剩上述常量。
状态：**颜色与行高已闭环**；组件常量允许保留，但不要在新增规则里继续写。

### 6.3 笔记页 Esc 回列表

现状：已实现（`NotesPage.tsx` 第 302–317 行，捕获阶段监听 Esc，非编辑态且非移动端时 `closeDetail()`）。
未确认的一点：`closeDetail()` 之后**焦点是否回到当前行**。当前实现只关闭详情，没有显式 `focus()` 列表项。
判定：打开一条笔记 → 按 Tab 聚焦列表行 → Enter 打开 → Esc；此时按 ↑/↓ 应立即移动选中行。若不能，需要在 `closeDetail()` 后对 `[data-on="true"]` 的行调用 `focus()`。
状态：**功能已闭环，焦点待核对**。
