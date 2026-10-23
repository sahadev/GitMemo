# GitMemo 设计语言 V2

状态：改造期唯一标准。
效力：`docs/design/DESIGN.md` 降级为历史参考与问题清单，不再作为执行标准；`docs/design/LANGUAGE.md` 是 V1 校准稿，本文生效后作废。实现与之冲突时以本文为准。
范围：`desktop/src` 全部界面代码。
数字约定：文中所有数值可直接写进 CSS。颜色写 hex，尺寸写 px，动效写 ms，缓动写 `cubic-bezier`。凡是本文件无法量化的形容词都不出现。

---

## 1 核心定位

一句话：**像一张排得极准的技术手册页面——暖调纸面、等宽字、只有一条竖线和一种蓝在指路。**

不做成笔记软件的卡片墙，也不做成终端模拟器的荧光屏。信息密度按纸面手册给，视觉响度按工程文档压。

### 三条不可协商原则

**原则一：一屏只有三层响度。**
每屏必须能回答「最响的是什么」，且最响层不得覆盖超过屏幕 15% 的面积。三层之外的实体（第四个标题、第五条线、第二种强调色）必须删掉，不允许「弱化一下」保留。判定方法：把界面转成纯灰后，仍能看出主次，就合格；看不出，说明层级是靠颜色撑的，重做。

**原则二：一个方向只画一条线。**
同一区域内，横向分隔线只有一种颜色（`--gm-line`）和一种厚度（1px）；纵向分隔线只出现在分栏之间。禁止「线 + 线框 + 阴影」叠三层来表达层级。判定方法：数一个模块边界上的可见边界层数，大于 1 即违规。

**原则三：颜色不承担分类。**
分类、来源、类型一律用文字与图标形状表达。颜色只表达四种信息：可交互（蓝）、当前选中（蓝 + 底色）、状态（成功/警告/危险）、结构（中性色阶）。判定方法：把分类色全部换成灰，功能与信息不能减少任何一项。

### 长时阅读与键盘操作

- 阅读面（Markdown、纪要、对话详情）用 `--gm-font-read`，字号 `--gm-fs-read`，行高 `--gm-lh-read`，行长上限 `66ch`。
- 所有可交互元素必须有可见焦点环：`2px` `--gm-focus-ring`，`outline-offset: 2px`。禁止用 `outline: none` 了事。
- 焦点顺序跟随视觉顺序，不做跳位；打开面板后焦点进入面板第一个可交互元素，Esc 关闭并把焦点还给触发元素。
- 所有列表必须能用 ↑ / ↓ 移动并同步滚动，当前项用 `--gm-selected` 底色表示。

---

## 2 色彩系统

### 2.1 深色（默认）

| token | 值 | 用在哪 | 不用在哪 |
| --- | --- | --- | --- |
| `--gm-canvas` | `#14130F` | 应用底、页面底、编辑器底 | 卡片、输入框 |
| `--gm-surface` | `#1B1A15` | 侧栏、列表栏、详情栏、卡片 | 页面整底 |
| `--gm-surface-raised` | `#24221B` | 弹出菜单、悬浮层、对话框、拖拽预览 | 常驻面板 |
| `--gm-input-bg` | `#100F0C` | 输入框、搜索框、代码块、终端输出 | 普通面板 |
| `--gm-hover` | `#232119` | 行悬停、按钮悬停底、未选中的分段控件 | 大面积区块 |
| `--gm-selected` | `#222A3F` | 选中行、选中标签页、当前导航项 | 悬停态 |
| `--gm-line` | `#302E26` | 分栏竖线、列表行分隔、表头下横线 | 输入框边界 |
| `--gm-line-strong` | `#6A6857` | 输入框静止边界、开关轨道、可辨识控件轮廓 | 装饰分隔 |
| `--gm-text` | `#F2EFE6` | 页标题、面板标题、行标题、正文主体 | 元信息 |
| `--gm-text-secondary` | `#C0BAAB` | 正文、摘要、未选中列表标题、说明文字 | 标题 |
| `--gm-text-tertiary` | `#9C9686` | 时间戳、计数、占位符、路径、快捷键 | 可读正文 |
| `--gm-text-disabled` | `#5E5A4C` | 禁用控件文字 | 任何可读内容 |
| `--gm-on-accent` | `#FFFFFF` | 填充按钮文字、蓝底徽标文字 | 其他底色 |
| `--gm-accent` | `#7C9CFF` | 链接文字、图标激活、选中描边、焦点环 | 大色块背景 |
| `--gm-accent-hover` | `#96B0FF` | 链接与图标悬停 | 静态状态 |
| `--gm-accent-fill` | `#3560DE` | 主按钮填充 | 文字颜色 |
| `--gm-accent-fill-hover` | `#3E6BF0` | 主按钮悬停填充 | 文字颜色 |
| `--gm-accent-fill-pressed` | `#2C51C4` | 主按钮按下填充 | 文字颜色 |
| `--gm-accent-tint` | `#1E2438` | 选中行底色之外的蓝色浅底（提示条、标签底） | 正文底 |
| `--gm-focus-ring` | `#7C9CFF` | 焦点环、当前输入框描边 | 静态边框 |
| `--gm-success` | `#5BC98A` | 成功文字、成功图标、已同步状态 | 大面积填充 |
| `--gm-success-tint` | `#17291F` | 成功提示条底色 | 正文底 |
| `--gm-warning` | `#E3AD55` | 警告文字、未推送状态 | 大面积填充 |
| `--gm-warning-tint` | `#2A2118` | 警告提示条底色 | 正文底 |
| `--gm-danger` | `#F2806F` | 错误文字、危险动作文字 | 大面积填充 |
| `--gm-danger-tint` | `#2C1A17` | 错误提示条底色、危险确认按钮底 | 正文底 |
| `--gm-scrim` | `rgba(0, 0, 0, 0.60)` | 对话框遮罩 | 其他任何用途 |

### 2.2 浅色

