# GitMemo 设计语言 V2

状态：改造期唯一标准（取值层已按「C 骨架 + A 报头」重定，深浅两套并列）。
效力：`docs/design/DESIGN.md` 降级为历史参考与问题清单；`docs/design/LANGUAGE.md` 是 V1 校准稿，作废。实现与之冲突时以本文为准。§7 迁移映射表沿用，取值以本文 §2–§6 与附录 B 为准。
范围：`desktop/src` 全部界面代码。
数字约定：文中所有数值可直接写进 CSS。颜色写 hex 或 rgba，尺寸写 px，动效写 ms，缓动写 `cubic-bezier`。凡是本文件无法量化的形容词都不出现。

**来源标注**（每张规格表最后一列）：`C 稿` = 取自 `desktop/design-proposals/C-paper.html` 的实测值；`A 稿` = 取自 `desktop/design-proposals/A-editorial.html` 的实测值；`主人指定` = 口头定死的约束；`新定` = 由前两者推导、原稿没有的值（每条都注明了推导依据）；`产品约束` = 由长时阅读、键盘操作等产品要求决定。

---

## 1 核心定位

一句话：**一张暖白的纸，用宋体说话，用等宽的序号点数目，全页只有一种蓝在指位置。**

骨架取 C 稿（纸面、细线、序号、表格带），报头结构取 A 稿（品牌名 + 一句人话主标题），但把 A 的 64px 收到 26px，密度按纸面给，不用深色终端感。

### 三条不可协商原则

**原则一：一屏只有三层响度。**
每屏必须能回答「最响的是什么」，且最响层不得覆盖超过屏幕 15% 的面积。三层之外的实体（第四个标题、第五条线、第二种强调色）必须删掉，不允许「弱化一下」保留。判定方法：把界面转成纯灰后，仍能看出主次，就合格；看不出，说明层级是靠颜色撑的，重做。

**原则二：一个方向只画一条线。**
同一区域内，横向分隔线只有一种颜色（`--gm-line`）和一种厚度（1px）；纵向分隔线只出现在分栏之间。禁止「线 + 线框 + 阴影」叠三层来表达层级。判定方法：数一个模块边界上的可见边界层数，大于 1 即违规。

**原则三：颜色不承担分类。**
分类、来源、类型一律用文字与图标形状表达。颜色只表达四种信息：可交互（蓝）、当前选中（蓝 + 底色）、状态（成功/警告/危险）、结构（中性色阶）。判定方法：把分类色全部换成灰，功能与信息不能减少任何一项。

### 长时阅读与键盘操作

- 阅读面（Markdown、纪要、对话详情）用 `--gm-font-title`（宋体）+ `--gm-fs-read` 15px + `--gm-lh-read` 1.75，行长上限 `66ch`。
- 所有可交互元素必须有可见焦点环：`2px` `--gm-focus-ring`，`outline-offset: 2px`。禁止用 `outline: none` 了事。
- 焦点顺序跟随视觉顺序，不做跳位；打开面板后焦点进入面板第一个可交互元素，Esc 关闭并把焦点还给触发元素。
- 所有列表必须能用 ↑ / ↓ 移动并同步滚动，当前项用 `--gm-selected` 底色表示。

---

## 2 色彩系统

方向：C 稿的纸面骨架 + A 稿的报头结构；强调蓝 `#1f4fbf`（深色端用同色系亮阶 `#7c9cff`）由主人指定。
两套主题并列：纸面（浅色）与深夜（深色），token 名完全一致、只有值不同。产品默认深色，两套都要能落地。

### 2.1 取值（单一纸面主题）

| token | 值 | 用在哪 | 不用在哪 | 来源 |
| --- | --- | --- | --- | --- |
| `--gm-canvas` | `#f4efe6` | 整页底、编辑器底 | 卡片（本轮无卡片） | C 稿实测 `--paper` |
| `--gm-surface` | `#ece5d8` | 侧栏、列表面、统计带分隔行 | 整页底 | C 稿实测 `--paper-deep` |
| `--gm-surface-raised` | `#f7f2e6` | 弹层、菜单、对话框（配 1px 线，不配投影） | 常驻面板 | 新定 |
| `--gm-input-bg` | `#e9e1d2` | 代码块、日志块、只读输出 | 单行输入（输入框无底色，只有底线） | 新定 |
| `--gm-hover` | `rgba(25, 21, 18, 0.04)` | 行悬停、可点区域悬停 | 静态分区 | C 稿实测（其条目悬停为同数量级微染） |
| `--gm-selected` | `rgba(31, 79, 191, 0.08)` | 当前所在行、当前标签页 | 悬停 | 新定（主人指定的蓝） |
| `--gm-line` | `rgba(25, 21, 18, 0.16)` | 分区横线、条目分隔、表头下沿 | 输入框底线 | C 稿实测 `--rule` |
| `--gm-line-strong` | `#8a8174` | 输入框底线、复选框轮廓、可辨识控件边界 | 装饰分隔 | 新定（C 的 0.34 透明黑换算值，为过 3:1 加深） |
| `--gm-scrim` | `rgba(25, 21, 18, 0.35)` | 对话框遮罩 | 其他用途 | 新定 |
| `--gm-text` | `#191512` | 主标题、条目标题、正文主体 | 元信息 | C 稿实测 `--ink` |
| `--gm-text-secondary` | `#4a4340` | 说明文字、未选中条目、标签 | 主标题 | C 稿实测 `--ink-2` |
| `--gm-text-tertiary` | `#6c645c` | 时间、序号、计数、路径、占位符 | 可读正文 | C 稿实测 `--ink-3`（为过 4.5 加深） |
| `--gm-text-disabled` | `#b8b0a4` | 禁用控件 | 任何可读内容 | 新定（禁用态不受 4.5 约束） |
| `--gm-on-action` | `#f4efe6` | 墨色填充按钮与蓝色小徽标上的字 | 纸底文字 | 新定（取 canvas 值） |
| `--gm-accent` | `#1f4fbf` | 当前所在、可点链接、聚焦环 | 填充按钮、大色块、图标身份色 | 主人指定 |
| `--gm-accent-hover` | `#173d99` | 链接悬停 | 静态状态 | 新定（同色系加深） |
| `--gm-action` | `#191512` | 主按钮填充（墨色，不是蓝色） | 文字颜色 | C 稿实测（其强调按钮为墨底） |
| `--gm-action-hover` | `#2c2823` | 主按钮悬停 | 其他 | 新定 |
| `--gm-action-pressed` | `#0d0b09` | 主按钮按下 | 其他 | 新定 |
| `--gm-accent-tint` | `rgba(31, 79, 191, 0.06)` | 可点区域悬停微染、当前行外框内衬 | 正文底 | 主人指定的第三处强调用法 |
| `--gm-focus-ring` | `#1f4fbf` | 2px 焦点环 | 静态边框 | 新定（复用 accent） |
| `--gm-success` | `#2f6b46` | 已同步、成功结果 | 装饰 | C 稿实测 |
| `--gm-success-tint` | `rgba(47, 107, 70, 0.08)` | 成功提示条底 | 正文底 | 新定 |
| `--gm-warning` | `#8a5a12` | 未推送、待处理、提醒 | 装饰 | 新定（C 用 accent 表示警告，这里独立成琥珀） |
| `--gm-warning-tint` | `rgba(138, 90, 18, 0.08)` | 警告提示条底 | 正文底 | 新定 |
| `--gm-danger` | `#8c2f1e` | 危险动作文字、错误、删除确认 | 非危险场景 | C 稿实测 `--accent`（原稿的强调红降级为危险色） |
| `--gm-danger-tint` | `rgba(140, 47, 30, 0.08)` | 错误提示条底 | 正文底 | 新定 |

### 2.2 对比度实测

用 WCAG 2.x 相对亮度公式对本节色值计算，数字是实算值。

| 组合 | 纸上 | 纸面 (`--gm-surface`) | 下限 |
| --- | --- | --- | --- |
| 主文字 / 底 | 15.84 | 14.49 | 4.5 |
| 次级文字 / 底 | 8.46 | 7.73 | 4.5 |
| 三级文字 / 底 | 5.07 | 4.64 | 4.5 |
| 强调蓝 / 底 | 6.26 | 5.72 | 4.5 |
| 成功 / 底 | 5.54 | 5.06 | 4.5 |
| 警告 / 底 | 5.16 | 4.72 | 4.5 |
| 危险 / 底 | 7.22 | 6.60 | 4.5 |
| 纸底字 / 墨色按钮 | 15.84 | — | 4.5 |
| 控件边界 / 底 | 3.35 | 3.06 | 3.0 |
| 分区线 / 底 | 1.55 | 1.42 | 无需（装饰） |

