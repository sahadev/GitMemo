# GitMemo UI 语言规则

适用范围：`desktop/src` 下所有界面代码。
优先级：本文与 `docs/design/DESIGN.md` 冲突时以本文为准；本文与 `desktop/src/index.css` 的实际 token 值冲突时以 `index.css` 为准（`DESIGN.md` 已与 token 脱节，见文末附录）。
本文件只定义规则，不引入新 token、新字体、新图标包、新插画、新纹理。

## 0 怎么用这份文件

每条规则带一个等级：

- **J**（硬规则）：违反即驳回，不需要讨论理由。
- **S**（建议）：可以违反，但改动说明里要写一句为什么。
- **N**（现状记录）：描述事实，不作为规则使用。

判定一个界面是否合规，按顺序走三步：查字号档位（§1.5）→ 查颜色种类（§3.4）→ 查间距与动效白名单（§2、§4）。三步都过才算合规。

### 0.1 豁免范围（J）

以下位置不受字号档位、间距字面量、动效白名单约束，其余规则仍然适用：

- `#gitmemo-print-root` 下的打印输出：允许 `pt` 单位、固定毫米边距、非 0 `letter-spacing`。输出目标是纸张，不是屏幕。
- `desktop/src/index.css` 里 `--gm-*` 的 token 定义行本身。
- CodeMirror、Mantine 等第三方组件的内部默认样式：只约束我们覆盖的属性，不要求改写组件内部值。

可直接执行的自检（不通过即存在候选违规，需逐条人工确认）：

```sh
# 字面量字号/间距/圆角（应为空或仅出现在 --gm-* 定义处）
rg -n 'font-size: *[0-9]|padding: *[0-9]|gap: *[0-9]|border-radius: *[0-9]' desktop/src --glob '!index.css'
# 非白名单字重
rg -n 'font-weight: *(500|560|600|620|700|750|760|780|800)' desktop/src/index.css
# 白名单外的时长与缓动
rg -n 'transition:.*(0\.1s|0\.2s|all)' desktop/src/index.css
```

---

## 1 层级

### 1.1 字号（J）

一屏只允许三个物理字号。分页面类型：

| 页面类型 | 第一档（页级标题） | 第二档（内容） | 第三档（元信息） |
| --- | --- | --- | --- |
| 列表页 / 工作台（Dashboard、Notes、Search、Conversations、Plans、Imports、Favorites、Clipboard） | `--gm-font-xl`（20px） | `--gm-font-sm`（13px） | `--gm-font-2xs`（11px） |
| 详情 / 阅读页 | `--gm-font-lg`（17px）面板标题 | `--gm-font-sm`（13px）正文 | `--gm-font-2xs`（11px） |
| 对话框 / 设置向导 | `--gm-font-lg`（17px）对话框标题 | `--gm-font-sm`（13px）正文与动作 | `--gm-font-2xs`（11px）说明 |
| 结果页 / 大数字场景 | `--gm-font-2xl`（24px）结果值 | `--gm-font-sm`（13px） | `--gm-font-2xs`（11px） |

- `--gm-font-md`（15px）只允许出现在对话框动作文字与移动端页标题；出现在桌面列表页即违规。
- `--gm-font-xs`（12px）与 `--gm-font-sm`（13px）相差 1px，在等宽字体下不构成层级。规则：同一屏内不得让 12px 与 13px 同时承载可读文字。12px 仅可作为迁移中间态存在，新增代码不得使用 `--gm-font-xs`。
- 禁止按视口宽度缩放字号；禁止 `clamp()` / `vw` 字号。

### 1.2 字重（J）

全仓只允许三个字重：

| 字重 | 用途 |
| --- | --- |
| `400` | 正文、多行描述、输入值、Markdown 正文 |
| `650` | 单行标签、列表标题、按钮文字、徽标、表格单元格 |
| `720` | 页标题、面板标题、区块标题、结果大数字 |

`500` `560` `600` `620` `700` `750` `760` `780` `800` 一律违规，迁移到最近的上面三档（页标题 760 → 720，统计数字 780 → 720，导航项 760 → 650，标签页 600 → 650）。