| token | 值 | 用在哪 | 不用在哪 |
| --- | --- | --- | --- |
| `--gm-canvas` | `#F4F1E9` | 应用底、页面底、编辑器底 | 卡片、输入框 |
| `--gm-surface` | `#FBF9F3` | 侧栏、列表栏、详情栏、卡片 | 页面整底 |
| `--gm-surface-raised` | `#FFFFFF` | 弹出菜单、悬浮层、对话框 | 常驻面板 |
| `--gm-input-bg` | `#EFEBE1` | 输入框、搜索框、代码块 | 普通面板 |
| `--gm-hover` | `#EAE6DA` | 行悬停、按钮悬停底 | 大面积区块 |
| `--gm-selected` | `#E7EDFB` | 选中行、选中标签页、当前导航项 | 悬停态 |
| `--gm-line` | `#DAD4C7` | 分栏竖线、列表行分隔、表头下横线 | 输入框边界 |
| `--gm-line-strong` | `#8A8879` | 输入框静止边界、开关轨道、控件轮廓 | 装饰分隔 |
| `--gm-text` | `#191813` | 页标题、面板标题、行标题、正文主体 | 元信息 |
| `--gm-text-secondary` | `#4F4C43` | 正文、摘要、说明文字 | 标题 |
| `--gm-text-tertiary` | `#6A6659` | 时间戳、计数、占位符、路径、快捷键 | 可读正文 |
| `--gm-text-disabled` | `#A5A091` | 禁用控件文字 | 任何可读内容 |
| `--gm-on-accent` | `#FFFFFF` | 填充按钮文字、蓝底徽标文字 | 其他底色 |
| `--gm-accent` | `#2A52C4` | 链接文字、图标激活、选中描边、焦点环 | 大色块背景 |
| `--gm-accent-hover` | `#1F41A0` | 链接与图标悬停 | 静态状态 |
| `--gm-accent-fill` | `#2F5AD0` | 主按钮填充 | 文字颜色 |
| `--gm-accent-fill-hover` | `#2749B0` | 主按钮悬停填充 | 文字颜色 |
| `--gm-accent-fill-pressed` | `#1F3C93` | 主按钮按下填充 | 文字颜色 |
| `--gm-accent-tint` | `#E9EEFC` | 蓝色浅底（提示条、标签底） | 正文底 |
| `--gm-focus-ring` | `#2A52C4` | 焦点环、当前输入框描边 | 静态边框 |
| `--gm-success` | `#147349` | 成功文字、成功图标、已同步状态 | 大面积填充 |
| `--gm-success-tint` | `#E4F1E9` | 成功提示条底色 | 正文底 |
| `--gm-warning` | `#8A5A12` | 警告文字、未推送状态 | 大面积填充 |
| `--gm-warning-tint` | `#F6EBDC` | 警告提示条底色 | 正文底 |
| `--gm-danger` | `#B3342B` | 错误文字、危险动作文字 | 大面积填充 |
| `--gm-danger-tint` | `#F7E4E1` | 错误提示条底色、危险确认按钮底 | 正文底 |
| `--gm-scrim` | `rgba(20, 19, 15, 0.48)` | 对话框遮罩 | 其他任何用途 |

### 2.3 对比度实测

下表的数字是用 WCAG 2.x 相对亮度公式对本节色值计算的实测值，不是估算。

| 组合 | 深色 | 浅色 | 下限 |
| --- | --- | --- | --- |
| 主文字 / 画布 | 16.17 | 15.75 | 4.5 |
| 主文字 / 表面 | 15.16 | 16.88 | 4.5 |
| 主文字 / 悬浮层 | 13.84 | 17.78 | 4.5 |
| 次文字 / 画布 | 9.61 | 7.60 | 4.5 |
| 次文字 / 表面 | 9.01 | 8.15 | 4.5 |
| 次文字 / 悬停底 | 8.33 | 6.88 | 4.5 |
| 次文字 / 选中底 | 7.38 | 7.32 | 4.5 |
| 三级文字 / 画布 | 6.30 | 5.09 | 4.5 |
| 三级文字 / 表面 | 5.91 | 5.45 | 4.5 |
| 三级文字 / 输入底 | 6.50 | 4.82 | 4.5 |
| 三级文字 / 选中底 | 4.84 | 4.90 | 4.5 |
| 强调色文字 / 画布 | 7.13 | 6.00 | 4.5 |
| 强调色文字 / 选中底 | 5.48 | 5.77 | 4.5 |
| 白字 / 主按钮填充 | 5.41 | 6.01 | 4.5 |
| 白字 / 主按钮悬停填充 | 4.60 | 7.88 | 4.5 |
| 白字 / 主按钮按下填充 | 6.82 | 9.88 | 4.5 |
| 成功 / 画布 | 9.00 | 5.20 | 4.5 |
| 警告 / 画布 | 9.18 | 5.24 | 4.5 |
| 危险 / 画布 | 7.16 | 5.40 | 4.5 |
| 成功 / 成功底色 | 7.40 | 5.05 | 4.5 |
| 警告 / 警告底色 | 7.81 | 5.02 | 4.5 |
| 危险 / 危险底色 | 6.39 | 4.98 | 4.5 |
| 控件边界 / 画布 | 3.30 | 3.17 | 3.0 |
| 控件边界 / 表面 | 3.10 | 3.39 | 3.0 |
| 控件边界 / 输入底 | 3.03 | 3.00 | 3.0 |
| 分隔线 / 画布 | 1.37 | 1.31 | 无需 |

`--gm-line` 是装饰性分隔线，不承担可辨识信息，不受 3:1 约束；凡是「这条线用来判断控件边界」的地方必须用 `--gm-line-strong`。

### 2.4 颜色使用规则

1. 一屏非中性色上限：`--gm-accent` 一族 + 最多一种状态色。出现两种状态色时，其中一种必须是图标或单行文字，不得是区块底色。
2. 禁止渐变。`linear-gradient` 只允许出现在加载中的进度条上，且只能由两种中性色构成。
3. 禁止用 `opacity` 表达层级。需要更弱的文字用 `--gm-text-tertiary`，需要更弱的线用 `--gm-line`。
4. 禁止用 `color-mix()` 生成新颜色。所有颜色必须是本节的具名 token。
5. 选中状态 = `--gm-selected` 底色 + `--gm-text` 文字 + 左侧 2px `--gm-accent` 竖条，三者取其二即可，不得再加投影或放大。
6. 危险色只出现在危险动作的文字、图标、确认按钮底色上。禁止用红色作为区块背景，`--gm-danger-tint` 仅限提示条且高度不超过 48px。
7. 分类、来源、Git 托管商一律单色：图标用 `--gm-text-tertiary`，文字用 `--gm-text-secondary`。不存在分类色。

