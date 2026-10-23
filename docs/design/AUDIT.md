# 设计语言审计（第一轮）

依据：`docs/design/LANGUAGE.md`。
工具：`node scripts/audit_design_language.mjs`（加 `--strict` 有命中即退出码 1，加 `--json` 出机器可读结果）。
扫描范围：`desktop/src` 下 133 个 `.css` / `.tsx` / `.ts` 文件，样式集中在单个 `index.css`。
本次不改任何界面代码。

## 结果

| 规则 | 等级 | 命中 | 内容 |
| --- | --- | --- | --- |
| T1 | J | 0 | 字号字面量（全部已走 `--gm-font-*`） |
| T2 | S | 99 | 使用 `--gm-font-xs`（12px） |
| T3 | J | 45 | 白名单外的字重 |
| T4 | J | 6 | 间距字面量 |
| T5 | J | 0 | 圆角字面量（全部合规） |
| T6 | J | 1 | 动效时长不在白名单 |
| T7 | J | 2 | 无限循环动画 |
| T8 | J | 15 | 奥运五色作为分类身份色 |
| T9 | J | 0 | 非 0 `letter-spacing`（打印根节点已豁免） |
| T10 | S | 4 | `max-width` 字面量 |
| T11 | S | 9 | `--gm-font-md` 用在列表页 |

字号与圆角两块已经干净：所有字号走 token、所有圆角落在 0/2/4/6/8 内。问题集中在字重、12px 泛滥、分类配色、动效。

## 五条值得先处理的事实

**1. 字重有 9 个值，没有梯度可言。** 400 / 500 / 560 / 600 / 620 / 650 / 700 / 720 / 750 / 760 / 780 / 800 同时在用。其中 700 出现 16 次，集中在设置向导（`gm-setup-*` 共 7 处）与 3 处激活态按钮；760 出现 9 次，全是标题类（页标题、面板标题、导航标签）。改法是机械的：760 → 720、700/600 → 650、500/560 → 400。

**2. 12px 用了 99 处，与正文 13px 只差 1px。** 等宽字体下 12 与 13 视觉上无法区分，所以「次级标签」和「正文」看起来一样重，这是层级塌掉的主因。这 99 处分布在标题副行、区块标题、标签页、表格单元格、摘要等处，需要按用途分流：标签类降到 11px，可读文字升到 13px。

**3. 分类用奥运五色编码。** `.gm-icon-tone-olympic-*` 5 个类 + Dashboard 统计卡 `data-tone="olympic-*"` 5 条 + 页面里 5 处 tone 引用，一共 15 处。五个分类各一个颜色，等于让颜色承担导航职责，同时和状态色抢同一套视觉资源。按 §3.5 收敛为 `tone="muted"`，颜色条与统计卡左侧 rail 一并去掉。

**4. Dashboard 那个无限摆动是一次性的装饰。** `gm-dashboard-quick-note-hand-nudge` 1200ms 无限循环，另有一处 `shimmer` 1.5s 无限（同步中，属加载类，保留）。前者按 §4.2 删除。另有 1 处 `transition: background 0.1s` 不在 150/200 白名单内。

**5. 新模块在绕过间距刻度。** `gm-clip-cleaner-*` 与 `gm-quick-paste-shell` 用了 10px / 14px / 18px / 40px / 58px / 64px / 76px / 80px，这些值都不在 `--gm-space-*` 的 8 档里。数量只有 6 处，但集中在两个较新的模块，说明新代码没有再查刻度表。

## 建议修复顺序

1. **字重归一**（45 处，纯替换，零布局风险）。
2. **12px 分流**（99 处，先按用途分类再改，改完要肉眼过一遍设置页与搜索页）。
3. **分类配色收敛**（15 处，需要改 `DashboardPage.tsx` 的 tone 与统计卡 rail）。
4. **动效清理**（3 处）。
5. **间距字面量**（6 处，clip-cleaner 与 quick-paste 两个模块）。

前两步改动量大但不改变结构，可以一次做完；第三步开始会动到组件代码，建议每页单独提交。

## 未覆盖项

- 颜色对比度：规则里写了「暖灰底偏绿（`#151713`）需按 §3 校验」，工具没有做对比度计算，需要人工在浅色/深色下各看一遍。
- 同屏字号计数（§1.5）：需要渲染后统计，静态扫描做不到，要等界面截图。
- 悬停位移、渐变、发光等手法：静态扫描只覆盖了白名单里的属性，视觉类手法需在第二轮逐页核对。

工具与规则是同一份判据，规则改了要同步改 `scripts/audit_design_language.mjs` 里的白名单常量。

---

## 第二轮：四类问题的具体落点（按首屏观感排序）

判据：`docs/design/LANGUAGE.md`（其附录已声明 DESIGN.md 数值过期），必要处标注 DESIGN.md 的角色规则。
本节只追加，不改上文。

### 1. 跨页面同一语义元素不一致

1. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:552` → §1.4 页标题字重 720，`.gm-page-title` 实为 760，每个页面的第一行文字都不合规 → 760 改 720。
2. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:567` → §1.4 区块标题是 `--gm-font-2xs`(11px)，`.gm-section-title` 用 12px，与正文 13px 只差 1px，层级塌成一片 → 降为 `--gm-font-2xs`。
3. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:650` → §1.4 面板标题字重 650，`.gm-pane-header-title` 实为 720，所有分栏页表头都偏粗 → 改 650。
4. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/pages/DashboardPage.tsx:494` → 同一页两种卡片标题：这张用 `.gm-card-title`（index.css:3114，13px/720），另外四张用 `.gm-section-title`（12px/650）→ 统一走区块标题。
5. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:705` → §1.4 tab 文字应为 650，激活态实为 760，而另一套 tab 是 700（:771），同角色三档字重 → 全部收敛到 650。
6. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:930` → §1.4 元信息应为 11px + `--gm-color-text-muted`，这里 12px + `--text-secondary`（:1309 同），Dashboard 时间 11px 但也用 `--text-secondary`（:5366）→ 时间统一 2xs + muted。
7. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:4226` → §1.2 只允许 400/650/720，设置行标题实为 560；同页「plain 行」标题又降到 12px（:4284），同类行两种字号 → 650 + 同一字号。

### 2. 间距阶梯外取值

8. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:6851` → §2.2 只允许 0/2/4/8/12/16/24/32，clip cleaner 行 `padding: 10px 16px` 里的 10px 无 token → 换 `--gm-row-pad-y` / `--gm-row-pad-x`。
9. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:6047` → §2.2 快速粘贴外壳 `padding: 80px 18px 18px`，三个值都没有 token → 上边距用 `--gm-section-gap-lg`，左右用 `--gm-page-pad-x`。
10. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:3278` → §2.2 拿横向 token 当纵向用：`.gm-setup-sidebar` 写成 `var(--gm-card-pad-x) var(--gm-card-pad-x)`，:3963 同类问题 → 纵向改 `--gm-card-pad-y`。
11. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:724` → 同一角色的过滤行，`.gm-segment-row` 内边距 `icon-text-gap / list-header-pad-x`，`.gm-compact-tab-row`（:729）只有 `icon-text-gap`，左右差一档 → 统一。

### 3. 卡片嵌套与边框层数

12. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:3064` → §6.7「边框 + 投影 + 彩色竖条」三件套：卡片 border（:3063）+ `--gm-shadow-card`（:3065），统计卡还叠左侧彩条（`.gm-dashboard-stat-rail`，:5293）→ 去投影、去彩条，只留 border。
13. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:5259` → §2.1 同一网格里 span 必须统一，前 3 张卡 span 2（:5251），后 3 张 `span 3`，底行宽是上行的 1.5 倍 → 全部 span 2。
14. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:1995` → §5.3 搜索结果应从卡片改为平面列表行，现在是背景+边框+`--gm-shadow-card` 的卡片 → 去背景/边框/投影，行内用 `--gm-list-row-pad-*`。
15. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:4741` → §2.5 卡片套卡片：外层卡片带边框和底色，里面 `.gm-onboarding-item`（:4825）又各带 border + `--bg-card` → item 去边框与底色。
16. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:5736` → 错误面板（边框 + 8px 圆角）内再嵌日志块（:5745，`--bg-inset` + 边框）→ 日志块去边框，靠底色分层。

### 4. 手写 markup 复制了已有组件

17. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/pages/DashboardPage.tsx:417` → `PageHeader`（components/AppHeaders.tsx:35）全仓零调用：Dashboard 手写 `<h1 class="gm-page-title">`，Settings 另造一份（components/domain/settings/SettingsComponents.tsx:44）→ 两处改走 `PageHeader`。
18. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/components/domain/clipboard/ClipboardComponents.tsx:177` → 已有 `EmptyState`（components/base/EmptyState.tsx:12），这里手抄一份，:382 再抄一次 → 改用组件。
19. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/pages/ClaudeConfigPage.tsx:145` → 已有 `PaneTabHeader`（NotesPage.tsx:309 在用），这里手写一套 tab，配套 `.gm-compact-tab-button`（:735）与 `.gm-pane-tab-button`（:669）几乎同款 → 改用 `PaneTabHeader`，删掉重复 CSS。
20. `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:398` → `.gm-card` 与 `.gm-panel`（:385）零引用，真正的卡片由 `.gm-dashboard-card`（:3061）重写一遍 → 只留一套卡片类。

### 本节未列入但已确认

- `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/pages/DashboardPage.tsx:366` 错误态手写面板 + hero 图标（:370），同样应走 `EmptyState`（按首屏观感它只在无仓库时出现，排在 20 条之外）。
- `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:1115` 选中态留白写死 58px，无 token。
- `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:6768` clip cleaner 自建 header（标题 17px/600），未接 `--gm-pane-header-height` 与 `PaneHeader`。
- `/Users/Zhuanz/Code/other/GitMemo-desktop/desktop/src/index.css:6948` 的 `64px 76px 76px` 属打印输出，按 §0.1 豁免（`#gitmemo-print-root`）。
