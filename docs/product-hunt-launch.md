# GitMemo — Product Hunt 发布素材

## 1. 基本信息

- **产品名称**: GitMemo
- **Tagline**: Auto-sync your AI conversations and notes to Git
- **网站**: https://github.com/sahadev/GitMemo
- **分类**: Developer Tools / Productivity / Artificial Intelligence

---

## 2. 产品描述（Description）

### 英文版

GitMemo automatically records every conversation you have with Claude and syncs it to your Git repository — zero config, zero background processes, zero effort.

**How it works:**
GitMemo doesn't run as a background service. Instead, it injects into Claude Code's native infrastructure:
- A CLAUDE.md instruction tells Claude to auto-save conversations as Markdown
- A PostToolUse hook automatically `git commit && git push` after each save
- An MCP server lets Claude search your conversation history and create notes

**One command to set up, then forget it exists:**
```
gitmemo init --path ~/my-notes-repo
```

**Key features:**
- 🤖 Auto-record all Claude conversations as Markdown
- 📝 Built-in notes: scratch notes, daily journal, manuals
- 🔍 Full-text search across all conversations and notes
- 🔌 MCP integration — ask Claude to search your history directly
- 🚀 Zero daemon — leverages Claude Code hooks, no background process
- 🔐 Data sovereignty — your data stays in YOUR Git repo

Built with Rust. Open source. Free forever.

### 中文版

GitMemo 自动记录你与 Claude 的每一次对话，并同步到你的 Git 仓库——零配置、零后台进程、零额外操作。

**工作原理：**
GitMemo 不是后台服务，而是注入 Claude Code 的原生基础设施：
- CLAUDE.md 指令让 Claude 自动保存对话为 Markdown
- PostToolUse Hook 在每次保存后自动 git commit & push
- MCP Server 让 Claude 直接搜索历史对话、创建笔记

**一条命令配置，然后忘掉它的存在：**
```
gitmemo init
```

---

## 3. Maker Comment（首条评论）

### 英文版

Hey everyone! 👋

I built GitMemo because I kept losing valuable conversations with Claude.

Every day I ask Claude to solve bugs, design architectures, write scripts — and the answers are gold. But after the conversation ends, that knowledge just... disappears into the chat history. I'd find myself asking the same questions again a week later.

I tried manually copying conversations to Notion, but that lasted about 2 days. I tried Obsidian with git plugins, but the setup was painful. What I really wanted was something that just *works* — install it once and never think about it again.

**So I built GitMemo with a radically simple approach:**

Instead of running a background daemon to watch files (the obvious solution), GitMemo injects directly into Claude Code's existing infrastructure:

1. It adds an instruction to CLAUDE.md that tells Claude to save conversations as Markdown files
2. It adds a PostToolUse hook that auto-commits and pushes after each save
3. It registers an MCP server so Claude can search your history

The result? **Zero background processes. Zero resource usage. Zero maintenance.** Claude itself does the saving, and Claude Code's hook system does the syncing.

After one week of use, I already have 40+ conversations neatly organized in my Git repo, fully searchable. It feels like having a second brain that builds itself.

Built with Rust for minimal overhead. Fully open source under MIT.

Would love your feedback! What's your approach to preserving AI conversations?

### 中文版

大家好！👋

我做 GitMemo 是因为我不断丢失与 Claude 的宝贵对话。

每天我用 Claude 解决 bug、设计架构、写脚本——这些回答都是金子。但对话结束后，这些知识就消失在历史记录里了。一周后我发现自己在问同样的问题。

我试过手动复制到 Notion，坚持了 2 天。试过 Obsidian + Git 插件，配置太痛苦。我真正想要的是装一次就不用管的东西。

**所以我用了一个极简的方案：**

不跑后台守护进程，而是直接注入 Claude Code 的原生基础设施——Claude 自己保存对话，Hook 自动 commit & push。零进程、零资源占用、零维护。

用了一周，已经有 40+ 条对话整齐地保存在 Git 仓库里，支持全文搜索。

Rust 写的，MIT 开源，永久免费。

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

Auto-sync your Claude conversations to Git.
No background process. No config. Just works.

One command: `gitmemo init`

Built with Rust 🦀 | Open source | Free forever

→ https://producthunt.com/posts/gitmemo
```

### Hacker News (Show HN)

**标题**: Show HN: GitMemo – Auto-sync Claude conversations to Git (Rust)

**正文**:
I built a CLI tool that automatically saves all your Claude Code conversations as Markdown files in a Git repository.

Instead of running a background daemon, it injects into Claude Code's native hook system:
- CLAUDE.md instruction → Claude saves conversations as Markdown
- PostToolUse hook → auto git commit & push
- MCP server → search history from within Claude

Zero processes, zero resource usage. Claude does the recording, hooks do the syncing.

Built with Rust (~1,700 lines). MIT licensed.

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