---

## 3 排版系统

### 3.1 字族

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-font-ui` | `"JetBrains Mono", ui-monospace, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace` | 全部界面骨架：导航、按钮、列表、表单、状态、数字 |
| `--gm-font-read` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` | Markdown 正文、纪要、对话内容等长时阅读面 |

只允许这两个字族。禁止引入付费字体、禁止从 CDN 加载第三方字体、禁止新增第三个字族。

### 3.2 界面阶梯（4 档）

| token | 字号 | 行高 | 字重 | 用途 |
| --- | --- | --- | --- | --- |
| `--gm-fs-micro` | 11px | 1.45 | 600 | 徽标、计数、快捷键提示、状态胶囊文字、标签页小计数 |
| `--gm-fs-ui` | 13px | 1.5 | 400 | 正文、列表行标题（配 600）、按钮文字（配 600）、表单值、菜单项 |
| `--gm-fs-ui-lg` | 16px | 1.4 | 600 | 分栏面板标题、对话框标题、设置页分组标题 |
| `--gm-fs-title` | 20px | 1.25 | 600 | 页标题、空态主标题 |

界面里只允许这四档。出现 12px、14px、15px、17px、18px、24px 均为违规。
11px 只用于元信息，禁止承载可读正文；正文只能是 13px。

### 3.3 阅读阶梯（4 档）

| token | 字号 | 行高 | 字重 | 用途 |
| --- | --- | --- | --- | --- |
| `--gm-fs-read` | 15px | 1.72 | 400 | Markdown 正文、笔记内容、纪要正文、对话内容 |
| `--gm-fs-read-h3` | 17px | 1.35 | 600 | Markdown `###`、正文内的分节标题 |
| `--gm-fs-read-h2` | 20px | 1.35 | 600 | Markdown `##` |
| `--gm-fs-read-h1` | 26px | 1.25 | 600 | Markdown `#`、纪要文档标题 |

阅读面里的代码块用 `--gm-font-ui` + 13px + 行高 1.6；行内代码同正文 15px，只换字族不加字号。

### 3.4 字重与字距

- 字重只有 `400`（`--gm-fw-regular`）和 `600`（`--gm-fw-strong`）两个值。禁止 500、550、650、700、800。
- 字距一律 `0`（`--gm-tracking`）。禁止负字距、禁止全大写英文标签、禁止 `letter-spacing` 出现在任何选择器里。
- 层级靠字号、颜色、位置三者区分，不靠字重叠加。同一行里最多出现一个 600。

### 3.5 中英文混排

- 拉丁字母与数字走 `--gm-font-ui` 的等宽字形，中文回落 PingFang SC，回落由字体栈自动完成。
- 禁止在字符串里手插空格来「平衡」中英文间距；间距由字体栈与 `0` 字距决定。
- 中文标点用全角（，。：；「」），英文与代码标点用半角，同一行不混用两套。
- 中文与拉丁之间不加空格；数字与单位之间加半角空格比，例如 `12 KB`、`3 天`。
- 路径、分支名、commit hash、CLI 命令、时间戳一律等宽且不换行截断：`white-space: nowrap` + `text-overflow: ellipsis`。

### 3.6 数字对齐

- 所有数字容器设 `font-variant-numeric: tabular-nums`。
- 表格与列表里的数值列右对齐；列宽固定，不随内容跳动。
- 统计大数字左对齐，与标签左边缘对齐，不用等宽居中对齐。
- 时间戳统一 `HH:MM`（当天）或 `MM-DD HH:MM`（跨天），两位补零，不显示秒。

### 3.7 行长

- 阅读面容器：`max-width: 66ch`。
- 说明文字与表单帮助文字：`max-width: 72ch`。
- 列表行标题单行截断，摘要最多两行（`-webkit-line-clamp: 2`）。
- 禁止整段文字居中；禁止为「好看」缩短到 40ch 以下造成频繁换行。

---

## 4 空间与形状

### 4.1 间距阶梯（8 档）

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-sp-1` | 2px | 图标与角的微调、徽标内边距 |
| `--gm-sp-2` | 4px | 标签与值的间距、同组按钮间距 |
| `--gm-sp-3` | 8px | 图标与文字、行内元素、工具栏簇 |
| `--gm-sp-4` | 12px | 行内边距、列表行水平内边距、紧凑卡片内边距 |
| `--gm-sp-5` | 16px | 卡片内边距、面板内边距、表单行间距 |
| `--gm-sp-6` | 24px | 页面左右留白、模块之间、阅读面内边距 |
| `--gm-sp-7` | 32px | 页面上下留白、大区块分隔、空态内边距 |
| `--gm-sp-8` | 48px | 单列整页布局的段落级分隔、设置页分组之间 |

只允许这 8 个值。禁止 6px、10px、14px、18px、20px、28px、40px、58px、80px。

### 4.2 圆角阶梯

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-r-0` | 0 | 分栏、页面区块、全宽行、贴边元素 |
| `--gm-r-1` | 2px | 徽标、代码块、键盘提示 |
| `--gm-r-2` | 4px | 按钮、输入框、卡片、列表选中块、菜单项 |
| `--gm-r-3` | 8px | 对话框、弹出菜单、悬浮层 |
| `--gm-r-pill` | 999px | 状态胶囊、圆点、开关 |

三层圆角同时出现在一个视图里即违规（例如页面区块 0 + 卡片 4 + 弹层 8 已满，不得再出现 2px 徽标以外的第四级）。徽标用 2px 不计入。

### 4.3 边框规则

用线：

- 分栏之间（1px `--gm-line`，纵向，通栏）
- 列表行之间（1px `--gm-line`，横向，从文字左边缘起，不贴容器边）
- 表头下沿（1px `--gm-line`）
- 输入框、开关、可选中的控件轮廓（1px `--gm-line-strong`）
- 焦点环（2px `--gm-focus-ring`，`outline-offset: 2px`）
- 选中行左侧标记（2px `--gm-accent`）