`--gm-line` 是装饰性分隔线，不承担可辨识信息；凡是「这条线用来判断控件边界」的地方必须用 `--gm-line-strong`。

### 2.3 颜色使用规则

1. **强调蓝只允许三处**：当前所在（导航项、选中行、当前标签页）、可点链接、悬停微染。除此之外任何蓝色都是违规。
2. **主按钮不用蓝色**：墨色填充 + 纸底字。理由是蓝色在这套稿里是「定位信号」，不是「动作色」。
3. 状态色只保留绿与琥珀；红只用于危险动作的文字、图标与确认按钮底色，不得用于区块背景。
4. 分类、来源、Git 托管商一律单色：图标与文字都用 `--gm-text-tertiary`。本轮已删除奥运五色、category 五色、provider 五色。
5. 禁止渐变（唯一例外：进度条由两种中性色构成）。
6. 禁止用 `opacity` 表达层级；更弱的文字用 `--gm-text-tertiary`。
7. 禁止 `color-mix()` 造色；所有颜色必须来自本节具名 token。
8. 一屏非中性色上限两种：强调蓝 + 最多一种状态色。

### 2.4 与旧值的关系

| 项 | 旧（V2 初稿） | 现（纸面） | 来源 |
| --- | --- | --- | --- |
| 底 | 深色 `#14130F` / 浅色 `#F4F1E9` 双主题 | 单一纸面 `#f4efe6` | C 稿 |
| 强调 | `#7C9CFF` / `#2A52C4` 蓝紫 | `#1f4fbf` | 主人指定 |
| 危险 | `#F2806F` / `#B3342B` | `#8c2f1e` | C 稿 |
| 卡片层 | 有 `--gm-surface` 卡片 + 两级投影 | 无卡片、无投影，只有纸与线 | C 稿 |

### 2.5 深色主题（深夜）

按纸面反推：把「纸与墨」对调，保留同样的明度关系与同样的强调用法。深色是产品默认端（安卓端大量用户在深色下使用），必须完整可用，不是补丁。

| token | 纸面值 | 深夜值 | 说明 | 来源 |
| --- | --- | --- | --- | --- |
| `--gm-canvas` | `#f4efe6` | `#1b1916` | 底色对调 | 新定（纸面反推） |
| `--gm-surface` | `#ece5d8` | `#232019` | 侧栏与列表面 | 新定 |
| `--gm-surface-raised` | `#f7f2e6` | `#2b2721` | 弹层 | 新定 |
| `--gm-input-bg` | `#e9e1d2` | `#141210` | 代码块/日志块（比底色更深） | 新定 |
| `--gm-hover` | `rgba(25,21,18,.04)` | `rgba(239,233,221,.05)` | 悬停微染改由亮色墨承担 | 新定 |
| `--gm-selected` | `rgba(31,79,191,.08)` | `rgba(124,156,255,.14)` | 当前所在，深色端用亮蓝并要求更高透明度才看得见 | 新定 |
| `--gm-line` | `rgba(25,21,18,.16)` | `rgba(239,233,221,.16)` | 线由墨色改亮色 | 新定 |
| `--gm-line-strong` | `#8a8174` | `#7a7265` | 控件边界，两套都过 3:1 | 新定（实算） |
| `--gm-scrim` | `rgba(25,21,18,.35)` | `rgba(0,0,0,.55)` | 深色下遮罩更重 | 新定 |
| `--gm-text` | `#191512` | `#efe9dd` | 互换 | 新定 |
| `--gm-text-secondary` | `#4a4340` | `#bdb5a8` | 互换 | 新定 |
| `--gm-text-tertiary` | `#6c645c` | `#9a9287` | 互换，三种底上都过 4.5 | 新定（实算） |
| `--gm-text-disabled` | `#b8b0a4` | `#635c53` | 禁用文字 | 新定 |
| `--gm-on-action` | `#f4efe6` | `#1b1916` | 墨底按钮上的字 | 新定 |
| `--gm-accent` | `#1f4fbf` | `#7c9cff` | 同色系亮阶，夜底 6.73 | 主人指定色系 + 新定亮阶 |
| `--gm-accent-hover` | `#173d99` | `#9db4ff` | 悬停 | 新定 |
| `--gm-action` | `#191512` | `#efe9dd` | 深色端主按钮为亮底墨字，不用蓝底 | 新定（纸面反推） |
| `--gm-action-hover` | `#2c2823` | `#fffdf8` | — | 新定 |
| `--gm-action-pressed` | `#0d0b09` | `#d8d2c4` | — | 新定 |
| `--gm-accent-tint` | `rgba(31,79,191,.06)` | `rgba(124,156,255,.10)` | 悬停微染 | 新定 |
| `--gm-focus-ring` | `#1f4fbf` | `#7c9cff` | 与 accent 同值 | 新定 |
| `--gm-success` | `#2f6b46` | `#6ec48e` | 状态绿提亮 | 新定（实算） |
| `--gm-warning` | `#8a5a12` | `#d8a24b` | 琥珀提亮 | 新定（实算） |
| `--gm-danger` | `#8c2f1e` | `#e8786a` | 危险红提亮 | 新定（实算） |
| `--gm-success-tint` | `rgba(47,107,70,.08)` | `rgba(110,196,142,.12)` | 提示条底 | 新定 |
| `--gm-warning-tint` | `rgba(138,90,18,.08)` | `rgba(216,162,75,.12)` | 同上 | 新定 |
| `--gm-danger-tint` | `rgba(140,47,30,.08)` | `rgba(232,120,106,.12)` | 同上 | 新定 |

深色对比度实算：

| 组合 | 夜底 | 侧栏 | 弹层 | 下限 |
| --- | --- | --- | --- | --- |
| 主文字 | 14.51 | 13.44 | 12.28 | 4.5 |
| 次级文字 | 8.64 | 8.00 | 7.31 | 4.5 |
| 三级文字 | 5.71 | 5.29 | 4.83 | 4.5 |
| 强调蓝 | 6.73 | 6.24 | 5.69 | 4.5 |
| 成功 | 8.31 | 7.70 | 7.03 | 4.5 |
| 警告 | 7.68 | 7.11 | 6.49 | 4.5 |
| 危险 | 6.12 | 5.67 | 5.18 | 4.5 |
| 亮底按钮上的字 | 14.51 | — | — | 4.5 |
| 控件边界 | 3.69 | 3.42 | 3.28 | 3.0 |

深色端的额外规则：

1. 强调蓝只换色阶，用法仍是三处（当前所在 / 可点链接 / 悬停微染）。
2. 主按钮在深色端是亮底墨字，不改成蓝底白字——蓝色在两端都只标位置。
3. 阴影仍然为零：弹层靠 `--gm-surface-raised` 的明度差 + 1px 线区隔，不用发光、不用毛玻璃。
4. 截图与图片不在深色端做反色或滤镜。
5. 两套主题共用同一套间距、字号、圆角、动效，只有颜色 token 分叉；初始值听 `prefers-color-scheme`，用户手动切换后以用户选择为准。

## 3 排版系统

### 3.1 字族三分工（照 A 稿结论，不许混用）

| token | 值 | 承载什么 | 来源 |
| --- | --- | --- | --- |
| `--gm-font-title` | `"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif` | 报头品牌名、页面主标题、统计数字、Markdown 标题 | A 稿实测（宋体担一切「读」的字） |
| `--gm-font-ui` | `-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif` | 导航、按钮、表单、条目正文、说明文字 | A 稿实测（无衬线担界面） |
| `--gm-font-mono` | `"SF Mono", ui-monospace, Menlo, Consolas, monospace` | 标签、序号、时间、路径、命令、行内数字 | A 稿实测（等宽担标签与元信息） |

规则：
- 一个元素只用一族。禁止「标题用宋体、其中英文部分用无衬线」这种混排。
- 统计数字用宋体（大号指标）；行内数字（时间、计数、体积、百分比）用等宽并设 `font-variant-numeric: tabular-nums`。
- 禁引入付费字体、禁 CDN 字体；三族都来自系统已装字体。

### 3.2 字号阶梯（7 档，含密度封顶）