### 1.3 文字明度（J）

文字颜色只由三个 token 决定，一个元素只用其中一个：

| token | 用于 |
| --- | --- |
| `--text` | 页标题、面板标题、列表行标题、当前选中行的标题 |
| `--text-secondary` | 正文、摘要、说明、未选中的列表标题、工具栏文字 |
| `--gm-color-text-muted` | 时间戳、计数、占位符、禁用文字、版本号、快捷键提示 |

- 禁止用 `opacity` 调文字明度；`opacity` 只允许用于显示/隐藏切换与遮罩。
- 禁止用 `color-mix(...transparent)` 生成文字颜色。
- 选中态不得提高字号或字重来区分，只用 `--gm-color-bg-selected` 与 `--accent`。

### 1.4 层级总表（J）

| 元素 | 字号 | 字重 | 颜色 | 行高 |
| --- | --- | --- | --- | --- |
| 页标题（`gm-page-title`） | `--gm-font-xl` | 720 | `--text` | `--gm-leading-title` |
| 面板 / 分栏标题（`gm-pane-header-title`） | `--gm-font-sm` | 650 | `--text` | `--gm-leading-title` |
| 区块标题（`gm-section-title`） | `--gm-font-2xs` | 650 | `--text-secondary` | `--gm-leading-tight` |
| 列表行标题 | `--gm-font-sm` | 650 | `--text` | `--gm-leading-normal` |
| 正文 / 摘要 | `--gm-font-sm` | 400 | `--text-secondary` | `--gm-leading-normal` |
| 元信息（时间、路径、计数） | `--gm-font-2xs` | 400 | `--gm-color-text-muted` | `--gm-leading-tight` |
| 按钮文字 | `--gm-font-sm` | 650 | 见 §3.3 | `--gm-leading-normal` |
| 徽标 / 状态胶囊 | `--gm-font-2xs` | 650 | 见 §3.2 | `--gm-leading-tight` |
| 结果大数字 | `--gm-font-2xl` | 720 | `--text` | `--gm-leading-title` |

### 1.5 一屏三档的判据（J）

数一屏内出现过的不同字号数量（含移动端同一屏的等效集合）：

- 等于 3 且落在 §1.1 对应行 → 合规。
- 等于 4 或更多 → 违规，除非多出来的是 `--gm-font-2xl`（结果值）或 `--gm-font-lg`（对话框标题）。
- 出现 `--gm-font-md` 在桌面列表页 → 违规。
- 出现 12px 与 13px 同为可读文字 → 违规。

---

## 2 网格与间距

### 2.1 栅格（J）

- 页级模块横向只允许一个栅格模板，列数取 `4`、`6` 或 `12`（当前 `gm-dashboard-stat-grid` 是 6 栏）。
- 栅格 `gap` 只用 `--gm-card-header-gap`。同一页出现两种 gap 值 → 违规。
- 栅格内子项只允许 `span` 均分（6 栏里 `span 2` 或 `span 3` 全页统一）。同一网格里混用两种 span → 违规（现 Dashboard 前 3 张 `span 2`、后 3 张 `span 3`，属违规）。
- 分栏页（列表 + 详情）不再叠加页级栅格：横向由 `--gm-size-split-pane-*` 决定。

### 2.2 留白（J）

| 位置 | token |
| --- | --- |
| 可滚动页面四边 | `--gm-page-pad-x` / `--gm-page-pad-y` / `--gm-page-pad-bottom` |
| 移动端页面四边 | `--gm-page-pad-mobile-x` / `--gm-page-pad-mobile-y` |
| 同级模块之间 | `--gm-section-gap`（大断点用 `--gm-section-gap-lg`） |
| 卡片内边距 | `--gm-card-pad-x` / `--gm-card-pad-y` / `--gm-card-pad-mobile` |
| 卡片标题到内容 | `--gm-card-header-gap` |
| 列表头 / 过滤条 | `--gm-list-header-pad-x` / `--gm-list-header-pad-y` |
| 列表行 | `--gm-list-row-pad-x` / `--gm-list-row-pad-y`（紧凑行用 `--gm-list-row-pad-y-compact`） |
| 阅读面 / 详情面 | `--gm-detail-pad-x` / `--gm-detail-pad-y` |
| 图标与文字之间 | `--gm-icon-text-gap` |
| 工具条内按钮组 | `--gm-toolbar-gap` |
| 同一控件内部 | `--gm-control-gap` / `--gm-control-pad-*` |