用留白：

- 模块之间：`--gm-sp-6`
- 卡片之间：`--gm-sp-5`
- 卡片内元素：`--gm-sp-4`
- 页面四边：左右 `--gm-sp-6`，上下 `--gm-sp-7`

禁止：1px 线宽之外的值（0.5px、1.5px、2px 仅限焦点环与选中标记）；同一个盒子同时有 border 和 box-shadow；双层边框（容器和子元素各画一圈）。

### 4.4 层高（最多两级）

| token | 值 | 用在哪 |
| --- | --- | --- |
| `--gm-shadow-1` | `0 4px 12px rgba(0, 0, 0, 0.28)` | 弹出菜单、下拉框、悬浮提示、拖拽预览 |
| `--gm-shadow-2` | `0 24px 60px rgba(0, 0, 0, 0.45)` | 对话框、命令面板 |

浅色主题对应值：`--gm-shadow-1: 0 4px 12px rgba(60, 52, 35, 0.14)`，`--gm-shadow-2: 0 24px 60px rgba(60, 52, 35, 0.22)`。

- 常驻面板与卡片默认 `box-shadow: none`，靠 `--gm-surface` 与 `--gm-line` 区分。
- 禁止第三级阴影、禁止内阴影、禁止发光（带颜色的 shadow）。

### 4.5 结构尺寸

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-w-sidebar` | 224px | 左侧主导航宽度 |
| `--gm-w-rail` | 18px | 侧栏收起后的竖条 |
| `--gm-w-pane-default` | 320px | 分栏列表默认宽度 |
| `--gm-w-pane-min` | 260px | 分栏列表最小宽度 |
| `--gm-w-pane-max` | 560px | 分栏列表最大宽度 |
| `--gm-w-detail-min` | 320px | 详情栏最小宽度 |
| `--gm-w-handle` | 1px | 分栏拖动线（热区 8px） |
| `--gm-h-page-header` | 52px | 页面头高度（固定，不用 min-height） |
| `--gm-h-pane-header` | 44px | 分栏头高度 |
| `--gm-h-row` | 40px | 列表行最小高度（`min-height`） |
| `--gm-h-row-comfort` | 44px | 触摸与移动端行最小高度 |
| `--gm-h-row-comfort` | 44px | 触摸与移动端行高度 |
| `--gm-h-control-sm` | 28px | 小按钮、图标按钮、紧凑输入 |
| `--gm-h-control` | 32px | 默认按钮、输入框 |
| `--gm-h-control-lg` | 36px | 主按钮、对话框动作按钮 |
| `--gm-w-content-max` | 720px | 单列整页布局的内容宽度上限 |
| `--gm-w-scrollbar` | 6px | 滚动条宽度 |

行高一律用 `min-height`，不用 `height`：列表行、导航项、卡片头都按内容自然长高，只有按钮、输入框、标签页这类必须等高的控件才使用固定 `height`。

### 4.6 图标

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-icon-xs` | 12px | 行内微图标、徽标内图标、关闭图标 |
| `--gm-icon-sm` | 14px | 列表行图标、菜单项图标、紧凑按钮图标 |
| `--gm-icon-md` | 16px | 工具栏图标、导航图标、按钮图标 |
| `--gm-icon-lg` | 20px | 面板头图标、设置项图标 |
| `--gm-icon-xl` | 24px | 空态图标、对话框头图标、步骤标记 |

图标库固定为项目已有的 `lucide-react`，`stroke-width` 固定 `1.5`。禁止混入其他图标包，禁止用 emoji 当图标。

---

## 5 动效

### 5.1 参数

| token | 值 | 用途 |
| --- | --- | --- |
| `--gm-dur-1` | 120ms | 状态变化：悬停、按下、选中、聚焦 |
| `--gm-dur-2` | 180ms | 结构变化：面板展开收起、弹层进出、Toast 进出 |
| `--gm-ease` | `cubic-bezier(0.2, 0, 0, 1)` | 唯一缓动曲线 |

只有这两个时长和这一条曲线。禁止 0.15s、0.2s、300ms、`ease`、`ease-in-out`、`linear`（加载旋转除外）、禁止自定义第四种曲线。

### 5.2 允许动的属性

| 属性 | 允许 | 时长 |
| --- | --- | --- |
| `background-color` | 是 | `--gm-dur-1` |
| `border-color` | 是 | `--gm-dur-1` |
| `color` | 是 | `--gm-dur-1` |
| `opacity` | 是（仅弹层与 Toast 进出） | `--gm-dur-2` |
| `transform` | 是（仅 `translateY(-2px)` 以内的弹层进出、`scale()` 0.98～1） | `--gm-dur-2` |
| 其他所有属性 | 否 | — |

禁止 `transition: all`；禁止过渡 `width`、`height`、`top`、`left`、`box-shadow`、`filter`；禁止位移超过 2px；禁止悬停放大；禁止列表逐项入场；禁止无限循环动画（唯一例外：加载旋转，`1s linear infinite`，用 `--gm-accent` 描边）。