| token | 字号 | 行高 | 字重 | 用在哪 | 来源 |
| --- | --- | --- | --- | --- | --- |
| `--gm-fs-brand` | 22px | 1.2 | 600 | 报头品牌名 | 新定（A 稿 64px，收到 C 的密度） |
| `--gm-fs-title` | 26px | 1.35 | 600 | 页面主标题一句 | 新定（介于 A 的 36 与 C 的 40 之下，配合 22px 品牌名成两级报头） |
| `--gm-fs-stat` | 30px | 1.1 | 600 | 统计带数字（封顶值） | 新定（C 稿 38px 下调，满足「统计数字 30px 封顶」） |
| `--gm-fs-row` | 14.5px | 1.45 | 400 | 条目正文、列表行标题 | C 稿实测 `.entries .t` |
| `--gm-fs-ui` | 13px | 1.6 | 400 | 界面文字、按钮、表单值、说明文字 | C 稿实测（其标注为 13.5，取整后与 A 的正文同级） |
| `--gm-fs-micro` | 10.5px | 1.4 | 500 | 标签、序号、时间、来源、计数 | C 稿实测 `.entries .no` / `.when` |
| `--gm-fs-read` | 15px | 1.75 | 400 | Markdown 正文、笔记正文、纪要 | 产品约束（长时阅读，低于此值阅读疲劳明显） |

封顶规则：任何数字不得超过 `--gm-fs-stat` 的 30px；任何正文不得低于 `--gm-fs-ui` 的 13px（`--gm-fs-micro` 只用于不可读正文的元信息）。

阅读面标题：`#` 用 `--gm-fs-title`（26/600），`##` 20/600，`###` 17/600，行高一律 1.35；代码块用 `--gm-font-mono` 13px / 1.6。

### 3.3 字重与字距

- 字重只有三档：`400`（正文与条目）、`500`（只用于等宽标签）、`600`（标题与统计数字）。禁止 300、700、800。
- 字距：正文与标题一律 `0`。两处例外——等宽标签 `0.16em`（C 稿实测）、统计数字 `-0.02em`（C 稿实测 `.fig .v`）。除此之外出现 `letter-spacing` 即违规。

### 3.4 中英文混排

- 中文用全角标点（，。：；「」），英文与代码用半角；同一行不混两套。
- 中文与拉丁之间不加空格，由字体栈回落处理；不在字符串里手插空格。
- 路径、分支名、commit hash、命令、时间戳一律等宽 + `white-space: nowrap` + `text-overflow: ellipsis`。
- 数字与单位之间加半角空格：`18.4 MB`、`3 条`。

### 3.5 数字与对齐

- 所有数字容器设 `font-variant-numeric: tabular-nums`，列宽固定，内容变化不跳动。
- 表格与统计带的数值列右对齐；条目序号列宽度固定 22px（C 稿实测其序号列 32px，收窄后与 10.5px 等宽字匹配）。
- 统计带四项等宽平铺，数字左对齐、标签在上，数字与标签之间 6px。
- 时间格式：当天 `HH:MM`，跨天 `MM-DD`，相对时间只在 1 小时内使用（`2 分钟前`）。

### 3.6 行长

- 阅读面容器 `max-width: 66ch`（产品约束；按主栏 972px 与 15px 正文计，约 35 个汉字一行）。
- 说明文字 `max-width: 62ch`。
- 条目正文单行截断，摘要最多两行（`-webkit-line-clamp: 2`）。
- 禁止居中正文；禁止为了「整齐」把正文压到 40ch 以下。

## 4 空间与形状

### 4.1 版心（照 C 稿骨架）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 画布宽 | 1440px，居中，`width:1440px; margin:0 auto` | C 稿实测 |
| 左右留白 | 96px | C 稿实测 `padding:60px 96px 72px` |
| 上留白 | 60px | C 稿实测 |
| 下留白 | 72px | C 稿实测 |
| 侧栏宽 | 224px | C 稿实测 `.sheet` 第一列 |
| 侧栏与主栏间距 | 52px | C 稿实测 |
| 主栏宽 | 972px（1440 − 192 − 224 − 52） | C 稿实测推算 |
| 内容列上限 | 无独立 max-width，主栏即上限 | C 稿实测（通栏排到主栏边） |

### 4.2 间距阶梯（8 档）

| token | 值 | 用途 | 来源 |
| --- | --- | --- | --- |
| `--gm-sp-1` | 4px | 标签与值的间距、序号与文字 | C 稿实测（其 9px 行距收敛） |
| `--gm-sp-2` | 8px | 图标与文字、徽标内边距 | C 稿实测 |
| `--gm-sp-3` | 12px | 条目上下内边距、紧凑块内距 | C 稿实测（其 13px） |
| `--gm-sp-4` | 16px | 统计带上下内距、表格单元格 | C 稿实测 |
| `--gm-sp-5` | 24px | 区块内元素间距 | 新定 |
| `--gm-sp-6` | 32px | 区块之间 | C 稿实测（其 40px 收敛） |
| `--gm-sp-7` | 44px | 大区块之间（主栏各 section 的 `gap`） | C 稿实测 `.body{gap:44px}` |
| `--gm-sp-8` | 56px | 报头与首个区块、页尾 | 新定（配合 26px 标题的呼吸） |

禁止 6px、10px、14px、18px、20px、28px、40px、76px、80px 这类没有对应档位的值。C 稿自身的 9 / 13 / 14 / 26 / 30 / 40 / 60 / 72 全部按上表归并。

### 4.3 分区方式（本轮的核心手法）

- **只用两种手段分区**：1px 横线与留白。没有卡片、没有底色块、没有投影、没有圆角容器。
- 横线三种用途：区块上下沿（`--gm-line`）、条目之间（`--gm-line`）、表头下沿（`--gm-line`）。
- 条目必须带序号（`01`…`05`），序号列固定 22px、等宽、`--gm-text-tertiary`。
- 统计用**表格带**：四条数据等宽平铺，上下各一条线，中间不画竖线，靠 24px 列距分离。
- 待处理用编号列表：`01/02/03` + 一句话 + 右侧标签，每条上方一条线。
- 竖线只允许出现在侧栏与主栏之间——C 稿本身连这条也不画，本轮也不画。

### 4.4 圆角

| token | 值 | 用在哪 | 来源 |
| --- | --- | --- | --- |
| `--gm-r-0` | 0 | 全部容器、按钮、输入、弹层 | C 稿实测（容器一律直角） |
| `--gm-r-kbd` | 3px | 键盘提示、复选框 | C 稿实测 `border-radius:3px` |

除键盘提示与复选框外，任何元素出现圆角即违规。胶囊、圆点状态指示器不再使用（改为等宽文字标签）。

### 4.5 层高

- 常驻界面**没有阴影**。弹层（菜单、对话框）用 `--gm-surface-raised` 底 + 1px `--gm-line-strong` 边 + 遮罩区隔，不用投影。
- 禁止发光、禁止毛玻璃、禁止 `backdrop-filter`。
- 唯一例外是系统原生对话框与系统级通知，不受本规范约束。

### 4.6 结构尺寸

| token | 值 | 用途 | 来源 |
| --- | --- | --- | --- |
| `--gm-h-row` | `min-height: 40px` | 列表行最小高度（单行） | 主人指定（一屏至少 6 条） |
| `--gm-h-row-2` | `min-height: 56px` | 带两行摘要的行 | 新定（40 + 摘要一行 16） |
| `--gm-h-nav` | `min-height: 24px` | 侧栏导航项 | C 稿实测（`padding:7px 0` + 13.5px 字号） |
| `--gm-h-nav-gap` | 6px | 导航项之间 | C 稿实测 |
| `--gm-w-sidebar` | 224px | 侧栏 | C 稿实测 |
| `--gm-w-gutter` | 52px | 侧栏与主栏之间 | C 稿实测 |
| `--gm-w-pad-x` | 96px | 页面左右留白 | C 稿实测 |
| `--gm-w-scrollbar` | 6px | 滚动条 | 新定 |
| `--gm-chart-max` | 40 | 柱状图单日上限（固定值，不按周内最大值自适应） | 主人指定 |

行高一律 `min-height`，不用 `height`；只有按钮、输入框、标签这类必须等高的控件才用固定 `height`。

### 4.7 图标

| token | 值 | 用途 | 来源 |
| --- | --- | --- | --- |
| `--gm-icon-xs` | 12px | 行内微图标、关闭 | 新定 |
| `--gm-icon-sm` | 14px | 条目、菜单、紧凑按钮 | C 稿实测（条目内图标量级） |
| `--gm-icon-md` | 16px | 导航、工具栏、按钮 | C 稿实测 |
| `--gm-icon-lg` | 20px | 区块头、设置项 | 新定 |

