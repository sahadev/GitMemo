# 旧 token → 新 token 迁移清单（239 条）

生成依据：`desktop/src/index.css` 当前工作区状态 + `docs/design/DESIGN-V2.md` §7 映射表。
口径冻结期间只作核对依据，不据此执行替换；本文不修改任何样式。

判定含义：
- **纯改名**：新 token 数值与旧值一致，只换名字。
- **值变**：新 token 数值不同，替换后视觉会变（间距、圆角、高度、字号）。
- **需判断**：一个旧 token 对应两个新 token，须按用途逐条选。
- **需重写**：替代写法是改结构（行高固定、布局合并、图形换实现）。
- **转固定值**：删除 token 改写字面值，风险低但落点分散。
- **无对应**：映射表没有，需人工定性。

| 判定 | 条数 | 引用数 |
| --- | --- | --- |
| 纯改名 | 133 | 1612 |
| 值变 | 19 | 153 |
| 需判断 | 5 | 120 |
| 需重写 | 13 | 30 |
| 转固定值 | 65 | 124 |
| 无对应 | 4 | 8 |
| **合计** | **239** | **2047** |

## 清单

| # | 旧 token | 引用数 | 新 token / 替代写法 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `--gm-list-row-pad-y` | 7 | 行固定 40px 高 | 需重写 |
| 2 | `--gm-mobile-bottom-content-padding` | 7 | 随上一条合并 | 需重写 |
| 3 | `--gm-leading-none` | 2 | 图标与标记不设行高 | 需重写 |
| 4 | `--gm-offset-menu-popover-top` | 2 | 弹层位置由定位计算 | 需重写 |
| 5 | `--gm-row-pad-y` | 2 | 行用固定高度 --gm-h-row | 需重写 |
| 6 | `--gm-size-code-editor-min-height` | 2 | 编辑器占满父容器 | 需重写 |
| 7 | `--gm-size-settings-row-icon-offset` | 2 | 图标列宽用 --gm-sp-7 | 需重写 |
| 8 | `--gm-provider-github` | 1 | 托管商用单色图标 + 文字 | 需重写 |
| 9 | `--gm-size-dashboard-quick-note-min-height` | 1 | 笔记输入占满栏宽 | 需重写 |
| 10 | `--gm-size-settings-input-branch` | 1 | 输入框占满列宽 | 需重写 |
| 11 | `--gm-size-setup-sidebar-width` | 1 | 设置页改单列，宽 --gm-w-content-max | 需重写 |
| 12 | `--gm-size-split-handle-hover-width` | 1 | 热区 8px 字面量 | 需重写 |
| 13 | `--gm-sync-shimmer-bg` | 1 | 同步中用旋转图标，不用渐变 | 需重写 |
| 14 | `--gm-font-xs` | 94 | --gm-fs-micro（11）；可读文字改 --gm-fs-ui | 需判断 |
| 15 | `--gm-font-md` | 9 | 界面用 --gm-fs-ui-lg（16）；阅读正文用 --gm-fs-read（15） | 需判断 |
| 16 | `--gm-font-xl` | 8 | 页标题 --gm-fs-title；Markdown ## 用 --gm-fs-read-h2 | 需判断 |
| 17 | `--gm-font-lg` | 7 | 面板/对话框标题 --gm-fs-ui-lg；Markdown ### 用 --gm-fs-read-h3 | 需判断 |
| 18 | `--gm-font-2xl` | 2 | --gm-fs-read-h1（26）；统计大数字用 --gm-fs-title（20） | 需判断 |
| 19 | `--gm-radius-md` | 54 | --gm-r-2（4） | 值变 |
| 20 | `--gm-section-gap` | 23 | --gm-sp-6（24） | 值变 |
| 21 | `--gm-section-gap-lg` | 17 | --gm-sp-7（32） | 值变 |
| 22 | `--gm-control-height-xl` | 11 | --gm-h-control-lg（36） | 值变 |
| 23 | `--gm-leading-tight` | 11 | --gm-lh-title（1.25） | 值变 |
| 24 | `--gm-leading-relaxed` | 10 | --gm-lh-read（1.72） | 值变 |
| 25 | `--gm-control-height-md` | 4 | --gm-h-control（32） | 值变 |
| 26 | `--gm-icon-empty-lg` | 3 | --gm-icon-xl（24） | 值变 |
| 27 | `--gm-icon-result` | 3 | --gm-icon-xl（24） | 值变 |
| 28 | `--gm-page-pad-y` | 3 | --gm-sp-5（16） | 值变 |
| 29 | `--gm-pane-header-height` | 2 | --gm-h-pane-header（44） | 值变 |
| 30 | `--gm-size-layout-toggle` | 2 | --gm-h-control-sm（28） | 值变 |
| 31 | `--gm-size-quick-paste-result-icon` | 2 | --gm-icon-xl（24） | 值变 |
| 32 | `--gm-size-split-collapsed-rail-width` | 2 | --gm-w-rail（18） | 值变 |
| 33 | `--gm-size-split-handle-width` | 2 | --gm-w-handle（1，热区 8） | 值变 |
| 34 | `--gm-icon-empty` | 1 | --gm-icon-xl（24） | 值变 |
| 35 | `--gm-icon-md` | 1 | --gm-icon-md（16） | 值变 |
| 36 | `--gm-leading-heading` | 1 | --gm-lh-read-head（1.35） | 值变 |
| 37 | `--gm-size-find-input-min-height` | 1 | --gm-h-control（32） | 值变 |
| 38 | `--gm-control-pad-y` | 11 | 控件用固定高度 | 转固定值 |
| 39 | `--gm-icon-hero` | 9 | （直接去掉） | 转固定值 |
| 40 | `--gm-control-pad-y-lg` | 7 | （直接去掉） | 转固定值 |
| 41 | `--gm-size-card-rail` | 7 | 卡片不带色条 | 转固定值 |
| 42 | `--gm-row-pad-y-comfort` | 6 | 用 --gm-h-row-comfort | 转固定值 |
| 43 | `--gm-icon-dot` | 5 | 圆点用 6px 固定值 + --gm-r-pill | 转固定值 |
| 44 | `--gm-list-header-pad-y` | 4 | 分栏头固定 44px 高 | 转固定值 |
| 45 | `--gm-category-blue` | 3 | 图表最多两色：--gm-accent + --gm-text-tertiary | 转固定值 |
| 46 | `--gm-mobile-fixed-bar-bottom` | 3 | （直接去掉） | 转固定值 |
| 47 | `--gm-size-divider` | 3 | 边框统一 1px 字面量 | 转固定值 |
| 48 | `--gm-size-menu-popover-min-width` | 3 | 弹层最小宽 200px 字面量 | 转固定值 |
| 49 | `--gm-category-green` | 2 | （直接去掉） | 转固定值 |
| 50 | `--gm-category-yellow` | 2 | （直接去掉） | 转固定值 |
| 51 | `--gm-color-pink` | 2 | （直接去掉） | 转固定值 |
| 52 | `--gm-color-purple` | 2 | 无第七语义色 | 转固定值 |
| 53 | `--gm-shadow-control-strong` | 2 | （直接去掉） | 转固定值 |
| 54 | `--gm-size-settings-copy-md` | 2 | （直接去掉） | 转固定值 |
| 55 | `--gm-size-settings-log-max-height` | 2 | 日志最大高度 40vh | 转固定值 |
| 56 | `--gm-size-settings-progress-width` | 2 | （直接去掉） | 转固定值 |
| 57 | `--gm-size-setup-logo-box` | 2 | （直接去掉） | 转固定值 |
| 58 | `--gm-blur-modal` | 1 | 不做背景模糊 | 转固定值 |
| 59 | `--gm-category-gray` | 1 | （直接去掉） | 转固定值 |
| 60 | `--gm-category-teal` | 1 | （直接去掉） | 转固定值 |
| 61 | `--gm-mobile-bottom-selection-padding` | 1 | （直接去掉） | 转固定值 |
| 62 | `--gm-mobile-dashboard-bottom-padding` | 1 | （直接去掉） | 转固定值 |
| 63 | `--gm-nav-item-pad-y` | 1 | 导航项固定 32px 高 | 转固定值 |
| 64 | `--gm-offset-split-handle-hover` | 1 | （直接去掉） | 转固定值 |
| 65 | `--gm-olympic-black` | 1 | （直接去掉） | 转固定值 |
| 66 | `--gm-olympic-blue` | 1 | 分类不再用色 | 转固定值 |
| 67 | `--gm-olympic-green` | 1 | （直接去掉） | 转固定值 |
| 68 | `--gm-olympic-red` | 1 | （直接去掉） | 转固定值 |
| 69 | `--gm-olympic-yellow` | 1 | （直接去掉） | 转固定值 |
| 70 | `--gm-overlay-soft` | 1 | （直接去掉） | 转固定值 |
| 71 | `--gm-provider-bitbucket` | 1 | （直接去掉） | 转固定值 |
| 72 | `--gm-provider-gitee` | 1 | （直接去掉） | 转固定值 |
| 73 | `--gm-provider-gitlab` | 1 | （直接去掉） | 转固定值 |
| 74 | `--gm-provider-other` | 1 | （直接去掉） | 转固定值 |
| 75 | `--gm-shadow-bottom-soft` | 1 | （直接去掉） | 转固定值 |
| 76 | `--gm-shadow-control` | 1 | （直接去掉） | 转固定值 |
| 77 | `--gm-shadow-danger-ring` | 1 | 用 2px --gm-focus-ring | 转固定值 |
| 78 | `--gm-shadow-inset-top` | 1 | （直接去掉） | 转固定值 |
| 79 | `--gm-size-dashboard-quick-note-actions-width` | 1 | （直接去掉） | 转固定值 |
| 80 | `--gm-size-drop-result-list-max-height` | 1 | 列表最大高度 40vh | 转固定值 |
| 81 | `--gm-size-error-log-max-height` | 1 | 日志最大高度 40vh | 转固定值 |
| 82 | `--gm-size-floating-toast-width` | 1 | Toast 宽 320px，--gm-r-3 | 转固定值 |
| 83 | `--gm-size-kbd-min-width` | 1 | 键盘提示用 --gm-r-1 + 4px 内边距 | 转固定值 |
| 84 | `--gm-size-mobile-bottom-content-offset` | 1 | 改用 52px + env(safe-area-inset-bottom) | 转固定值 |
| 85 | `--gm-size-mobile-dashboard-bottom-offset` | 1 | 同上 | 转固定值 |
| 86 | `--gm-size-mobile-selection-bottom-offset` | 1 | 同上 | 转固定值 |
| 87 | `--gm-size-quick-paste-list-max-height` | 1 | 列表最大高度 40vh | 转固定值 |
| 88 | `--gm-size-settings-copy-lg` | 1 | （直接去掉） | 转固定值 |
| 89 | `--gm-size-settings-copy-sm` | 1 | （直接去掉） | 转固定值 |
| 90 | `--gm-size-settings-input-proxy` | 1 | （直接去掉） | 转固定值 |
| 91 | `--gm-size-settings-input-remote` | 1 | （直接去掉） | 转固定值 |
| 92 | `--gm-size-settings-modal-inline` | 1 | （直接去掉） | 转固定值 |
| 93 | `--gm-size-settings-modal-max-height-lg` | 1 | （直接去掉） | 转固定值 |
| 94 | `--gm-size-settings-modal-max-height-md` | 1 | 对话框最大高 80vh | 转固定值 |
| 95 | `--gm-size-settings-range-width` | 1 | （直接去掉） | 转固定值 |
| 96 | `--gm-size-setup-candidate-list-max-height` | 1 | 列表最大高度 40vh | 转固定值 |
| 97 | `--gm-size-setup-nav-back-min-width` | 1 | 用次按钮规格 | 转固定值 |
| 98 | `--gm-size-setup-nav-back-min-width-mobile` | 1 | （直接去掉） | 转固定值 |
| 99 | `--gm-size-setup-sidebar-width-done` | 1 | （直接去掉） | 转固定值 |
| 100 | `--gm-size-status-pill-min-height` | 1 | 状态胶囊固定 18px | 转固定值 |
| 101 | `--pink` | 1 | （直接去掉） | 转固定值 |
| 102 | `--purple` | 1 | （直接去掉） | 转固定值 |
| 103 | `--gm-find-bar-app-left` | 2 | — | 无对应 |
| 104 | `--gm-find-bar-left` | 2 | — | 无对应 |
| 105 | `--gm-icon-render-size` | 2 | — | 无对应 |
| 106 | `--gm-split-pane-left-width` | 2 | — | 无对应 |
| 107 | `--text-secondary` | 108 | --gm-text-secondary | 纯改名 |
| 108 | `--border` | 107 | --gm-line | 纯改名 |
| 109 | `--accent` | 105 | --gm-accent | 纯改名 |
| 110 | `--gm-space-3` | 102 | --gm-sp-3 | 纯改名 |
| 111 | `--gm-space-4` | 84 | --gm-sp-4 | 纯改名 |
| 112 | `--text` | 76 | --gm-text | 纯改名 |
| 113 | `--gm-space-2` | 71 | --gm-sp-2 | 纯改名 |
| 114 | `--gm-space-5` | 61 | --gm-sp-5 | 纯改名 |
| 115 | `--gm-font-sm` | 53 | --gm-fs-ui | 纯改名 |
| 116 | `--gm-card-header-gap` | 42 | --gm-sp-4 | 纯改名 |
| 117 | `--gm-icon-text-gap` | 36 | --gm-sp-3 | 纯改名 |
| 118 | `--bg-hover` | 35 | --gm-hover | 纯改名 |
| 119 | `--red` | 28 | --gm-danger | 纯改名 |
| 120 | `--gm-leading-normal` | 26 | --gm-lh-ui（1.5） | 纯改名 |
| 121 | `--green` | 26 | --gm-success | 纯改名 |
| 122 | `--bg` | 25 | --gm-canvas | 纯改名 |
| 123 | `--bg-card` | 23 | --gm-surface | 纯改名 |
| 124 | `--gm-space-1` | 23 | --gm-sp-1 | 纯改名 |
| 125 | `--gm-color-bg-surface` | 22 | --gm-surface | 纯改名 |
| 126 | `--gm-control-gap` | 19 | --gm-sp-2 | 纯改名 |
| 127 | `--gm-nav-item-gap` | 19 | --gm-sp-3 | 纯改名 |
| 128 | `--gm-font-2xs` | 18 | --gm-fs-micro | 纯改名 |
| 129 | `--gm-radius-lg` | 18 | --gm-r-3 | 纯改名 |
| 130 | `--gm-space-6` | 18 | --gm-sp-6 | 纯改名 |
| 131 | `--gm-color-text-muted` | 17 | --gm-text-tertiary | 纯改名 |
| 132 | `--gm-font-mono` | 16 | --gm-font-ui | 纯改名 |
| 133 | `--gm-color-bg-elevated` | 15 | --gm-surface-raised | 纯改名 |
| 134 | `--gm-control-height-lg` | 15 | --gm-h-control-lg | 纯改名 |
| 135 | `--gm-control-height-sm` | 14 | --gm-h-control | 纯改名 |
| 136 | `--gm-list-row-pad-x` | 14 | --gm-sp-4 | 纯改名 |
| 137 | `--gm-card-pad-mobile` | 13 | --gm-sp-4 | 纯改名 |
| 138 | `--gm-radius-pill` | 12 | --gm-r-pill | 纯改名 |
| 139 | `--gm-color-bg-page` | 10 | --gm-canvas | 纯改名 |
| 140 | `--gm-color-bg-selected` | 10 | --gm-selected | 纯改名 |
| 141 | `--gm-color-on-accent` | 10 | --gm-on-accent | 纯改名 |
| 142 | `--gm-control-height-xs` | 10 | --gm-h-control-sm | 纯改名 |
| 143 | `--gm-accent-border` | 9 | --gm-accent（作描边） | 纯改名 |
| 144 | `--gm-card-pad-y` | 9 | --gm-sp-5 | 纯改名 |
| 145 | `--gm-leading-title` | 9 | --gm-lh-title | 纯改名 |
| 146 | `--gm-radius-sm` | 9 | --gm-r-2 | 纯改名 |
| 147 | `--gm-row-pad-x` | 9 | --gm-sp-3 | 纯改名 |
| 148 | `--gm-card-content-gap` | 8 | --gm-sp-4 | 纯改名 |
| 149 | `--gm-card-pad-x` | 8 | --gm-sp-5 | 纯改名 |
| 150 | `--gm-color-bg-inset` | 8 | --gm-input-bg | 纯改名 |
| 151 | `--gm-color-border-subtle` | 8 | --gm-line | 纯改名 |
| 152 | `--gm-control-pad-x-lg` | 8 | --gm-sp-4 | 纯改名 |
| 153 | `--gm-page-pad-x` | 8 | --gm-sp-6 | 纯改名 |
| 154 | `--yellow` | 8 | --gm-warning | 纯改名 |
| 155 | `--gm-list-header-pad-x` | 7 | --gm-sp-4 | 纯改名 |
| 156 | `--gm-radius-xs` | 6 | --gm-r-1 | 纯改名 |
| 157 | `--gm-toolbar-gap` | 6 | --gm-sp-3 | 纯改名 |
| 158 | `--gm-color-danger` | 5 | --gm-danger | 纯改名 |
| 159 | `--gm-color-text-primary` | 5 | --gm-text | 纯改名 |
| 160 | `--gm-icon-lg` | 5 | --gm-icon-lg | 纯改名 |
| 161 | `--gm-icon-xl` | 5 | --gm-icon-xl | 纯改名 |
| 162 | `--gm-size-mobile-bottom-nav-height` | 5 | 移动底栏 52px 固定值 | 纯改名 |
| 163 | `--gm-space-7` | 5 | --gm-sp-7 | 纯改名 |
| 164 | `--gm-z-overlay` | 5 | --gm-z-overlay（50） | 纯改名 |
| 165 | `--accent-hover` | 4 | --gm-accent-hover | 纯改名 |
| 166 | `--bg-success` | 4 | --gm-success-tint | 纯改名 |
| 167 | `--gm-color-bg-hover` | 4 | --gm-hover | 纯改名 |
| 168 | `--gm-color-success` | 4 | --gm-success | 纯改名 |
| 169 | `--gm-color-text-secondary` | 4 | --gm-text-secondary | 纯改名 |
| 170 | `--gm-color-warning` | 4 | --gm-warning | 纯改名 |
| 171 | `--gm-control-pad-x` | 4 | --gm-sp-3 | 纯改名 |
| 172 | `--gm-detail-pad-x` | 4 | --gm-sp-6 | 纯改名 |
| 173 | `--gm-font-sans` | 4 | --gm-font-read | 纯改名 |
| 174 | `--gm-shadow-modal` | 4 | --gm-shadow-2 | 纯改名 |
| 175 | `--gm-danger-soft` | 3 | --gm-danger-tint | 纯改名 |
| 176 | `--gm-detail-pad-mobile-x` | 3 | --gm-sp-4 | 纯改名 |
| 177 | `--gm-detail-pad-y` | 3 | --gm-sp-5 | 纯改名 |
| 178 | `--gm-icon-sm` | 3 | --gm-icon-md | 纯改名 |
| 179 | `--gm-leading-reading` | 3 | --gm-lh-read | 纯改名 |
| 180 | `--gm-page-pad-bottom` | 3 | --gm-sp-7 | 纯改名 |
| 181 | `--gm-page-pad-mobile-x` | 3 | --gm-sp-4 | 纯改名 |
| 182 | `--gm-page-pad-mobile-y` | 3 | --gm-sp-4 | 纯改名 |
| 183 | `--gm-settings-row-icon-gap` | 3 | --gm-sp-4 | 纯改名 |
| 184 | `--gm-size-setup-step-index` | 3 | --gm-icon-xl | 纯改名 |
| 185 | `--gm-size-sidebar-width` | 3 | --gm-w-sidebar | 纯改名 |
| 186 | `--gm-size-switch-padding` | 3 | 开关内边距 2px 固定值 | 纯改名 |
| 187 | `--gm-size-switch-thumb` | 3 | 开关滑块 16px 固定值 | 纯改名 |
| 188 | `--gm-success-border` | 3 | --gm-success | 纯改名 |
| 189 | `--gm-warning-border` | 3 | --gm-warning | 纯改名 |
| 190 | `--bg-danger` | 2 | --gm-danger-tint | 纯改名 |
| 191 | `--bg-input` | 2 | --gm-input-bg | 纯改名 |
| 192 | `--gm-accent-soft` | 2 | --gm-accent-tint | 纯改名 |
| 193 | `--gm-color-bg-canvas` | 2 | --gm-canvas | 纯改名 |
| 194 | `--gm-color-border-strong` | 2 | --gm-line-strong | 纯改名 |
| 195 | `--gm-color-brand` | 2 | --gm-accent | 纯改名 |
| 196 | `--gm-color-brand-hover` | 2 | --gm-accent-hover | 纯改名 |
| 197 | `--gm-danger-border` | 2 | --gm-danger | 纯改名 |
| 198 | `--gm-nav-stack-gap` | 2 | --gm-sp-2 | 纯改名 |
| 199 | `--gm-offset-floating-toast` | 2 | --gm-sp-6 | 纯改名 |
| 200 | `--gm-page-header-icon-size` | 2 | --gm-icon-lg | 纯改名 |
| 201 | `--gm-pane-header-icon-size` | 2 | --gm-icon-lg | 纯改名 |
| 202 | `--gm-row-gap` | 2 | --gm-sp-3 | 纯改名 |
| 203 | `--gm-shadow-bottom` | 2 | --gm-shadow-1 | 纯改名 |
| 204 | `--gm-shadow-popover` | 2 | --gm-shadow-1 | 纯改名 |
| 205 | `--gm-size-mobile-row-min-height` | 2 | --gm-h-row-comfort | 纯改名 |
| 206 | `--gm-size-sidebar-collapsed-width` | 2 | --gm-w-rail | 纯改名 |
| 207 | `--gm-size-spinner-sm` | 2 | --gm-icon-md | 纯改名 |
| 208 | `--gm-size-switch-width` | 2 | 开关 36px 固定值 | 纯改名 |
| 209 | `--gm-warning-soft` | 2 | --gm-warning-tint | 纯改名 |
| 210 | `--gm-z-sticky` | 2 | --gm-z-sticky（10） | 纯改名 |
| 211 | `--border-strong` | 1 | --gm-line-strong | 纯改名 |
| 212 | `--gm-color-muted-icon` | 1 | --gm-text-tertiary | 纯改名 |
| 213 | `--gm-color-text-inverse` | 1 | --gm-on-accent | 纯改名 |
| 214 | `--gm-detail-pad-mobile-y` | 1 | --gm-sp-4 | 纯改名 |
| 215 | `--gm-empty-icon-color` | 1 | --gm-text-tertiary | 纯改名 |
| 216 | `--gm-icon-2xs` | 1 | --gm-icon-xs | 纯改名 |
| 217 | `--gm-icon-xs` | 1 | --gm-icon-sm | 纯改名 |
| 218 | `--gm-leading-reading-mobile` | 1 | --gm-lh-read（移动端不再单独放大） | 纯改名 |
| 219 | `--gm-nav-item-pad-x` | 1 | --gm-sp-3 | 纯改名 |
| 220 | `--gm-overlay-dialog` | 1 | --gm-scrim | 纯改名 |
| 221 | `--gm-overlay-scrim` | 1 | --gm-scrim | 纯改名 |
| 222 | `--gm-page-header-title-font` | 1 | --gm-fs-title | 纯改名 |
| 223 | `--gm-pane-header-title-font` | 1 | --gm-fs-ui-lg | 纯改名 |
| 224 | `--gm-radius-none` | 1 | --gm-r-0 | 纯改名 |
| 225 | `--gm-selection-border` | 1 | --gm-accent | 纯改名 |
| 226 | `--gm-shadow-soft` | 1 | --gm-shadow-1 | 纯改名 |
| 227 | `--gm-size-dashboard-cli-desc-max-width` | 1 | 说明文字用 72ch | 纯改名 |
| 228 | `--gm-size-drop-card-max-width` | 1 | --gm-w-content-max | 纯改名 |
| 229 | `--gm-size-empty-state-min-height` | 1 | 空态最小高度 180px 固定值 | 纯改名 |
| 230 | `--gm-size-floating-toast-gutter` | 1 | --gm-sp-7 | 纯改名 |
| 231 | `--gm-size-scrollbar` | 1 | --gm-w-scrollbar | 纯改名 |
| 232 | `--gm-size-settings-modal-lg` | 1 | 对话框 720px 固定值 | 纯改名 |
| 233 | `--gm-size-settings-modal-md` | 1 | 对话框 520px 固定值 | 纯改名 |
| 234 | `--gm-size-setup-panel-max-width` | 1 | --gm-w-content-max | 纯改名 |
| 235 | `--gm-size-split-handle-line-width` | 1 | --gm-w-handle | 纯改名 |
| 236 | `--gm-size-split-pane-left-default` | 1 | --gm-w-pane-default | 纯改名 |
| 237 | `--gm-size-switch-height` | 1 | 开关 20px 固定值 | 纯改名 |
| 238 | `--gm-space-0` | 1 | --gm-sp-0 | 纯改名 |
| 239 | `--gm-z-bottom-nav` | 1 | --gm-z-nav（30） | 纯改名 |