### 5.3 减少动效

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* 加载指示器保留旋转，降为 2s 以减少频闪 */
  .gm-spinner {
    animation: gm-spin 2s linear infinite !important;
    animation-duration: 2s !important;
    animation-iteration-count: infinite !important;
  }
}
```

- 该块全局生效一次，写在 `index.css` 顶部，禁止组件内再写局部覆盖。
- 降级后仍然保留：焦点环立即出现、选中底色立即切换、Toast 直接出现与消失（不做淡入）。
- `.gm-spinner` 是全仓唯一的动画例外类名，其他任何类名不得写 `animation` 属性。

---

## 6 组件语汇

所有组件共用：`--gm-r-2` 圆角（除标注）、`--gm-font-ui` 字族、`transition: background-color var(--gm-dur-1) var(--gm-ease), border-color var(--gm-dur-1) var(--gm-ease), color var(--gm-dur-1) var(--gm-ease)`。

### 6.1 按钮

| 类型 | 高度 | 水平内边距 | 字号/字重 | 默认 | 悬停 | 按下 | 焦点 | 禁用 | 加载 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 主 | 32px | 12px | 13/600 | 底 `--gm-accent-fill`，字 `--gm-on-accent` | 底 `--gm-accent-fill-hover` | 底 `--gm-accent-fill-pressed`，无位移 | `2px --gm-focus-ring`，offset 2 | 底 `--gm-surface-raised`，字 `--gm-text-disabled` | 左侧 12px 旋转图标，文字保留，宽度不变 |
| 次 | 32px | 12px | 13/600 | 底透明，边 `--gm-line-strong`，字 `--gm-text` | 底 `--gm-hover` | 底 `--gm-hover`，边 `--gm-text-tertiary` | 同上 | 边 `--gm-line`，字 `--gm-text-disabled` | 同主 |
| 幽灵 | 32px | 8px | 13/600 | 无底无边，字 `--gm-text-secondary` | 底 `--gm-hover`，字 `--gm-text` | 底 `--gm-hover`，字 `--gm-text` | 同上 | 字 `--gm-text-disabled` | 同主 |
| 危险 | 32px | 12px | 13/600 | 底透明，边 `--gm-danger`，字 `--gm-danger` | 底 `--gm-danger-tint` | 底 `--gm-danger-tint`，边框与文字颜色不变 | 同上 | 边 `--gm-line`，字 `--gm-text-disabled` | 同主 |

- 图标按钮：方 28px / 32px 两档，图标 16px，内边距 0，圆角 `--gm-r-2`。
- 主按钮一屏最多一个；对话框里最多两个（取消 + 确认）。
- 按钮文字不加粗到 700，不做全大写，不在文字后加箭头字符。

### 6.2 输入框

| 项 | 值 |
| --- | --- |
| 高度 | 32px（单行）、`--gm-h-control-lg` 36px（对话框内） |
| 水平内边距 | 8px |
| 字号 | 13px / 400 |
| 底色 | `--gm-input-bg` |
| 边框 | 1px `--gm-line-strong` |
| 圆角 | `--gm-r-2` |
| 占位符 | `--gm-text-tertiary` |
| 悬停 | 边框 `--gm-text-tertiary` |
| 聚焦 | 边框 `--gm-focus-ring` + `2px` 焦点环，offset 0 |
| 禁用 | 底色 `--gm-surface`，字 `--gm-text-disabled`，边框 `--gm-line` |
| 错误 | 边框 `--gm-danger`，下方 11px `--gm-danger` 说明，高度增加 16px |

多行输入框（笔记、快捷记录）：内边距 12px，最小高度 96px，`resize: vertical`，其余同上。

### 6.3 列表行

| 项 | 值 |
| --- | --- |
| 高度 | `min-height: 40px`（`--gm-h-row`）；带摘要的行 `min-height: 56px`；触摸行 `min-height: 44px`（`--gm-h-row-comfort`）。禁止写 `height` |
| 垂直内边距 | 8px（`--gm-sp-3`），内容垂直居中 |
| 水平内边距 | 12px |
| 结构 | 图标 14px（`--gm-icon-sm`）+ 标题 + 右侧元信息，间距 8px |
| 标题 | 13px / 600 / `--gm-text`，单行截断 |
| 摘要 | 13px / 400 / `--gm-text-secondary`，最多两行 |
| 元信息 | 11px / 400 / `--gm-text-tertiary`，`tabular-nums`，右对齐 |
| 分隔 | 下边 1px `--gm-line`，从文字左边缘起 |
| 悬停 | 底 `--gm-hover` |
| 选中 | 底 `--gm-selected` + 左侧 2px `--gm-accent` |
| 焦点 | 2px `--gm-focus-ring` 内描边（`outline-offset: -2px`，避免被裁切） |
| 禁用 | 字 `--gm-text-disabled`，无悬停变化 |

列表行不放卡片、不放投影、不放大图标。

单行行：标题一行 + 元信息一行（同一行右侧），`min-height: 40px`。
带摘要行：标题一行 + 摘要最多两行，`min-height: 56px`，行高按内容自然长高，不得裁切。
禁止对列表行写 `height` / `max-height` / `overflow: hidden` 来固定行高；摘要的两行截断只能靠 `-webkit-line-clamp: 2` 实现。

### 6.4 卡片

| 项 | 值 |
| --- | --- |
| 底色 | `--gm-surface` |
| 边框 | 1px `--gm-line` |
| 圆角 | `--gm-r-2` |
| 内边距 | 16px |
| 阴影 | 无 |
| 标题 | 16px / 600 / `--gm-text`，与内容间距 12px |
| 卡片间距 | 16px（同一网格 gap） |
| 可点击卡片悬停 | 底 `--gm-surface-raised`，边框 `--gm-line-strong` |
| 选中卡片 | 边框 `--gm-accent`，不加底色 |

卡片只承载一个主题。一个卡片里出现两个同级标题即拆成两张。

### 6.5 导航

| 项 | 值 |
| --- | --- |
| 侧栏宽 | 224px，底色 `--gm-surface`，右侧 1px `--gm-line` |
| 导航项高度 | 32px |
| 导航项内边距 | 水平 8px |
| 导航项间距 | 4px（`--gm-sp-2`） |
| 结构 | 图标 16px + 文字 13px / 400 |
| 默认 | 字 `--gm-text-secondary`，图标 `--gm-text-tertiary` |
| 悬停 | 底 `--gm-hover`，字 `--gm-text` |
| 当前 | 底 `--gm-selected`，字 `--gm-text`，图标 `--gm-accent`，左侧 2px `--gm-accent` |
| 分组标题 | 11px / 600 / `--gm-text-tertiary`，上间距 16px |
| 移动端底栏 | 高 52px，底色 `--gm-surface`，上边 1px `--gm-line`，当前项图标与文字用 `--gm-accent` |

导航里不出现彩色图标、不出现徽标超出三项、不出现文字换行。

### 6.6 徽标

| 项 | 值 |
| --- | --- |
| 高度 | 18px |
| 内边距 | 水平 6px |
| 字号 | 11px / 600 |
| 圆角 | `--gm-r-1` |
| 中性 | 底 `--gm-surface-raised`，字 `--gm-text-secondary`，边 1px `--gm-line` |
| 蓝色 | 底 `--gm-accent-tint`，字 `--gm-accent` |
| 成功 | 底 `--gm-success-tint`，字 `--gm-success` |
| 警告 | 底 `--gm-warning-tint`，字 `--gm-warning` |
| 危险 | 底 `--gm-danger-tint`，字 `--gm-danger` |

一个视图里状态徽标最多两个。分类、来源、类型不得用徽标颜色区分，统一用中性徽标。

### 6.7 空态

| 项 | 值 |
| --- | --- |
| 布局 | 垂直居中，最大宽度 320px |
| 图标 | 24px（`--gm-icon-xl`），`--gm-text-tertiary` |
| 主标题 | 13px / 600 / `--gm-text`，上间距 16px |
| 说明 | 13px / 400 / `--gm-text-secondary`，上间距 4px，最多两行 |
| 动作 | 次按钮或幽灵按钮，上间距 16px |
| 内边距 | 32px |
| 最小高度 | 180px |

空态不放大图标、不加插画、不写感叹号。

### 6.8 标签页

| 项 | 值 |
| --- | --- |
| 高度 | 32px |
| 水平内边距 | 12px |
| 字号 | 13px / 600 |
| 默认 | 字 `--gm-text-secondary`，无底无边 |
| 悬停 | 字 `--gm-text`，底 `--gm-hover` |
| 当前 | 字 `--gm-text`，底 `--gm-selected`，下方 2px `--gm-accent` |
| 计数 | 11px / 400 / `--gm-text-tertiary`，与标签间距 4px |
| 焦点 | 2px `--gm-focus-ring`，offset -2px |
| 分隔 | 标签条整体下方 1px `--gm-line` |

标签页不做胶囊按钮，不做圆角容器包住整组。

---

## 7 迁移映射表

用法：按行替换，不需要判断。标「删除」的 token 在改造后不得出现；替换列给出替代它的具体写法。

### 7.1 字体与排版

| 旧 token | 新 |
| --- | --- |
| `--gm-font-mono` | `--gm-font-ui` |
| `--gm-font-sans` | `--gm-font-read` |
| `--gm-font-2xs`（11） | `--gm-fs-micro` |
| `--gm-font-xs`（12） | `--gm-fs-micro`（11）；可读文字改 `--gm-fs-ui` |
| `--gm-font-sm`（13） | `--gm-fs-ui` |
| `--gm-font-md`（15） | 界面用 `--gm-fs-ui-lg`（16）；阅读正文用 `--gm-fs-read`（15） |
| `--gm-font-lg`（17） | 面板/对话框标题 `--gm-fs-ui-lg`；Markdown `###` 用 `--gm-fs-read-h3` |
| `--gm-font-xl`（20） | 页标题 `--gm-fs-title`；Markdown `##` 用 `--gm-fs-read-h2` |
| `--gm-font-2xl`（24） | `--gm-fs-read-h1`（26）；统计大数字用 `--gm-fs-title`（20） |
| `--gm-leading-none` | 删除（图标与标记不设行高） |
| `--gm-leading-tight` | `--gm-lh-title`（1.25） |
| `--gm-leading-title` | `--gm-lh-title` |
| `--gm-leading-heading` | `--gm-lh-read-head`（1.35） |
| `--gm-leading-normal` | `--gm-lh-ui`（1.5） |
| `--gm-leading-relaxed` | `--gm-lh-read`（1.72） |
| `--gm-leading-reading` | `--gm-lh-read` |
| `--gm-leading-reading-mobile` | `--gm-lh-read`（移动端不再单独放大） |