- 图标库固定 `lucide-react`，`stroke-width: 1.5`，颜色只取 `--gm-text-tertiary` 或 `--gm-text`。
- 分类图标靠形状区分，不用颜色（B3b 批的验收：整屏转灰度后分类信息不减少）。
- 禁止 emoji 当图标，禁止插画，禁止图标底色。

### 4.8 柱状图

- 固定标尺：单日上限 40 条，条宽 = `min(当日数 / 40, 1) × 100%`。
- 不按周内最大值自适应：一周都只有 3 条时，条形仍然只占 7.5%，不用「拉满」制造虚假的活跃感。
- 条高 2px，色 `--gm-text`（70% 透明）；未达标的日期用 `--gm-line-strong`。
- 数值标在右端，等宽 10.5px，右对齐。

## 5 动效

### 5.1 参数

| token | 值 | 用途 | 来源 |
| --- | --- | --- | --- |
| `--gm-dur-1` | 120ms | 状态变化：悬停、按下、聚焦 | 新定（C 稿用 0.15s，收到 120ms 以匹配纸面质感） |
| `--gm-dur-2` | 180ms | 结构变化：弹层进出、Toast 进出 | 新定 |
| `--gm-ease` | `cubic-bezier(0.2, 0, 0, 1)` | 唯一缓动 | 新定 |

只有这两个时长和这一条曲线。禁止 0.15s、0.3s、`ease`、`ease-in-out`、`linear`（加载旋转除外）。

### 5.2 允许动的属性

| 属性 | 允许 | 时长 |
| --- | --- | --- |
| `background-color` | 是 | `--gm-dur-1` |
| `border-color` | 是 | `--gm-dur-1` |
| `color` | 是 | `--gm-dur-1` |
| `text-decoration-color` | 是（链接下划线） | `--gm-dur-1` |
| `opacity` | 是（仅弹层与 Toast 进出） | `--gm-dur-2` |
| 其他所有属性 | 否 | — |

禁止 `transition: all`；禁止过渡 `width`、`height`、`top`、`left`、`box-shadow`、`filter`；禁止位移、缩放、悬停放大、逐项入场；禁止无限循环动画（唯一例外：加载旋转）。

纸面方向上「动得越少越像印刷品」：条目悬停只换底色 4% 与文字色，不加位移、不加下划线滑入。

### 5.3 减少动效

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .gm-spinner {
    animation: gm-spin 2s linear infinite !important;
    animation-duration: 2s !important;
    animation-iteration-count: infinite !important;
  }
}
```

- 全局生效一次，写在 `index.css` 顶部；禁止组件内再写局部覆盖。
- `.gm-spinner` 是全仓唯一允许 `animation` 的类名。
- 降级后仍然保留：焦点环立即出现、当前行底色立即切换。

## 6 组件语汇

所有组件共用：`--gm-r-0`（直角）、字族分工见 §3.1、`transition` 只含 `background-color` / `border-color` / `color`，时长 `--gm-dur-1`。

### 6.1 按钮

| 类型 | 高度 | 水平内边距 | 字号/字重 | 默认 | 悬停 | 按下 | 焦点 | 禁用 | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 主（墨） | 30px | 14px | 13/400 | 底 `--gm-action`，字 `--gm-on-action` | 底 `--gm-action-hover` | 底 `--gm-action-pressed` | 2px `--gm-focus-ring`，offset 2 | 底 `--gm-surface`，字 `--gm-text-disabled` | C 稿（墨底动作按钮） |
| 次 | 30px | 14px | 13/400 | 透明底，1px `--gm-line-strong` 边，字 `--gm-text` | 底 `--gm-hover` | 边 `--gm-text-secondary` | 同上 | 边 `--gm-line`，字 `--gm-text-disabled` | 新定 |
| 文字 | 24px | 0 | 13/400 | 无底无边，字 `--gm-text-secondary` | 字 `--gm-accent`，下划线 1px | 字 `--gm-accent-hover` | 同上 | 字 `--gm-text-disabled` | C 稿（其 `查看全部` 链接） |
| 危险 | 30px | 14px | 13/400 | 透明底，1px `--gm-danger` 边，字 `--gm-danger` | 底 `--gm-danger-tint` | 底 `--gm-danger-tint`，边不变 | 同上 | 边 `--gm-line`，字 `--gm-text-disabled` | 新定 |

- 图标按钮：24px 方，图标 14px，内边距 0，无圆角。
- 主按钮一屏最多一个。按钮文字不做全大写、不加箭头字符、不加左侧图标（除危险确认）。
- 加载中：文字保留、左侧 12px 旋转图标、宽度不变。

### 6.2 输入框

| 项 | 值 | 来源 |
| --- | --- | --- |
| 高度 | 30px（单行） | C 稿实测（其快速输入行 26px，加底线后取 30） |
| 水平内边距 | 0 | C 稿实测（底线式输入无内距） |
| 字号 | 13px / 400 / `--gm-font-ui` | C 稿实测 |
| 底色 | 透明 | C 稿实测 |
| 边框 | 只有底线 1px `--gm-line-strong` | C 稿实测 |
| 圆角 | 0 | C 稿实测 |
| 占位符 | `--gm-text-tertiary` | 新定 |
| 悬停 | 底线 `--gm-text-tertiary` | 新定 |
| 聚焦 | 底线 1px `--gm-accent` + 2px 焦点环（offset 2） | 新定（用主人指定的蓝） |
| 禁用 | 底线 `--gm-line`，字 `--gm-text-disabled` | 新定 |
| 错误 | 底线 `--gm-danger`，下方 10.5px `--gm-danger` 说明 | 新定 |

多行输入（笔记、快捷记录）：无框，只有上下两条 `--gm-line`，内边距 12px 0，最小高度 96px，宋体 15px / 1.75（阅读字号，产品约束）。

### 6.3 列表行（带序号）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 最小高度 | 40px（单行）、56px（带摘要）；`min-height`，禁止 `height` | 主人指定 |
| 列结构 | 22px 序号 + 52px 类型 + 1fr 标题 + 68px 来源 + 76px 时间，列距 16px | C 稿实测（32/44/1fr/64/60 + gap 14） |
| 序号 | 10.5px 等宽，`--gm-text-tertiary` | C 稿实测 |
| 类型 | 10.5px 等宽，0.16em 字距，`--gm-text-tertiary` | C 稿实测 |
| 标题 | 14.5px / 400 / `--gm-text`，单行截断 | C 稿实测 |
| 摘要 | 13px / 400 / `--gm-text-secondary`，最多两行 | 新定（C 无摘要，A 有） |
| 来源 / 时间 | 10.5px 等宽，`--gm-text-tertiary`，右对齐 | C 稿实测 |
| 分隔 | 下沿 1px `--gm-line` | C 稿实测 |
| 悬停 | 底 `--gm-hover`（4% 墨），文字不变 | C 稿实测（其悬停为微染） |
| 当前 | 底 `--gm-accent-tint`（6% 蓝）+ 标题 600，左侧不画竖条 | 新定（强调蓝只标「当前所在」） |
| 焦点 | 2px `--gm-focus-ring` 内描边（`outline-offset: -2px`） | 新定 |

一屏至少 6 条：主栏可用高 ≥ 40×6 + 分隔线。

### 6.4 统计带（替代卡片）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 结构 | 四等分平铺，上下各一条 1px `--gm-line-strong` | C 稿实测 `.figures` |
| 单元格内距 | 上 16px、下 18px、右 20px（首格左 0） | C 稿实测 |
| 数字 | 30px / 600 / 宋体 / `-0.02em` / `tabular-nums` | 新定（C 38px 封顶到 30） |
| 标签 | 10.5px 等宽，0.16em 字距，在数字上方 | C 稿实测 |
| 补充说明 | 10.5px 等宽，`--gm-text-tertiary`，在数字下方 | C 稿实测 |
| 单位 | 13px 无衬线，跟在数字后，色 `--gm-text-tertiary` | 新定 |
| 竖线 | 无 | 新定（C 有 1px 竖线，这里改为纯留白，呼应「一条竖线都不要」） |

### 6.5 导航

| 项 | 值 | 来源 |
| --- | --- | --- |
| 侧栏宽 | 224px，无底色（与页面同纸），右侧不画线 | C 稿实测（其侧栏无缝分隔） |
| 分组标题 | 10.5px 等宽，0.16em 字距，`--gm-text-tertiary` | C 稿实测 |
| 导航项 | 13px / 400，`--gm-text-secondary`，行距 6px，`min-height 24px` | C 稿实测 |
| 计数 | 10.5px 等宽，`--gm-text-tertiary`，右对齐 | C 稿实测 |
| 悬停 | 文字转 `--gm-text`，不加底色 | 新定（纸面上不加色块） |
| 当前 | 文字 `--gm-accent` + 600，计数 `--gm-accent` | 新定（强调蓝只标「当前所在」） |
| 移动端底栏 | 高 52px，上沿 1px `--gm-line`，当前项文字 `--gm-accent` | 新定 |

导航里不出现彩色图标、不出现徽标、不出现换行。

### 6.6 标签与小标记

| 项 | 值 | 来源 |
| --- | --- | --- |
| 尺寸 | 10.5px 等宽，0.16em 字距，全大写（仅拉丁） | C 稿实测 |
| 颜色 | 中性 `--gm-text-tertiary`；状态用 `--gm-success` / `--gm-warning` / `--gm-danger` | C 稿实测 + 新定 |
| 底与边 | 无 | 新定（取消胶囊底色） |
| 位置 | 跟在标题后（`margin-left: 10px`）或列末右对齐 | C 稿实测 |

一个视图里的状态色标签最多两个。分类、来源不得用颜色区分。

### 6.7 空态

| 项 | 值 | 来源 |
| --- | --- | --- |
| 结构 | 一行 13px `--gm-text-secondary` + 一个文字按钮，无图标、无插画 | 新定（C 无空态，按纸面语言推导） |
| 内距 | 上下 `--gm-sp-7`（44px） | 新定 |
| 宽度 | 不超过 40ch | 新定 |

### 6.8 标签页

| 项 | 值 | 来源 |
| --- | --- | --- |
| 高度 | 30px | 新定 |
| 字号 | 13px / 400 | C 稿实测（导航同级） |
| 当前 | 文字 `--gm-text` + 600，下方 2px `--gm-accent` | 主人指定（当前所在用蓝） |
| 非当前 | `--gm-text-tertiary`，悬停转 `--gm-text-secondary` | 新定 |
| 分隔 | 整条下方 1px `--gm-line` | C 稿实测（表头下沿） |

不做胶囊式标签页，不做包住整组的圆角容器。

### 6.9 待处理块

| 项 | 值 | 来源 |
| --- | --- | --- |
| 结构 | 三列平铺（窄屏转单列），每列上方 1px `--gm-line` | C 稿实测 |
| 编号 | 10.5px 等宽，`--gm-accent` | 新定（当前/待办的定位信号） |
| 标签 | 10.5px 等宽，`--gm-text-tertiary` | C 稿实测 |
| 正文 | 13px / 1.7 / `--gm-text-secondary` | C 稿实测（其 13px） |

## 7 迁移映射表

用法：按行替换，不需要判断。标「删除」的 token 在改造后不得出现；替换列给出替代它的具体写法。

### 7.1 字体与排版

| 旧 token | 新 |
| --- | --- |
| `--gm-font-mono` | `--gm-font-mono`（值改为 SF Mono 栈） |
| `--gm-font-sans` | `--gm-font-ui`（界面无衬线）；要读的长文改 `--gm-font-title`（宋体） |
| `--gm-font-2xs`（11） | `--gm-fs-micro`（10.5） |
| `--gm-font-xs`（12） | `--gm-fs-micro`（10.5）；可读文字改 `--gm-fs-ui`（13） |
| `--gm-font-sm`（13） | `--gm-fs-ui`（13）；条目正文用 `--gm-fs-row`（14.5） |
| `--gm-font-md`（15） | 阅读正文 `--gm-fs-read`（15）；不再有 15px 界面字 |
| `--gm-font-lg`（17） | Markdown `###` 用 `--gm-font-title` 17px / 600 |
| `--gm-font-xl`（20） | 报头品牌名 `--gm-fs-brand`（22）；Markdown `##` 用 20 |
| `--gm-font-2xl`（24） | 页面主标题 `--gm-fs-title`（26）；统计数字 `--gm-fs-stat`（30） |
| `--gm-leading-none` | 删除（图标与标记不设行高） |
| `--gm-leading-tight` | `--gm-lh-micro`（1.4） |
| `--gm-leading-title` | `--gm-lh-title`（1.35） |
| `--gm-leading-heading` | `--gm-lh-row`（1.45） |
| `--gm-leading-normal` | `--gm-lh-ui`（1.6） |
| `--gm-leading-relaxed` | `--gm-lh-read`（1.75） |
| `--gm-leading-reading` | `--gm-lh-read`（1.75） |
| `--gm-leading-reading-mobile` | `--gm-lh-read`（移动端不再单独放大） |

