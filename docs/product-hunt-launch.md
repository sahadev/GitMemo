# GitMemo — Product Hunt 发布素材

## 1. 基本信息

- **产品名称**: GitMemo
- **Tagline**: Save AI conversations and notes into your own Git repo
- **网站**: https://git-memo.vercel.app/
- **GitHub**: https://github.com/sahadev/GitMemo
- **分类**: Developer Tools / Productivity / Artificial Intelligence

---

## 2. 产品描述（Description）

### 英文版（379 chars — PH 限制 500）

GitMemo helps Claude Code & Cursor users save AI conversations, notes and work into a Git repo they own. It hooks into your editor to capture useful outputs as searchable Markdown in Git. Search everything later from CLI, MCP or Desktop. Built-in scratch notes, daily notes and docs. Local-first, remote sync optional. Set up once, then use /save. Desktop app available on macOS.

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

I built GitMemo because I kept losing useful AI conversations I wanted to reuse later.

I use Claude Code and Cursor every day. During a session, I'd get valuable outputs — problem analysis, working solutions, code snippets, little decisions worth keeping. But once the session ended, they were buried in chat history or lost in the clipboard. A week later, I'd end up solving the same problem again.

I tried saving things manually to note apps, but it never stuck. What I really wanted was simple: useful AI work should become searchable files in my own repo, not disappear into another hosted tool.

So GitMemo is built for developers who live in Claude Code or Cursor and want their AI work — conversations, notes, decisions — to stay theirs, searchable and versioned in Git.

It integrates with both editors through native instructions, hooks, and MCP, and saves conversations as local Markdown tracked by Git. Alongside that, it comes with built-in scratch notes, daily notes, and docs, plus full-text search across conversations, notes, and clipboard history — reachable from CLI, MCP, or the Desktop app.

Setup is one command: `gitmemo init` → pick your editor → done. After that, `/save` inside Claude Code or Cursor is all you need.

The goal is straightforward: your AI work shouldn't vanish after the session. It should stay searchable, versioned, and fully yours.

Desktop ships for macOS, CLI works on macOS and Linux, clipboard capture is optional, remote Git sync is optional, and the whole thing is built in Rust and open source under MIT.

Would love to hear how you're handling AI conversations today — especially if you also build with Claude Code or Cursor.

### 中文版

大家好！👋

我做 GitMemo，是因为我总是丢失那些之后还想复用的 AI 对话。

我每天都在用 Claude Code 和 Cursor。会话进行的时候，会产出很多有价值的内容——问题分析、可用的解决方案、代码片段、一些值得留下来的小决定。但会话一结束，它们就埋在聊天记录里，或者随着剪贴板丢掉了。过一周，我又会重新解一遍同样的问题。

我试过手动复制到笔记软件，但根本坚持不下来。我真正想要的其实很简单：有价值的 AI 工作成果，应该变成我自己仓库里可搜索的文件，而不是消失在又一个托管工具里。

所以 GitMemo 是做给每天在 Claude Code 或 Cursor 里工作的开发者的——让你的 AI 产出（对话、笔记、决策）继续归你所有，可搜索、可版本化，沉淀在你自己的 Git 仓库里。

它通过原生指令、hooks 和 MCP 接入这两个编辑器，把对话保存为本地 Markdown 并由 Git 跟踪。同时内置了便签、日记和文档，支持跨对话、笔记、剪贴板的全文搜索——CLI、MCP 和 Desktop 三种入口都能访问。

设置只需一条命令：`gitmemo init` → 选择编辑器 → 完成。之后在 Claude Code 或 Cursor 里用 `/save` 就够了。

目标很直接：你的 AI 工作成果不该在会话结束后消失，它应该可搜索、可版本化、完全属于你。

Desktop 提供 macOS 版本，CLI 支持 macOS 和 Linux，剪贴板捕获可选，远程 Git 同步可选，整个项目用 Rust 构建，MIT 协议开源。

也想听听你们现在是怎么处理 AI 对话的——特别是同样在用 Claude Code 或 Cursor 开发的朋友。

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