- 数值型间距只允许 `--gm-space-0`～`--gm-space-7`（0 / 2 / 4 / 8 / 12 / 16 / 24 / 32）。`6px`、`10px`、`14px`、`20px`、`28px` 不存在对应 token，写出即违规。
- 页面留白只放在滚动容器上，不得放在内层包裹元素上再叠一次。
- 列表行不得在已有卡片内边距之上再加一层水平内边距。

### 2.3 列宽与行长（J）

- 单列整页布局允许一对左右留白 + 一个宽度上限：`--gm-page-pad-x` 与 `--gm-size-setup-panel-max-width`（720px）。其他宽度上限只用已存在的 `--gm-size-*` 名字，不得新写字面量。
- 分栏布局不设页面宽度上限，宽度由 `--gm-size-split-pane-left-*` 与 `--gm-size-split-pane-right-min` 决定。
- 正文最大行长：单行文字超过 80 个字符（中文约 40 字）即需拆行或收窄容器。

### 2.4 对齐（J）

- 正文、标题、标签一律左对齐。
- 居中只允许出现在：空状态整体块、对话框动作行、结果页。
- 数字列允许右对齐，且必须用等宽字体（`--gm-font-mono`）。

### 2.5 分隔（S）

- 同级区块优先用一条 `--border` 分隔线区分，不用阴影、不用背景色差。
- 一个容器内不允许「边框 + 阴影 + 彩色左侧条」同时出现。

---

## 3 颜色克制

### 3.1 结构色承担全部布局（J）

背景与分割只用：`--bg`、`--bg-card`、`--bg-hover`、`--bg-input`、`--border`、`--border-strong`。结构不得用彩色表达。

### 3.2 状态色只表状态（J）

`--green`、`--yellow`、`--red` 只允许出现在：同步状态、错误提示、危险动作、成功结果。禁止用于分类、导航、装饰线、图标身份色。

### 3.3 蓝色只标「可交互 / 当前选中」（J）

`--accent`（及 `--gm-accent-muted` / `--gm-accent-soft` / `--gm-accent-border`）只允许出现在：

- 可点击元素的悬停/焦点边框；
- 当前选中行（配合 `--gm-color-bg-selected` / `--gm-selection-border`）；
- 主按钮填充（文字用 `--gm-color-on-accent`）；
- 焦点环。

禁止：蓝色区块标题（现 `gm-page-kicker` 用 `--accent`，违规）、蓝色图标身份色（现 `gm-page-header-icon` / `gm-pane-header-icon` 用 `--accent`，违规）、蓝色装饰条、蓝色渐变。

### 3.4 同屏颜色上限（J）

一屏内出现的非中性色不超过两种：`--accent` + 最多一种状态色。分类色、provider 色不计入，但受 §3.5 限制。

### 3.5 分类彩色图标的收敛（J）

现状：Dashboard 五个分类各配一个奥运五色（`--gm-olympic-blue` / `yellow` / `black` / `green` / `red`，`AppIconTone` 里 5 个 tone，30 处引用）。颜色不表状态，只表「这是哪一类」，等于用颜色做导航编码。

规则：

- 应用界面内分类图标一律 `tone="muted"`（`--gm-color-muted-icon`）。分类身份由图标形状 + 标签文字承担。
- `--gm-olympic-*` 五个 token 不得出现在 `desktop/src` 的界面样式里（`AppIconTone` 保留定义以便过渡，但不得使用）。
- `--gm-category-*`（blue / green / yellow / gray / teal）只允许用于数据可视化（图表系列、统计色块），不得用于列表行、导航项、图标身份色。
- `--gm-provider-*` 只允许用于 Git 托管商徽标本身，不得扩散成整行或整卡的背景色。
- 统计卡左侧彩色条（`--gm-size-card-rail` + `--gm-item-color`）取消。