### 7.2 间距

| 旧 token | 新 |
| --- | --- |
| `--gm-space-0`（0） | `--gm-sp-0` |
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
| `--gm-row-pad-y-comfort`（8） | 删除（用 `--gm-h-row-comfort`） |
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
| `--gm-control-height-xs`（28） | `--gm-h-control-sm` |
| `--gm-control-height-sm`（32） | `--gm-h-control` |
| `--gm-control-height-md`（34） | `--gm-h-control`（32） |
| `--gm-control-height-lg`（36） | `--gm-h-control-lg` |
| `--gm-control-height-xl`（38） | `--gm-h-control-lg`（36） |
| `--gm-pane-header-height`（50） | `--gm-h-pane-header`（44） |
| `--gm-page-header-title-font` | `--gm-fs-title` |
| `--gm-page-header-icon-size` | `--gm-icon-lg` |
| `--gm-pane-header-title-font` | `--gm-fs-ui-lg` |
| `--gm-pane-header-icon-size` | `--gm-icon-lg` |

### 7.4 图标

| 旧 token | 新 |
| --- | --- |
| `--gm-icon-dot`（8） | 删除（圆点用 6px 固定值 + `--gm-r-pill`） |
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
| `--gm-radius-xs`（2） | `--gm-r-1` |
| `--gm-radius-sm`（4） | `--gm-r-2` |
| `--gm-radius-md`（6） | `--gm-r-2`（4） |
| `--gm-radius-lg`（8） | `--gm-r-3` |
| `--gm-radius-pill`（999） | `--gm-r-pill` |

### 7.6 阴影与遮罩

| 旧 token | 新 |
| --- | --- |
| `--gm-shadow-card` | 删除（卡片不投影） |
| `--gm-shadow-popover` | `--gm-shadow-1` |
| `--gm-shadow-soft` | `--gm-shadow-1` |
| `--gm-shadow-modal` | `--gm-shadow-2` |
| `--gm-shadow-bottom` | `--gm-shadow-1` |
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
| `--gm-color-text-inverse` | `--gm-on-accent` |
| `--gm-color-border-subtle` | `--gm-line` |
| `--gm-color-border-strong` | `--gm-line-strong` |
| `--gm-color-brand` | `--gm-accent` |
| `--gm-color-brand-hover` | `--gm-accent-hover` |
| `--gm-color-success` | `--gm-success` |
| `--gm-color-warning` | `--gm-warning` |
| `--gm-color-danger` | `--gm-danger` |
| `--gm-color-purple` | 删除（无第七语义色） |
| `--gm-color-pink` | 删除 |
| `--gm-color-on-accent` | `--gm-on-accent` |
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
| `--gm-size-layout-toggle`（22） | `--gm-h-control-sm`（28） |
| `--gm-settings-row-icon-gap` | `--gm-sp-4` |
| `--gm-size-settings-row-icon-offset` | 删除（图标列宽用 `--gm-sp-7`） |
| `--gm-size-spinner-sm`（16） | `--gm-icon-md` |
| `--gm-size-kbd-min-width`（18） | 删除（键盘提示用 `--gm-r-1` + 4px 内边距） |
| `--gm-size-status-pill-min-height`（26） | 删除（状态胶囊固定 18px） |
| `--gm-size-empty-state-min-height`（180） | 空态最小高度 180px 固定值 |
| `--gm-size-find-input-min-height`（30） | `--gm-h-control`（32） |
| `--gm-size-mobile-row-min-height`（44） | `--gm-h-row-comfort` |
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
| `--gm-size-floating-toast-width`（440） | 删除（Toast 宽 320px，`--gm-r-3`） |
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

