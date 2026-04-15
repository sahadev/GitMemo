# GitMemo — Product Hunt 发布素材

## 1. 基本信息

- **产品名称**: GitMemo
- **Tagline**: Auto-sync your AI conversations and notes to Git
- **网站**: https://github.com/sahadev/GitMemo
- **分类**: Developer Tools / Productivity / Artificial Intelligence

---

## 2. 产品描述（Description）

### 英文版

GitMemo helps Claude Code and Cursor users save valuable AI conversations, notes, and everyday work into a Git-backed knowledge repo they actually own.

It is a local-first CLI + desktop companion: your saved files stay in your local repo, remote sync is optional, and you can search the same material later from the CLI, Desktop app, or MCP.

**How it works:**
GitMemo integrates with the native mechanisms of Claude Code and Cursor:
- It installs instructions / rules and save skills so supported workflows can write conversations to Markdown
- It wires hooks or MCP-assisted sync so saved files can be tracked in Git
- It provides MCP tools so you can search history and create notes from inside the editor

**Setup:**
```bash
gitmemo init --path ~/my-notes-repo
```

Setup is guided: choose Claude Code, Cursor, or both; optionally connect a remote Git repo; if you use a remote, add the generated SSH public key to your repo's Deploy Keys.

**Key features:**
- 🤖 Save supported Claude Code and Cursor conversations as Markdown
- 📝 Built-in notes: scratch notes, daily journal, manuals
- 🔍 Full-text search across saved conversations, notes, and clips
- 🔌 MCP integration — search history and create notes from the editor
- 🖥️ Native Desktop companion for browsing, search, and optional clipboard capture
- 🔐 Local-first data ownership — your content stays in your repo, remote optional

Built with Rust. Open source under MIT.

### 中文版

GitMemo 帮助 Claude Code 和 Cursor 用户，把有价值的 AI 对话、笔记和日常工作产物保存到一个由 Git 管理、归自己所有的知识库里。

它是一个本地优先的 CLI + Desktop 工具：保存下来的文件先留在本地仓库里，远程同步可选，之后你还可以通过 CLI、Desktop 或 MCP 搜索和复用同一批内容。

**工作原理：**
GitMemo 接入 Claude Code 和 Cursor 的原生机制：
- 安装相应的指令 / 规则和保存技能，让已支持的工作流把对话写成 Markdown
- 接入 hooks 或 MCP 辅助同步，让保存下来的文件由 Git 跟踪
- 提供 MCP 工具，让你直接在编辑器内搜索历史、创建笔记

**设置方式：**
```bash
gitmemo init
```

初始化是引导式的：选择 Claude Code、Cursor 或两者；可选连接远程 Git 仓库；如果启用远程，需要把生成的 SSH 公钥添加到仓库 Deploy Keys。

---

## 3. Maker Comment（首条评论）

### 英文版

Hey everyone! 👋

I built GitMemo because I kept losing valuable AI conversations and notes that I wanted to reuse later.

I use Claude Code and Cursor every day for debugging, design work, scripts, research, and planning. The useful outputs were there — but after the session ended, they were scattered across chat history, clipboard snippets, and half-finished notes. A week later I would end up solving the same problem again.

I tried manual copy-paste into note apps, but it never lasted. What I really wanted was a local-first workflow where useful AI work becomes searchable files in my own repo.

**So GitMemo takes a practical approach:**

Instead of building a hosted knowledge base, GitMemo works with the tools I already use:

1. It installs the instructions / rules and save skills needed for supported Claude Code and Cursor workflows
2. It wires Git tracking into the saved files, with optional remote sync if I want it
3. It gives me CLI, Desktop, and MCP access to the same local knowledge repo later

The result is simple: useful AI work stops disappearing. Conversations, notes, plans, and everyday work become local files I can search, version, and keep.

Desktop currently ships for macOS, and clipboard capture is optional. The CLI works on macOS and Linux.

Built with Rust. MIT licensed. Would love your feedback — especially if you also use AI heavily for development work.

### 中文版

大家好！👋

我做 GitMemo，是因为我不断丢失那些之后还想复用的 AI 对话和笔记。

我每天都会用 Claude Code 和 Cursor 来调 bug、做设计、写脚本、做调研、拆计划。真正有价值的内容其实已经产出了，但会话一结束，它们就散落在聊天记录、剪贴板片段和零散笔记里。过一周我又会重新问一遍同样的问题。

我试过手动复制到笔记软件，但根本坚持不下来。我真正想要的，是一个本地优先的工作流：把有价值的 AI 工作成果变成我自己仓库里可搜索的文件。

**所以 GitMemo 采用了一个很务实的方案：**

它不是再造一个托管式知识库，而是和我已经在用的工具协同：

1. 为已支持的 Claude Code 和 Cursor 工作流安装相应的指令 / 规则和保存技能
2. 让保存下来的文件接入 Git 跟踪；如果我愿意，也可以再接远程同步
3. 之后通过 CLI、Desktop 和 MCP 访问同一份本地知识库

结果就是：有价值的 AI 工作成果不再轻易消失。对话、笔记、计划和日常工作产物变成本地文件，可搜索、可版本化、可长期保留。

Desktop 当前提供 macOS 版本，剪贴板捕获是可选功能；CLI 支持 macOS 和 Linux。

---

## 4. 截图/GIF 建议

需要准备 3-5 张截图：

1. **Hero Image**: 终端中 `gitmemo init` 的完整输出（带颜色）
2. **自动记录效果**: Git 仓库中的 conversations 目录，展示自动生成的 Markdown 文件
3. **搜索功能**: `gitmemo search "rust"` 的输出
4. **MCP 集成**: Claude 对话中调用 cds_search 的效果
5. **架构图**: 三个注入点的简洁示意图

### 截图制作建议

- 使用 [carbon.now.sh](https://carbon.now.sh) 或 [ray.so](https://ray.so) 美化终端截图
- 背景色用深色主题
- 字体用 JetBrains Mono 或 Fira Code
- 加上简短的标注文字

---

## 5. 发布时间建议

- **最佳日期**: 周二至周四（PH 流量最高）
- **最佳时间**: 太平洋时间 00:01（北京时间 15:01）
- **避开**: 大型科技发布日、节假日

---

## 6. 社交媒体配套文案

### Twitter/X

```
🚀 Just launched GitMemo on Product Hunt!

A local-first tool for saving Claude Code and Cursor conversations, notes, and selected AI work into Git.

Search it later from CLI, Desktop, or MCP.
Remote sync optional.

Built with Rust 🦀 | Open source | MIT

→ https://producthunt.com/posts/gitmemo
```

### Hacker News (Show HN)

**标题**: Show HN: GitMemo – Save AI conversations and notes into Git

**正文**:
I built a local-first tool that helps Claude Code and Cursor users save useful AI conversations, notes, and everyday work into a Git-backed knowledge repo.

GitMemo works with the editors' native instructions, hooks, and MCP integrations so saved files stay searchable and versioned in Git. Remote sync is optional.

Desktop currently ships for macOS, and the CLI works on macOS and Linux.

Built with Rust. MIT licensed.

GitHub: https://github.com/sahadev/GitMemo

### Reddit r/ClaudeAI

**标题**: I built a tool that auto-syncs all your Claude conversations to Git

**正文**:
Same as HN but more casual, emphasize the "I kept losing conversations" pain point.
```

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
