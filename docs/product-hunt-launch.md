# GitMemo — Product Hunt 发布素材

## 1. 基本信息

- **产品名称**: GitMemo
- **Tagline**: Save AI conversations and notes into your own Git repo
- **网站**: https://git-memo.vercel.app/
- **GitHub**: https://github.com/sahadev/GitMemo
- **分类**: Developer Tools / Productivity / Artificial Intelligence

---

## 2. 产品描述（Description）

### 英文版（497 chars — PH 限制 500）

GitMemo saves Claude Code & Cursor AI conversations, notes and work into a Git repo you own.

Useful outputs vanish after each session. GitMemo hooks into your editor to capture them as searchable Markdown in Git.

• AI conversations saved as Markdown
• Built-in scratch, daily notes & docs
• Full-text search across everything
• MCP integration inside the editor
• Desktop app with clipboard capture (macOS)
• Local-first — remote sync optional

Set up once, use /save. Rust & MIT.

### 中文版

GitMemo 帮助 Claude Code 和 Cursor 用户，把有价值的 AI 对话、笔记和日常工作产物保存到一个由 Git 管理、归自己所有的知识库里。

你每天都会产出有用的内容——问题分析、解决方案、代码片段、计划。但会话一结束，它们就散落在聊天记录和剪贴板里。过一周你又会重新问同样的问题。GitMemo 解决这个问题。

**工作原理：**
- 通过原生指令、hooks 和 MCP 接入 Claude Code 和 Cursor
- 把对话、笔记和计划保存为本地 Markdown 文件，由 Git 跟踪
- 提供 CLI、Desktop 和 MCP 入口，方便之后搜索和复用

**核心特性：**
- 🤖 把 Claude Code 和 Cursor 对话保存为可搜索的 Markdown
- 📝 内置笔记：便签、日记、文档
- 🔍 跨对话、笔记和剪贴板的全文搜索
- 🔌 MCP 集成——直接在编辑器里搜索历史、创建笔记
- 🖥️ Desktop 客户端：浏览、搜索、可选剪贴板捕获（macOS）
- 🔐 本地优先——内容留在你自己的仓库里；远程 Git 同步可选

一次引导式设置：`gitmemo init` → 选择编辑器 → 完成。Rust 构建，MIT 开源。

---

## 3. Maker Comment（首条评论）

### 英文版

Hey everyone! 👋

I built GitMemo because I kept losing valuable AI conversations that I wanted to reuse later.

I use Claude Code and Cursor daily. The useful outputs — problem analyses, solutions, code snippets — were always there during the session. But once it ended, they scattered across chat history and clipboard. A week later I'd solve the same problem again.

I tried copy-pasting into note apps, but it never lasted. What I really wanted was useful AI work becoming searchable files in my own repo — not another hosted knowledge base.

I chose Git because developers already know it, it versions everything, and your data never depends on another service.

**So GitMemo takes a practical approach:**

1. Integrates with Claude Code and Cursor through their native instructions and hooks
2. Saves conversations, notes, and plans as local Markdown files tracked by Git
3. Gives you CLI, Desktop, and MCP access to search and reuse everything later

The result: useful AI work stops disappearing. It becomes local files you can search, version, and keep.

Desktop ships for macOS; CLI works on macOS and Linux. Clipboard capture is optional. Built with Rust. MIT licensed.

Would love your feedback — especially if you also use AI heavily for development work.

### 中文版

大家好！👋

我做 GitMemo，是因为我不断丢失那些之后还想复用的 AI 对话。

我每天都用 Claude Code 和 Cursor。会话过程中有价值的内容——问题分析、解决方案、代码片段——都在那里。但会话一结束，它们就散落在聊天记录和剪贴板里。过一周我又会重新问同样的问题。

我试过手动复制到笔记软件，但根本坚持不下来。我真正想要的，不是又一个托管式知识库，而是让有价值的 AI 工作成果变成我自己仓库里可搜索的文件。