响度排序用三个词：**最响 / 次之 / 最弱**。判定标准是纯灰化之后仍然成立的视觉权重，不看颜色。

### 8.1 仪表盘

结构（从上到下，视觉顺序即读顺序）：

1. 页面头：高 `--gm-h-page-header` 52px，左右留白 `--gm-sp-6`。标题 `--gm-fs-title`（20/600）左对齐，右侧放一个次按钮（刷新）与一个幽灵图标按钮（更多）。头下 1px `--gm-line`，通栏。
2. 状态带：一行三格，宽 `--gm-w-content-max`（720px），格间距 `--gm-sp-5`。每格：标签 11/600 `--gm-text-tertiary` 在上，值 20/600 `--gm-text` 在下，行高 1.25，数字 `tabular-nums`。无边框、无底色、无图标；三格之间只留白。
3. 最近条目列表：垂直列表，行高 `--gm-h-row` 40px，行内结构 图标 14px + 标题 13/600 + 时间 11/400 右对齐。行间 1px `--gm-line`。列表头上方留 `--gm-sp-7`。
4. 页底留 `--gm-sp-7`。

响度：**最响** = 页面标题（20/600 + 独占一行）；**次之** = 状态带三个 20px 数值（面积小但字号与标题同级，形成第二层）；**最弱** = 最近条目的标题与时间。

禁止：卡片墙、统计卡彩色竖条、分类彩色图标、卡片投影、图标配彩色底、把「最近条目」做成浮起的卡片。

### 8.2 笔记

结构（左右分栏）：

1. 左栏：宽 `--gm-w-pane-default` 320px，底色 `--gm-surface`，右侧 1px `--gm-line`。栏头 44px，标题 16/600，右侧一个次按钮（新建）。
2. 栏头下是输入区：不用卡片，直接置于列表上方，左右内边距 `--gm-sp-4`，标题输入框与正文输入框同字号 13/400，底色 `--gm-input-bg`，边框 1px `--gm-line-strong`，聚焦时边框变 `--gm-focus-ring`。输入区下沿 1px `--gm-line`。
3. 列表：行高 40px，标题 13/600 `--gm-text`，摘要 13/400 `--gm-text-secondary` 单行截断，时间 11/400 `--gm-text-tertiary`。行间 1px `--gm-line`。选中行底 `--gm-selected` + 左侧 2px `--gm-accent`。
4. 右栏：阅读面，用 `--gm-font-read` 15/400，行高 1.72，内边距 `--gm-sp-6`，内容最大宽 `66ch`。顶部工具栏 44px，标题 16/600，动作按「刷新 → 收藏 → 编辑 → 更多」排列，图标 16px。

响度：**最响** = 右栏正文首个标题（界面里唯一的 17px 以上阅读字重）；**次之** = 左栏当前选中行的标题（13/600 + `--gm-selected` 底）；**最弱** = 左栏时间戳与右栏页脚的元信息（11/400）。

禁止：输入区做成带投影的独立卡片、左右两栏各自再包一层卡、选中行加缩放或加阴影、正文用等宽字体。

### 8.3 搜索

结构（单列结果流，或分栏时结果在左）：

1. 搜索框：高 32px，宽占满内容列，底色 `--gm-input-bg`，左侧 14px 放大镜图标 `--gm-text-tertiary`，占位符 13/400 `--gm-text-tertiary`，右侧显示当前范围的 11px 中性徽标。
2. 结果计数：一行 11/400 `--gm-text-tertiary`，与搜索框间距 `--gm-sp-5`，写作「12 条结果 · 0.04 s」，数字 `tabular-nums`。
3. 结果列表：每条的标题 13/600 `--gm-text`，摘要 13/400 `--gm-text-secondary` 最多两行，时间 11/400 `--gm-text-tertiary` 右对齐。行内边距 12px，行间 1px `--gm-line`。整条结果无底色、无边框、无投影。
4. 命中关键词用 `--gm-text` + 600 加重，不加底纹、不改颜色。
5. Enter 打开当前项，↑/↓ 移动，当前项 `--gm-selected` 底 + 左侧 2px `--gm-accent`。

响度：**最响** = 搜索框内的输入文字（13/400 但位于唯一的高对比输入底上）；**次之** = 结果标题（13/600）；**最弱** = 结果摘要与时间。

禁止：每条结果做成浮起卡片、结果计数用徽标、命中词用高亮黄底、结果列表加分组标题。

---

## 附录 A：与 V1 及旧规范的关键差异

| 项 | 旧 | V2 |
| --- | --- | --- |
| 字号档位 | 11/12/13/15/17/20/24 七档混用 | 界面四档 11/13/16/20，阅读四档 15/17/20/26，两套分离 |
| 字重 | 12 个值 | 2 个值（400/600） |
| 字距 | 个别位置非 0 | 恒为 0 |
| 分类色 | 奥运五色 + 5 个 category 色 + 5 个 provider 色 | 全部删除，分类单色 |
| 阴影 | 11 个 | 2 个，卡片 0 |
| 圆角 | 6 档含 6px | 4 档（0/2/4/8）+ 胶囊 |
| 间距 | 8 档 + 6px/10px/14px/20px/28px 字面量 | 8 档（2/4/8/12/16/24/32/48） |
| 行高 | 行高与内边距双重控制 | 固定行高 + 无垂直内边距 |
| 动效 | 无 token，3 种时长 | 2 个时长 + 1 条曲线，全局降级 |
| 阅读面 | 与界面共用字号阶梯 | 独立阶梯 + 66ch 行长 |