### 7.2 间距

| 旧 token | 新 |
| --- | --- |
| `--gm-space-0`（0） | 删除（0 直接写 0） |
| `--gm-space-1`（2） | `--gm-sp-1` |
| `--gm-space-2`（4） | `--gm-sp-2` |
| `--gm-space-3`（8） | `--gm-sp-3` |
| `--gm-space-4`（12） | `--gm-sp-4` |
| `--gm-space-5`（16） | `--gm-sp-5` |
| `--gm-space-6`（24） | `--gm-sp-6` |
| `--gm-space-7`（32） | `--gm-sp-7` |
| `--gm-page-pad-x`（24） | `--gm-sp-6` |
| `--gm-page-pad-y`（12） | `--gm-sp-5`（16） |
| `--gm-page-pad-bottom`（24） | `--gm-sp-7` |
| `--gm-page-pad-mobile-x`（12） | `--gm-sp-4` |
| `--gm-page-pad-mobile-y`（12） | `--gm-sp-4` |
| `--gm-section-gap`（12） | `--gm-sp-6`（24） |
| `--gm-section-gap-lg`（16） | `--gm-sp-7`（32） |
| `--gm-card-pad-x`（16） | `--gm-sp-5` |
| `--gm-card-pad-y`（16） | `--gm-sp-5` |
| `--gm-card-pad-mobile`（12） | `--gm-sp-4` |
| `--gm-card-header-gap`（12） | `--gm-sp-4` |
| `--gm-card-content-gap`（12） | `--gm-sp-4` |
| `--gm-row-pad-x`（8） | `--gm-sp-3` |
| `--gm-row-pad-y`（4） | 删除（行用固定高度 `--gm-h-row`） |
| `--gm-row-pad-y-comfort`（8） | 删除（触摸行用 `--gm-h-row-comfort` 44） |
| `--gm-row-gap`（8） | `--gm-sp-3` |
| `--gm-icon-text-gap`（8） | `--gm-sp-3` |
| `--gm-toolbar-gap`（8） | `--gm-sp-3` |
| `--gm-control-gap`（4） | `--gm-sp-2` |
| `--gm-control-pad-x`（8） | `--gm-sp-3` |
| `--gm-control-pad-y`（4） | 删除（控件用固定高度） |
| `--gm-control-pad-x-lg`（12） | `--gm-sp-4` |
| `--gm-control-pad-y-lg`（8） | 删除 |
| `--gm-nav-item-gap`（8） | `--gm-sp-3` |
| `--gm-nav-item-pad-x`（8） | `--gm-sp-3` |
| `--gm-nav-item-pad-y`（8） | 删除（导航项固定 32px 高） |
| `--gm-nav-stack-gap`（4） | `--gm-sp-2` |
| `--gm-list-header-pad-x`（12） | `--gm-sp-4` |
| `--gm-list-header-pad-y`（8） | 删除（分栏头固定 44px 高） |
| `--gm-list-row-pad-x`（12） | `--gm-sp-4` |
| `--gm-list-row-pad-y`（12） | 删除（行固定 40px 高） |
| `--gm-list-row-pad-y-compact`（8） | 删除 |
| `--gm-detail-pad-x`（16） | `--gm-sp-6` |
| `--gm-detail-pad-y`（16） | `--gm-sp-5` |
| `--gm-detail-pad-mobile-x`（12） | `--gm-sp-4` |
| `--gm-detail-pad-mobile-y`（12） | `--gm-sp-4` |

### 7.3 控件与行高尺寸

| 旧 token | 新 |
| --- | --- |
| `--gm-control-height-xs`（28） | `--gm-h-control`（30） |
| `--gm-control-height-sm`（32） | `--gm-h-control`（30） |
| `--gm-control-height-md`（34） | `--gm-h-control`（30） |
| `--gm-control-height-lg`（36） | `--gm-h-control`（30） |
| `--gm-control-height-xl`（38） | `--gm-h-control`（30） |
| `--gm-pane-header-height`（50） | `--gm-h-pane-header`（44） |
| `--gm-page-header-title-font` | `--gm-fs-title` |
| `--gm-page-header-icon-size` | `--gm-icon-lg` |
| `--gm-pane-header-title-font` | `--gm-fs-row`（14.5） |
| `--gm-pane-header-icon-size` | `--gm-icon-lg` |