我选择 Git，是因为开发者本来就熟悉它，它能版本化一切，而且你的数据不依赖任何第三方服务。

**所以 GitMemo 采用了一个很务实的方案：**

1. 通过原生指令和 hooks 接入 Claude Code 和 Cursor
2. 把对话、笔记和计划保存为本地 Markdown 文件，由 Git 跟踪
3. 之后通过 CLI、Desktop 和 MCP 搜索和复用

结果就是：有价值的 AI 工作成果不再消失，变成本地文件，可搜索、可版本化、可长期保留。

Desktop 提供 macOS 版本；CLI 支持 macOS 和 Linux。剪贴板捕获是可选功能。Rust 构建，MIT 开源。

---

## 4. 截图/GIF 建议

准备 5 张截图，按产品价值感递减排列：

1. **Desktop Dashboard（Hero Image）**: 仪表盘全貌——统计数据、最近动态、同步状态，一眼看出这是一个有产品感的应用
2. **搜索结果页**: 在 Desktop 中搜索关键词，展示跨对话/笔记/剪贴板的全文检索效果
3. **知识库一览**: 对话 + 笔记 + 计划在同一个仓库里，展示"一个 repo 管所有"
4. **编辑器集成**: Claude Code 或 Cursor 中使用 `/save` 或 MCP 搜索的实际场景
5. **CLI 初始化**: `gitmemo init` 的引导式设置输出（给技术用户看）

### 截图制作建议

- Desktop 截图直接用 macOS 原生截图，保持真实产品感
- CLI 截图使用 [ray.so](https://ray.so) 美化，深色主题
- 每张图加一句简短标注（英文），说明这张图展示的核心价值
- Hero Image 决定点击率——必须是产品截图，不是终端截图

---

## 5. 发布时间建议

- **最佳日期**: 周二至周四（PH 流量最高）
- **最佳时间**: 太平洋时间 00:01（北京时间 15:01）
- **避开**: 大型科技发布日、节假日

---

## 6. 社交媒体配套文案

### Twitter/X

```
🚀 Launched GitMemo on Product Hunt!

I kept losing valuable AI conversations —
so I built a tool that saves them into Git.

Works with Claude Code & Cursor.
Local-first. Open source. Built with Rust.

→ https://producthunt.com/posts/gitmemo
```

### Hacker News (Show HN)

**标题**: Show HN: GitMemo – Save AI conversations and notes into your own Git repo

**正文**:
I built a local-first tool that helps Claude Code and Cursor users save useful AI conversations, notes, and everyday work into a Git-backed knowledge repo.

GitMemo integrates with the editors' native instructions, hooks, and MCP so saved files stay searchable and versioned in Git. Remote sync is optional.

Desktop ships for macOS; CLI works on macOS and Linux.

Built with Rust. MIT licensed.

GitHub: https://github.com/sahadev/GitMemo

### Reddit r/ClaudeAI

**标题**: I built a tool that saves Claude Code conversations into Git

**正文**:

I kept losing useful Claude Code conversations — problem analyses, debugging sessions, architecture decisions — and solving the same problems again a week later.

So I built GitMemo. It integrates with Claude Code (and Cursor) through native instructions and hooks, and saves conversations as searchable Markdown files in your own Git repo. Local-first, remote sync optional.

It also has built-in notes, full-text search, MCP integration, and a Desktop app (macOS) for browsing everything.

One command to set up: `gitmemo init`

Open source, MIT licensed, built with Rust.

GitHub: https://github.com/sahadev/GitMemo

---

## 7. Logo 建议

概念方向：
1. **Git 分支 + 对话气泡**: Git 的分支图标，节点是对话气泡
2. **备忘录 + Git**: 一个便签图标上有 Git 的 commit 符号
3. **G + M 字母组合**: 简洁的字母 logo

配色建议：
- 主色：#4A90D9（Git 蓝）或 #D4A76A（暖色备忘录）
- 辅色：#333333（深灰）
- 保持简洁，两色即可