---

## 附录 B：完整 token 清单（可直接粘贴）

本节是全文 token 的唯一取值来源。前文出现但本节未列的 token 名，视为文档错误。

```css
:root,
[data-theme="dark"] {
  color-scheme: dark;

  /* 结构色 */
  --gm-canvas: #14130F;
  --gm-surface: #1B1A15;
  --gm-surface-raised: #24221B;
  --gm-input-bg: #100F0C;
  --gm-hover: #232119;
  --gm-selected: #222A3F;
  --gm-line: #302E26;
  --gm-line-strong: #6A6857;
  --gm-scrim: rgba(0, 0, 0, 0.60);

  /* 文字 */
  --gm-text: #F2EFE6;
  --gm-text-secondary: #C0BAAB;
  --gm-text-tertiary: #9C9686;
  --gm-text-disabled: #5E5A4C;
  --gm-on-accent: #FFFFFF;

  /* 强调 */
  --gm-accent: #7C9CFF;
  --gm-accent-hover: #96B0FF;
  --gm-accent-fill: #3560DE;
  --gm-accent-fill-hover: #3E6BF0;
  --gm-accent-fill-pressed: #2C51C4;
  --gm-accent-tint: #1E2438;
  --gm-focus-ring: #7C9CFF;

  /* 状态 */
  --gm-success: #5BC98A;
  --gm-success-tint: #17291F;
  --gm-warning: #E3AD55;
  --gm-warning-tint: #2A2118;
  --gm-danger: #F2806F;
  --gm-danger-tint: #2C1A17;

  /* 字体 */
  --gm-font-ui: "JetBrains Mono", ui-monospace, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace;
  --gm-font-read: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  /* 字号 */
  --gm-fs-micro: 11px;
  --gm-fs-ui: 13px;
  --gm-fs-ui-lg: 16px;
  --gm-fs-title: 20px;
  --gm-fs-read: 15px;
  --gm-fs-read-h3: 17px;
  --gm-fs-read-h2: 20px;
  --gm-fs-read-h1: 26px;

  /* 行高与字重 */
  --gm-lh-micro: 1.45;
  --gm-lh-ui: 1.5;
  --gm-lh-ui-lg: 1.4;
  --gm-lh-title: 1.25;
  --gm-lh-read: 1.72;
  --gm-lh-read-head: 1.35;
  --gm-fw-regular: 400;
  --gm-fw-strong: 600;
  --gm-tracking: 0;

  /* 间距 */
  --gm-sp-0: 0;
  --gm-sp-1: 2px;
  --gm-sp-2: 4px;
  --gm-sp-3: 8px;
  --gm-sp-4: 12px;
  --gm-sp-5: 16px;
  --gm-sp-6: 24px;
  --gm-sp-7: 32px;
  --gm-sp-8: 48px;

  /* 圆角 */
  --gm-r-0: 0;
  --gm-r-1: 2px;
  --gm-r-2: 4px;
  --gm-r-3: 8px;
  --gm-r-pill: 999px;

  /* 层高 */
  --gm-shadow-1: 0 4px 12px rgba(0, 0, 0, 0.28);
  --gm-shadow-2: 0 24px 60px rgba(0, 0, 0, 0.45);

  /* 动效 */
  --gm-dur-1: 120ms;
  --gm-dur-2: 180ms;
  --gm-ease: cubic-bezier(0.2, 0, 0, 1);

  /* 图标 */
  --gm-icon-xs: 12px;
  --gm-icon-sm: 14px;
  --gm-icon-md: 16px;
  --gm-icon-lg: 20px;
  --gm-icon-xl: 24px;

  /* 结构尺寸 */
  --gm-w-sidebar: 224px;
  --gm-w-rail: 18px;
  --gm-w-pane-default: 320px;
  --gm-w-pane-min: 260px;
  --gm-w-pane-max: 560px;
  --gm-w-detail-min: 320px;
  --gm-w-handle: 1px;
  --gm-w-content-max: 720px;
  --gm-w-scrollbar: 6px;
  --gm-h-page-header: 52px;
  --gm-h-pane-header: 44px;
  --gm-h-row: 40px;
  --gm-h-row-comfort: 44px;
  --gm-h-control-sm: 28px;
  --gm-h-control: 32px;
  --gm-h-control-lg: 36px;

  /* 层级 */
  --gm-z-sticky: 10;
  --gm-z-nav: 30;
  --gm-z-overlay: 50;
}

[data-theme="light"] {
  color-scheme: light;

  --gm-canvas: #F4F1E9;
  --gm-surface: #FBF9F3;
  --gm-surface-raised: #FFFFFF;
  --gm-input-bg: #EFEBE1;
  --gm-hover: #EAE6DA;
  --gm-selected: #E7EDFB;
  --gm-line: #DAD4C7;
  --gm-line-strong: #8A8879;
  --gm-scrim: rgba(20, 19, 15, 0.48);

  --gm-text: #191813;
  --gm-text-secondary: #4F4C43;
  --gm-text-tertiary: #6A6659;
  --gm-text-disabled: #A5A091;
  --gm-on-accent: #FFFFFF;

  --gm-accent: #2A52C4;
  --gm-accent-hover: #1F41A0;
  --gm-accent-fill: #2F5AD0;
  --gm-accent-fill-hover: #2749B0;
  --gm-accent-fill-pressed: #1F3C93;
  --gm-accent-tint: #E9EEFC;
  --gm-focus-ring: #2A52C4;

  --gm-success: #147349;
  --gm-success-tint: #E4F1E9;
  --gm-warning: #8A5A12;
  --gm-warning-tint: #F6EBDC;
  --gm-danger: #B3342B;
  --gm-danger-tint: #F7E4E1;

  --gm-shadow-1: 0 4px 12px rgba(60, 52, 35, 0.14);
  --gm-shadow-2: 0 24px 60px rgba(60, 52, 35, 0.22);
}
```