### 7.4 图标

| 旧 token | 新 |
| --- | --- |
| `--gm-icon-dot`（8） | 删除（不再用圆点，状态改用等宽文字标签） |
| `--gm-icon-2xs`（12） | `--gm-icon-xs` |
| `--gm-icon-xs`（14） | `--gm-icon-sm` |
| `--gm-icon-sm`（16） | `--gm-icon-md` |
| `--gm-icon-md`（18） | `--gm-icon-md`（16） |
| `--gm-icon-lg`（20） | `--gm-icon-lg` |
| `--gm-icon-xl`（24） | `--gm-icon-xl` |
| `--gm-icon-result`（28） | `--gm-icon-xl`（24） |
| `--gm-icon-empty`（36） | `--gm-icon-xl`（24） |
| `--gm-icon-empty-lg`（40） | `--gm-icon-xl`（24） |
| `--gm-icon-hero`（48） | 删除 |

### 7.5 圆角

| 旧 token | 新 |
| --- | --- |
| `--gm-radius-none`（0） | `--gm-r-0` |
| `--gm-radius-xs`（2） | `--gm-r-0`（一律直角） |
| `--gm-radius-sm`（4） | `--gm-r-0` |
| `--gm-radius-md`（6） | `--gm-r-0` |
| `--gm-radius-lg`（8） | `--gm-r-0` |
| `--gm-radius-pill`（999） | 删除（不再使用胶囊；圆点改为等宽文字标签） |

### 7.6 阴影与遮罩

| 旧 token | 新 |
| --- | --- |
| `--gm-shadow-card` | 删除（本轮没有卡片，也没有投影） |
| `--gm-shadow-popover` | 删除（弹层用 1px 边 + `--gm-surface-raised` 底） |
| `--gm-shadow-soft` | 删除 |
| `--gm-shadow-modal` | 删除（对话框靠遮罩区隔） |
| `--gm-shadow-bottom` | 删除 |
| `--gm-shadow-bottom-soft` | 删除 |
| `--gm-shadow-control` | 删除 |
| `--gm-shadow-control-strong` | 删除 |
| `--gm-shadow-inset-top` | 删除 |
| `--gm-shadow-danger-ring` | 删除（用 `2px --gm-focus-ring`） |
| `--gm-sync-shimmer-bg` | 删除（同步中用旋转图标，不用渐变） |
| `--gm-overlay-scrim` | `--gm-scrim` |
| `--gm-overlay-dialog` | `--gm-scrim` |
| `--gm-overlay-soft` | 删除 |
| `--gm-blur-modal` | 删除（不做背景模糊） |

### 7.7 色彩

| 旧 token | 新 |
| --- | --- |
| `--gm-color-bg-canvas` | `--gm-canvas` |
| `--gm-color-bg-page` | `--gm-canvas` |
| `--gm-color-bg-surface` | `--gm-surface` |
| `--gm-color-bg-elevated` | `--gm-surface-raised` |
| `--gm-color-bg-inset` | `--gm-input-bg` |
| `--gm-color-bg-hover` | `--gm-hover` |
| `--gm-color-bg-selected` | `--gm-selected` |
| `--gm-color-text-primary` | `--gm-text` |
| `--gm-color-text-secondary` | `--gm-text-secondary` |
| `--gm-color-text-muted` | `--gm-text-tertiary` |
| `--gm-color-text-inverse` | `--gm-on-action`（墨色按钮上的字） |
| `--gm-color-border-subtle` | `--gm-line` |
| `--gm-color-border-strong` | `--gm-line-strong` |
| `--gm-color-brand` | `--gm-accent` |
| `--gm-color-brand-hover` | `--gm-accent-hover` |
| `--gm-color-success` | `--gm-success` |
| `--gm-color-warning` | `--gm-warning` |
| `--gm-color-danger` | `--gm-danger` |
| `--gm-color-purple` | 删除（无第七语义色） |
| `--gm-color-pink` | 删除 |
| `--gm-color-on-accent` | `--gm-on-action` |
| `--gm-color-muted-icon` | `--gm-text-tertiary` |
| `--gm-accent-muted` | `--gm-accent-tint` |
| `--gm-accent-soft` | `--gm-accent-tint` |
| `--gm-accent-border` | `--gm-accent`（作描边） |
| `--gm-warning-soft` | `--gm-warning-tint` |
| `--gm-warning-border` | `--gm-warning` |
| `--gm-success-border` | `--gm-success` |
| `--gm-danger-soft` | `--gm-danger-tint` |
| `--gm-danger-border` | `--gm-danger` |
| `--gm-selection-border` | `--gm-accent` |
| `--gm-empty-icon-color` | `--gm-text-tertiary` |
| `--gm-olympic-blue` | 删除（分类不再用色） |
| `--gm-olympic-yellow` | 删除 |
| `--gm-olympic-black` | 删除 |
| `--gm-olympic-green` | 删除 |
| `--gm-olympic-red` | 删除 |
| `--gm-category-blue` | 删除（图表最多两色：`--gm-accent` + `--gm-text-tertiary`） |
| `--gm-category-green` | 删除 |
| `--gm-category-yellow` | 删除 |
| `--gm-category-gray` | 删除 |
| `--gm-category-teal` | 删除 |
| `--gm-provider-github` | 删除（托管商用单色图标 + 文字） |
| `--gm-provider-gitlab` | 删除 |
| `--gm-provider-gitee` | 删除 |
| `--gm-provider-bitbucket` | 删除 |
| `--gm-provider-other` | 删除 |
| `--bg` | `--gm-canvas` |
| `--bg-card` | `--gm-surface` |
| `--bg-hover` | `--gm-hover` |
| `--bg-input` | `--gm-input-bg` |
| `--bg-success` | `--gm-success-tint` |
| `--bg-danger` | `--gm-danger-tint` |
| `--border` | `--gm-line` |
| `--border-strong` | `--gm-line-strong` |
| `--text` | `--gm-text` |
| `--text-secondary` | `--gm-text-secondary` |
| `--accent` | `--gm-accent` |
| `--accent-hover` | `--gm-accent-hover` |
| `--green` | `--gm-success` |
| `--yellow` | `--gm-warning` |
| `--red` | `--gm-danger` |
| `--purple` | 删除 |
| `--pink` | 删除 |

### 7.8 结构尺寸