---

## 4 动效

现状：`index.css` 里时长只有三个值——`0.15s`（约 30 处）、`0.2s`（4 处）、`0.1s`（1 处）；缓动只有 `ease`；无动效 token；`prefers-reduced-motion` 只有两处局部覆盖。

### 4.1 参数表（J）

| 交互 | 时长 | 缓动 | 允许变化的属性 |
| --- | --- | --- | --- |
| 悬停 / 聚焦 / 按下（颜色类） | `150ms` | `ease` | `background`、`background-color`、`border-color`、`color`、`opacity` |
| 展开 / 收起 / 显隐 / 位移 | `200ms` | `ease` | `transform`、`opacity` |
| 进度填充 | `200ms` | `ease` | `transform`（`scaleX`） |

- 时长只有 150ms 与 200ms 两个值。出现 `0.1s`、`0.3s` 或自定义值即违规。
- 禁止 `transition: all`。
- 禁止 `transition-delay`，退出隐藏可以用一次 `visibility 0s linear <时长>`。
- 禁止对 `box-shadow`、`filter`、`width`、`height`、`top`、`left` 做过渡。
- 禁止弹跳、回弹、过冲（`cubic-bezier` 含负值）、`steps()`、跟手的 spring。

### 4.2 该有动效与不该有动效（J）

- 必须有：按钮/行的颜色过渡、面板展开收起、Toast 进出、加载指示。
- 必须没有：悬停位移（`translateY`）、悬停放大、悬停阴影加深、页面切换动画、列表逐项淡入。
- 禁止无限循环动画，唯一例外是加载指示器（`spin`）。现 `gm-dashboard-quick-note-hand-nudge`（`1200ms infinite`）违规，删除。

### 4.3 减少动效（J）

- `@media (prefers-reduced-motion: reduce)` 下：所有 `transition-duration` 归零、`animation` 停止、位移类效果变为无位移。
- 实现方式：一处全局块覆盖，不允许各组件各写一份局部覆盖（现有两处局部覆盖，违规）。
- 该全局块必须同时覆盖 `animation-name: none` 与 `transition-duration: 0.01ms`，不得只覆盖个别类名。

---

## 5 三个页面的改造前后

每页两段：现在是什么样（事实）、应该是什么样（目标）。目标里的每个 token 都已存在。

### 5.1 仪表盘（Dashboard）

**现在**：页标题 20px / 字重 760，紧跟一个 6 栏统计网格；前 3 张卡 `span 2`、后 3 张 `span 3`，底行卡片宽度是上行的 1.5 倍。统计卡内：左侧 3px 彩色竖条 + 一处奥运色图标 + 12px / 650 标签 + 20px / 780 数字。卡片悬停时换背景并加蓝色边框。下面还有 CLI 卡片、Git 网格、最近活动卡、快捷信息区，每块都是带边框和微弱投影的卡片。

**应该**：页标题 20px / 720 / `--text`，与正文之间留 `--gm-card-header-gap`。统计网格仍是 6 栏，但 6 张卡全部 `span 2`，`gap` 统一 `--gm-card-header-gap`，形成一条等高带。卡内：图标 `tone="muted"` 16px，标签 11px / 650 / `--text-secondary`，数字 20px / 720 / `--text`；去掉左侧彩色竖条。卡与卡之间靠 `--border` 区分，不再叠加投影。悬停只改 `background`，不加边框高亮。整页只保留一个蓝色：可点击卡片聚焦时的那一下。

### 5.2 笔记（Notes）

**现在**：列表 + 详情两栏。列表头用固定 50px 高度，标题 13px / 720。输入区在列表上方，是一块独立的 `--bg-card` 面板（带下边框），内部标题输入框与正文输入框同为 13px，helper 文字 11px `/ --text-secondary`，发送按钮在右下角，未激活时是 `--text-secondary` 图标。