| 旧 token | 新 |
| --- | --- |
| `--gm-size-sidebar-width`（224） | `--gm-w-sidebar` |
| `--gm-size-sidebar-collapsed-width`（18） | `--gm-w-rail` |
| `--gm-size-split-pane-left-default`（320） | `--gm-w-pane-default` |
| `--gm-size-split-pane-left-min`（260） | `--gm-w-pane-min` |
| `--gm-size-split-pane-left-max`（560） | `--gm-w-pane-max` |
| `--gm-size-split-pane-right-min`（232） | `--gm-w-detail-min`（320） |
| `--gm-size-split-handle-width`（4） | `--gm-w-handle`（1，热区 8） |
| `--gm-size-split-handle-line-width`（1） | `--gm-w-handle` |
| `--gm-size-scrollbar`（6） | `--gm-w-scrollbar` |
| `--gm-size-divider`（1） | 删除（边框统一 1px 字面量） |
| `--gm-size-setup-panel-max-width`（720） | `--gm-w-content-max` |
| `--gm-size-drop-card-max-width`（720） | `--gm-w-content-max` |
| `--gm-size-layout-toggle`（22） | `--gm-h-control-sm`（24） |
| `--gm-settings-row-icon-gap` | `--gm-sp-4` |
| `--gm-size-settings-row-icon-offset` | 删除（图标列宽用 `--gm-sp-7`） |
| `--gm-size-spinner-sm`（16） | `--gm-icon-md` |
| `--gm-size-kbd-min-width`（18） | 删除（键盘提示用 `--gm-r-kbd` + 4px 内边距） |
| `--gm-size-status-pill-min-height`（26） | 删除（状态胶囊固定 18px） |
| `--gm-size-empty-state-min-height`（180） | 空态最小高度 180px 固定值 |
| `--gm-size-find-input-min-height`（30） | `--gm-h-control`（30） |
| `--gm-size-mobile-row-min-height`（44） | `--gm-h-row-comfort`（44） |
| `--gm-size-mobile-bottom-nav-height`（52） | 移动底栏 52px 固定值 |
| `--gm-size-mobile-bottom-content-offset`（44） | 删除（改用 `52px + env(safe-area-inset-bottom)`） |
| `--gm-size-mobile-dashboard-bottom-offset`（96） | 删除（同上） |
| `--gm-size-mobile-selection-bottom-offset`（100） | 删除（同上） |
| `--gm-mobile-bottom-content-padding` | 删除（随上一条合并） |
| `--gm-mobile-dashboard-bottom-padding` | 删除 |
| `--gm-mobile-bottom-selection-padding` | 删除 |
| `--gm-mobile-fixed-bar-bottom` | 删除 |
| `--gm-size-setup-sidebar-width`（280） | 删除（设置页改单列，宽 `--gm-w-content-max`） |
| `--gm-size-setup-sidebar-width-done`（300） | 删除 |
| `--gm-size-setup-nav-back-min-width`（86） | 删除（用次按钮规格） |
| `--gm-size-setup-nav-back-min-width-mobile`（72） | 删除 |
| `--gm-size-setup-logo-box`（36） | 删除 |
| `--gm-size-setup-step-index`（24） | `--gm-icon-xl` |
| `--gm-size-setup-candidate-list-max-height`（260） | 删除（列表最大高度 `40vh`） |
| `--gm-size-split-collapsed-rail-width`（22） | `--gm-w-rail`（18） |
| `--gm-size-split-handle-hover-width`（8） | 删除（热区 8px 字面量） |
| `--gm-offset-split-handle-hover`（-2） | 删除 |
| `--gm-size-menu-popover-min-width`（178） | 删除（弹层最小宽 200px 字面量） |
| `--gm-offset-menu-popover-top`（38） | 删除（弹层位置由定位计算） |
| `--gm-offset-floating-toast`（24） | `--gm-sp-6` |
| `--gm-size-floating-toast-width`（440） | 删除（Toast 宽 320px，直角） |
| `--gm-size-floating-toast-gutter`（32） | `--gm-sp-7` |
| `--gm-size-drop-result-list-max-height`（260） | 删除（列表最大高度 `40vh`） |
| `--gm-size-error-log-max-height`（44vh） | 删除（日志最大高度 `40vh`） |
| `--gm-size-quick-paste-list-max-height`（340） | 删除（列表最大高度 `40vh`） |
| `--gm-size-quick-paste-result-icon`（28） | `--gm-icon-xl`（24） |
| `--gm-size-code-editor-min-height`（420） | 删除（编辑器占满父容器） |
| `--gm-size-switch-width`（44） | 开关 36px 固定值 |
| `--gm-size-switch-height`（24） | 开关 20px 固定值 |
| `--gm-size-switch-thumb`（18） | 开关滑块 16px 固定值 |
| `--gm-size-switch-padding`（3） | 开关内边距 2px 固定值 |
| `--gm-size-card-rail`（3） | 删除（卡片不带色条） |
| `--gm-size-dashboard-cli-desc-max-width`（620） | 说明文字用 `72ch` |
| `--gm-size-dashboard-quick-note-min-height`（340） | 删除（笔记输入占满栏宽） |
| `--gm-size-dashboard-quick-note-actions-width`（132） | 删除 |
| `--gm-size-settings-input-branch`（120） | 删除（输入框占满列宽） |
| `--gm-size-settings-input-proxy`（320） | 删除 |
| `--gm-size-settings-input-remote`（280） | 删除 |
| `--gm-size-settings-copy-sm`（200） | 删除 |
| `--gm-size-settings-copy-md`（240） | 删除 |
| `--gm-size-settings-copy-lg`（280） | 删除 |
| `--gm-size-settings-range-width`（280） | 删除 |
| `--gm-size-settings-modal-md`（520） | 对话框 520px 固定值 |
| `--gm-size-settings-modal-lg`（720） | 对话框 720px 固定值 |
| `--gm-size-settings-modal-inline`（90%） | 删除 |
| `--gm-size-settings-modal-max-height-md`（70vh） | 删除（对话框最大高 `80vh`） |
| `--gm-size-settings-modal-max-height-lg`（78vh） | 删除 |
| `--gm-size-settings-log-max-height`（260） | 删除（日志最大高度 `40vh`） |
| `--gm-size-settings-progress-width`（120） | 删除 |

### 7.9 层与动效

| 旧 token | 新 |
| --- | --- |
| `--gm-z-sticky`（10） | `--gm-z-sticky`（10） |
| `--gm-z-bottom-nav`（30） | `--gm-z-nav`（30） |
| `--gm-z-overlay`（50） | `--gm-z-overlay`（50） |
| 无（旧无动效 token） | 新增 `--gm-dur-1`、`--gm-dur-2`、`--gm-ease` |

---

## 8 三屏示意

版心统一：画布 1440，左右留白 96，侧栏 224，栏间 52，主栏 972。三屏的差异只在主栏内部的组织方式。

### 8.1 仪表盘

结构（主栏自上而下）：

1. **报头**：品牌名 22/600 宋体 + 页面主标题 26/1.35/600，「三天前那条中断的条款草稿，今天可以接着写完。」+ 副说明 13/1.7。右上角是同步状态：五行等宽 10.5，右对齐。
2. **统计带**：四等分，上下各一条 1px 线，数字 30/600 宋体，标签 10.5 等宽在上、补充说明 10.5 在下。四项之间只有 24px 列距，无竖线。
3. **最近条目**：区块标题 10.5 等宽 + 右侧「1,281 条中显示 5 条」。五条带序号的行，行高 40，行间 1px 线，当前行 6% 蓝底。
4. **快速记一行**：标题 10.5 等宽，输入区无框只有上下两条线，宋体 15px（阅读字号），右下角「写入 收件箱」文字按钮。
5. **待处理 · 3**：三列平铺，每列上沿一条线，`01/02/03` 蓝色等宽编号 + 13px 说明。

响度：最响 = 主标题（26/600，全页唯一 26px）；次之 = 统计数字（30px，但只占四格、面积小）；最弱 = 条目序号、来源、时间（10.5 等宽）。统计数字字号大于主标题，靠面积小让它退到第二层——这是 C 骨架的特征，不用 A 的 82px。

禁止：卡片、统计卡彩色竖条、分类彩色图标、投影、圆角容器、把「最近条目」做成浮起卡片。

### 8.2 笔记

结构（侧栏 224 + 列表 320 + 详情 652）：

1. 列表栏与详情栏之间一条 1px `--gm-line`（全页唯一允许的竖线之一，仅在双栏时出现）。
2. 列表头：10.5 等宽标题 + 右侧「新建」文字按钮，栏头高 44 + 底线 1px。
3. 输入区：无卡片，直接位于列表上方；标题输入与正文输入同为 13/400，只有底线，聚焦底线转蓝。
4. 列表行：序号 22 + 标题 14.5/400 + 时间 10.5 等宽右对齐，行高 40，行间 1px 线，当前行 6% 蓝底 + 标题 600。
5. 详情栏：阅读面 15px/1.75 宋体，内距 24，正文 `max-width: 66ch`；顶部工具栏 44 高，标题 14.5/600（不放大到 26，因为主标题在报头）。

响度：最响 = 当前行的标题（600 + 蓝底）；次之 = 详情正文首段；最弱 = 时间、序号、来源。

禁止：输入区做成带投影的卡片、左右两栏各自再包卡、选中行加缩放或阴影、正文用等宽字体。

### 8.3 搜索

结构（单列结果流，或双栏时结果在左）：

1. 搜索框：30 高，无框只有底线，左侧 14px 放大镜（`--gm-text-tertiary`），占位符 13/`--gm-text-tertiary`，聚焦底线转蓝。
2. 结果计数：一行 10.5 等宽，写作「12 条结果 · 0.04 s」，与结果列表间距 24。
3. 结果行：序号 + 类型 + 标题（14.5）+ 来源 + 时间，行高 40，行间 1px 线，无底色、无边框、无投影。
4. 命中词：600 + `--gm-text`，不加底纹、不改颜色。
5. 键盘：↑/↓ 移动，当前行 6% 蓝底 + 左侧不画竖条；Enter 打开。

响度：最响 = 结果标题（14.5/600）；次之 = 摘要（13/400）；最弱 = 序号、时间、来源（10.5 等宽）。

禁止：每条结果做成卡片、结果计数用胶囊徽标、命中词用黄底高亮、结果分组标题堆叠。

## 附录 A：与旧规范、与初稿的差异