**应该**：输入区不再作为独立面板，去掉 `--bg-card` 底与投影，只用一条 `--border` 与列表分开，内边距 `--gm-card-pad-x` / `--gm-card-pad-y`。标题输入框与正文输入框同为 13px / 400，唯一的视觉差别是占位符用 `--gm-color-text-muted`；输入框边框只在聚焦时出现（`--accent`），静止态无边框。helper 文字 11px / 400 / `--gm-color-text-muted`。发送按钮激活态用 `--accent`，未激活用 `--gm-color-text-muted`。列表行标题 13px / 650 / `--text`，时间 11px / `--gm-color-text-muted`，行距 `--gm-list-row-pad-y`。

### 5.3 搜索（Search）

**现在**：每条结果是一张卡片——`--bg-card` 背景、`--border` 边框、`--gm-shadow-card` 投影、`--gm-radius-md` 圆角、`12px 16px` 内边距、卡片之间 `--gm-card-header-gap`。卡内三行：标题 13px / 650、时间 11px `/ --text-secondary`（与标题同一行右侧）、摘要 12px `/ --text-secondary`。命中计数 12px 位于结果列表上方。

**应该**：结果从「浮起的卡片」改为「平面列表」。每条结果不再有背景、边框、投影、圆角，改为一行三列的整宽行：左侧标题 13px / 650 / `--text`，中间摘要 13px / 400 / `--text-secondary`，右列时间 11px / `--gm-color-text-muted` 固定宽度右对齐。行间用一条 `--border` 分隔，行内边距 `--gm-list-row-pad-x` / `--gm-list-row-pad-y`。命中计数改为列表头上的一行 11px / `--text-secondary`，内边距 `--gm-list-header-pad-x` / `--gm-list-header-pad-y`。悬停只改 `background`（`--bg-hover`），当前选中行用 `--gm-color-bg-selected`。整页只有一个字号梯度：13 → 11。

---

## 6 反面清单（全部 J）

出现以下任一项即驳回，不需要说明理由：

1. 同屏四种及以上字号；12px 与 13px 混用作可读文字。
2. 三个白名单之外的字重。
3. 用 `opacity` 或 `color-mix(...transparent)` 调文字明度。
4. 用颜色编码分类（奥运五色、`--gm-category-*` 用于导航或列表）。
5. 蓝色出现在区块标题、图标身份色、装饰条上。
6. 状态色用于非状态场景。
7. 「边框 + 投影 + 彩色竖条」三件套同时出现在一个容器上。
8. 渐变（`--gm-sync-shimmer-bg` 只允许用于同步进度条）。
9. 发光、光晕、模糊装饰、噪点、纹理、网格底纹。
10. 居中正文或居中页标题。
11. 非 0 的 `letter-spacing`；全大写英文标签。
12. 圆角超过 `--gm-radius-lg`（8px），`--gm-radius-pill` 只用于真胶囊与圆点。
13. 悬停位移、悬停放大、悬停阴影加深、逐项入场动画。
14. 无限循环动画（加载指示器除外）。
15. 超过 200ms 的过渡、`transition: all`、自定义 `cubic-bezier`。
16. 手写的 `font-size` / `padding` / `gap` / `border-radius` / `max-width` 字面量，且没有对应 `--gm-*` token。
17. 新增字体、图标包、插画、图形资产；引入外部设计系统类名。
18. 为「看起来更现代」而增加的分层、卡片、留白堆叠。

---

## 附录：本文与 DESIGN.md 的已知冲突（N）

`DESIGN.md` 的部分数值与 `index.css` 已不一致，实现时一律以 token 为准：

| 项 | DESIGN.md | `index.css` 实际 |
| --- | --- | --- |
| 最大字号 | `21px`（`--gm-font-xl`） | `--gm-font-xl: 20px` |
| 第二档 | `--gm-font-xs: 13px` | `--gm-font-xs: 12px` |
| 间距刻度 | 0/2/4/6/8/10/12/14/16/20/24/28/32 | 0/2/4/8/12/16/24/32（到 `--gm-space-7` 为止） |
| 页面头高度 | 引用 `--gm-page-header-height` | 该 token 未定义；只有 `--gm-pane-header-height: 50px` |
| 颜色名 | `--gm-category-*`、暖灰底 | 实际底色偏绿灰（`#151713`），需按 §3 校验对比度 |

`DESIGN.md` 待同步，本次不改。