| 项 | 旧规范（DESIGN.md） | V2 初稿（双主题） | 本轮（纸面） | 来源 |
| --- | --- | --- | --- | --- |
| 主题 | 深/浅两套 | 深/浅两套 | 只纸面一套 | C 稿 |
| 字号 | 11/12/13/15/17/20/24 七档混用 | 界面四档 + 阅读四档 | 七档：22/26/30/14.5/13/10.5/15 | C 密度 + 30px 封顶 |
| 字族 | 等宽为主 | 界面等宽 + 阅读无衬线 | 宋体 / 无衬线 / 等宽三分工 | A 稿 |
| 字重 | 12 个值 | 400/600 | 400/500/600（500 只给等宽标签） | C 稿 |
| 字距 | 个别位置非 0 | 恒为 0 | 只有两处：标签 0.16em、统计 -0.02em | C 稿 |
| 强调色 | 蓝紫 | 蓝紫 | `#1f4fbf`，只标当前所在 / 链接 / 悬停微染 | 主人指定 |
| 分类色 | 奥运五色 + category 5 + provider 5 | 全删 | 全删，且不许用图标底色替代 | A 稿结论 |
| 卡片 | 大量卡片 | 保留卡片、两级投影 | 无卡片、无投影、无圆角容器 | C 稿 |
| 阴影 | 11 个 | 2 个 | 0 个 | C 稿 |
| 圆角 | 6 档 | 4 档 + 胶囊 | 只有 0 与 3px（键盘提示） | C 稿 |
| 分区手段 | 卡片 + 线 + 留白 | 线 + 留白 + 底色 | 1px 线 + 留白，条目带序号 | C 稿 |
| 统计 | 卡片墙 | 统计卡 | 表格带，30px 数字封顶 | C 稿骨架 + 主人封顶 |
| 报头 | 20px 页标题 | 20px 页标题 + 面板头 | 品牌名 22 + 主标题 26 + 副说明 13 | A 结构 / 主人定尺寸 |
| 行高控制 | 行高 + 内边距 | `min-height` | `min-height` 40/56，一屏 ≥6 条 | 主人指定 |
| 图表 | 无规则 | 两色 | 固定上限 40/天，不按周内最大值自适应 | 主人指定 |
| 动效 | 无 token | 2 时长 + 1 曲线 | 同初稿 | 新定 |

## 附录 B：完整 token 清单（可直接粘贴）

本节是全文 token 的唯一取值来源。前文出现但本节未列的 token 名，视为文档错误。
总数 88 个；上一版的 89 个已作废，取值来源见各表「来源」列。
两套主题共用同一批 token 名：`:root` 是纸面（浅色），`[data-theme="dark"]` 只覆盖颜色，间距、字号、圆角、动效不分叉。

```css
:root {
  color-scheme: light;

  /* 结构 — C 稿实测 */
  --gm-canvas: #f4efe6;
  --gm-surface: #ece5d8;
  --gm-surface-raised: #f7f2e6;
  --gm-input-bg: #e9e1d2;
  --gm-hover: rgba(25, 21, 18, 0.04);
  --gm-selected: rgba(31, 79, 191, 0.08);
  --gm-line: rgba(25, 21, 18, 0.16);
  --gm-line-strong: #8a8174;
  --gm-scrim: rgba(25, 21, 18, 0.35);

  /* 文字 — C 稿实测 */
  --gm-text: #191512;
  --gm-text-secondary: #4a4340;
  --gm-text-tertiary: #6c645c;
  --gm-text-disabled: #b8b0a4;
  --gm-on-action: #f4efe6;

  /* 强调 — 主人指定 #1f4fbf */
  --gm-accent: #1f4fbf;
  --gm-accent-hover: #173d99;
  --gm-accent-tint: rgba(31, 79, 191, 0.06);
  --gm-focus-ring: #1f4fbf;

  /* 动作 — C 稿的墨底按钮 */
  --gm-action: #191512;
  --gm-action-hover: #2c2823;
  --gm-action-pressed: #0d0b09;

  /* 状态 */
  --gm-success: #2f6b46;
  --gm-success-tint: rgba(47, 107, 70, 0.08);
  --gm-warning: #8a5a12;
  --gm-warning-tint: rgba(138, 90, 18, 0.08);
  --gm-danger: #8c2f1e;
  --gm-danger-tint: rgba(140, 47, 30, 0.08);

  /* 字族 — A 稿三分工 */
  --gm-font-title: "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif;
  --gm-font-ui: -apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  --gm-font-mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;

  /* 字号 — C 密度 + 30px 封顶 */
  --gm-fs-brand: 22px;
  --gm-fs-title: 26px;
  --gm-fs-stat: 30px;
  --gm-fs-row: 14.5px;
  --gm-fs-ui: 13px;
  --gm-fs-micro: 10.5px;
  --gm-fs-read: 15px;

  /* 行高 */
  --gm-lh-micro: 1.4;
  --gm-lh-title: 1.35;
  --gm-lh-row: 1.45;
  --gm-lh-ui: 1.6;
  --gm-lh-read: 1.75;

  /* 字重与字距 */
  --gm-fw-regular: 400;
  --gm-fw-medium: 500;
  --gm-fw-strong: 600;
  --gm-tracking: 0;
  --gm-tracking-label: 0.16em;
  --gm-tracking-stat: -0.02em;

  /* 间距 */
  --gm-sp-1: 4px;
  --gm-sp-2: 8px;
  --gm-sp-3: 12px;
  --gm-sp-4: 16px;
  --gm-sp-5: 24px;
  --gm-sp-6: 32px;
  --gm-sp-7: 44px;
  --gm-sp-8: 56px;

  /* 圆角 — 只有直角与键盘提示 */
  --gm-r-0: 0;
  --gm-r-kbd: 3px;

  /* 动效 */
  --gm-dur-1: 120ms;
  --gm-dur-2: 180ms;
  --gm-ease: cubic-bezier(0.2, 0, 0, 1);

  /* 图标 */
  --gm-icon-xs: 12px;
  --gm-icon-sm: 14px;
  --gm-icon-md: 16px;
  --gm-icon-lg: 20px;

  /* 结构尺寸 — C 骨架 */
  --gm-w-sidebar: 224px;
  --gm-w-rail: 18px;
  --gm-w-gutter: 52px;
  --gm-w-pad-x: 96px;
  --gm-w-scrollbar: 6px;
  --gm-w-pane-default: 320px;
  --gm-w-pane-min: 260px;
  --gm-w-pane-max: 560px;
  --gm-w-detail-min: 320px;
  --gm-w-handle: 1px;
  --gm-w-content-max: 972px;
  --gm-h-row: 40px;
  --gm-h-row-2: 56px;
  --gm-h-row-comfort: 44px;
  --gm-h-nav: 24px;
  --gm-h-nav-gap: 6px;
  --gm-h-control: 30px;
  --gm-h-control-sm: 24px;
  --gm-h-pane-header: 44px;
  --gm-chart-max: 40;

  /* 层级 */
  --gm-z-sticky: 10;
  --gm-z-nav: 30;
  --gm-z-overlay: 50;
}

/* 深夜：只覆盖颜色，其余继承纸面 */
[data-theme="dark"] {
  color-scheme: dark;

  --gm-canvas: #1b1916;
  --gm-surface: #232019;
  --gm-surface-raised: #2b2721;
  --gm-input-bg: #141210;
  --gm-hover: rgba(239, 233, 221, 0.05);
  --gm-selected: rgba(124, 156, 255, 0.14);
  --gm-line: rgba(239, 233, 221, 0.16);
  --gm-line-strong: #7a7265;
  --gm-scrim: rgba(0, 0, 0, 0.55);

  --gm-text: #efe9dd;
  --gm-text-secondary: #bdb5a8;
  --gm-text-tertiary: #9a9287;
  --gm-text-disabled: #635c53;
  --gm-on-action: #1b1916;

  --gm-accent: #7c9cff;
  --gm-accent-hover: #9db4ff;
  --gm-accent-tint: rgba(124, 156, 255, 0.10);
  --gm-focus-ring: #7c9cff;

  --gm-action: #efe9dd;
  --gm-action-hover: #fffdf8;
  --gm-action-pressed: #d8d2c4;

  --gm-success: #6ec48e;
  --gm-success-tint: rgba(110, 196, 142, 0.12);
  --gm-warning: #d8a24b;
  --gm-warning-tint: rgba(216, 162, 75, 0.12);
  --gm-danger: #e8786a;
  --gm-danger-tint: rgba(232, 120, 106, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    /* 与上面 [data-theme="dark"] 相同的 27 个颜色值，实现时复制一份 */
  }
}
```
