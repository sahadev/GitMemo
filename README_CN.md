# GitMemo

[English](README.md) | [中文](README_CN.md)

> 你的 AI 对话与笔记，自动备份到 Git

GitMemo 自动将你与 Claude 或 Cursor（或任何 AI Agent）的对话记录为 Markdown 文件，并同步到 Git 仓库。零后台进程，零额外操作。

## 特性

- **自动记录** — 对话自动保存为 Markdown，完全透明
- **多编辑器** — 同时支持 Claude Code 和 Cursor
- **多语言** — 支持中英文界面，`gitmemo init` 时可选择
- **笔记功能** — 便签、每日笔记、手册，一行命令创建
- **Git 同步** — 自动 commit & push，分支管理、跨设备访问
- **MCP 集成** — 在 AI 编辑器中直接搜索历史对话、创建笔记
- **零进程** — 不启动后台服务，利用编辑器原生 hooks 驱动
- **数据主权** — 数据存储在你自己的 Git 仓库，完全可控

## 支持的编辑器

| 编辑器 | 系统指令 | Git 同步 | MCP |
|--------|---------|----------|-----|
| **Claude Code** | `CLAUDE.md` | PostToolUse Hook（自动） | `~/.claude.json` |
| **Cursor** | Cursor Rules（`.mdc`） | `cds_sync` MCP 工具 | `~/.cursor/mcp.json` |

## 工作原理

GitMemo 不是后台服务，而是注入编辑器的原生基础设施：

**Claude Code：**

| 注入点 | 作用 |
|--------|------|
| `CLAUDE.md` 指令 | 让 Claude 每次对话后自动保存为 Markdown |
| `settings.json` Hook | 文件写入后自动 `git commit && git push` |
| MCP Server | 让 Claude 能搜索历史对话、创建笔记 |

**Cursor：**

| 注入点 | 作用 |
|--------|------|
| `~/.cursor/rules/gitmemo.mdc` | 让 AI 每次对话后自动保存为 Markdown |
| `cds_sync` MCP 工具 | AI 保存文件后调用此工具触发 git 同步 |
| MCP Server | 让 AI 能搜索历史对话、创建笔记 |

## 前置条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)（CLI）和/或 [Cursor](https://cursor.com)
- Git
- 一个 Git 远程仓库（GitHub / GitLab / Gitee / 自建）

## 快速开始

### 安装

```bash
# 一键安装（自动检测平台）
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

> **macOS 用户**：如果提示"文件已损坏"或"无法打开"，请在终端执行：
> ```bash
> xattr -cr /Applications/GitMemo.app
> # 或 CLI 二进制：
> xattr -cr /usr/local/bin/gitmemo
> ```
> 这是未签名应用的正常现象，Apple 要求 $99/年的开发者证书才能签名。

<details>
<summary>手动下载 / 其他安装方式</summary>

从 [Releases](https://github.com/sahadev/GitMemo/releases/latest) 下载对应平台的二进制文件，然后：

```bash
chmod +x gitmemo-macos-aarch64
sudo mv gitmemo-macos-aarch64 /usr/local/bin/gitmemo
```

或从源码编译（需要 Rust 工具链）：

```bash
git clone https://github.com/sahadev/GitMemo.git
cd GitMemo
cargo install --path .
```

</details>

### 初始化

```bash
# 全新开始 — 交互式选择编辑器（Claude Code / Cursor / 两者都装）
gitmemo init

# 或直接指定编辑器
gitmemo init --editor claude    # 仅 Claude Code
gitmemo init --editor cursor    # 仅 Cursor
gitmemo init --editor all       # 两者都装

# 指定语言（默认英文）
gitmemo init --lang zh          # 中文界面
gitmemo init --lang en          # 英文界面

# 链接到已有的本地 Git 仓库
gitmemo init --path /path/to/your/repo
```

按提示选择编辑器、输入 Git 仓库地址（已有仓库会自动检测），将生成的 SSH 公钥添加到仓库的 Deploy Keys，完成。

### 就这样

你的 AI 对话将自动保存到 Git 仓库。试试在 Claude 中输入 `/save`，无需重启即可生效。如果未生效，重启编辑器会话即可。

### 对话如何保存

在 Claude 对话中输入 `/save` 即可保存当前会话。Claude 有时也会自动保存（由 CLAUDE.md 指令驱动，不保证每次触发）。

### 验证是否生效

```bash
# 快速测试 — 创建一条笔记
gitmemo note "hello world"

# 查看状态
gitmemo status
```

如果看到笔记文件和 git 提交记录，说明一切正常。

## 命令

```
gitmemo init               # 初始化配置
gitmemo status             # 查看配置与同步状态
gitmemo sync               # 同步本地更改到 Git（commit + push）
gitmemo branch             # 查看当前同步分支
gitmemo branch main        # 切换同步分支为 "main"
gitmemo note "记个笔记"     # 创建便签
gitmemo daily              # 今日笔记
gitmemo manual "标题"       # 创建手册
gitmemo search "docker"    # 全文搜索对话和笔记
gitmemo recent             # 最近的对话
gitmemo stats              # 统计信息
gitmemo unpushed           # 查看未推送的提交
gitmemo reindex            # 重建搜索索引
gitmemo uninstall          # 移除配置（保留数据）
```

## 数据结构

```
~/.gitmemo/
├── conversations/          # 自动记录的 AI 对话
│   └── 2026-03/
│       └── 03-25-rust-async.md
├── notes/
│   ├── daily/              # 每日笔记
│   ├── manual/             # 手册 & 调研文档
│   └── scratch/            # 便签
├── clips/                  # 自动捕获的剪贴板内容
│   └── 2026-03-25/
├── plans/                  # Plan Mode 的实施方案
├── imports/                # 拖拽导入的文件
├── claude-config/          # AI 配置备份
│   ├── CLAUDE.md           # 全局 Claude 指令
│   ├── memory/             # Claude 的自动记忆
│   ├── skills/             # 自定义技能
│   └── projects/           # 项目级记忆
└── .metadata/              # 搜索索引（不同步）
```

所有数据都是纯 Markdown 文件，可以用任何编辑器打开。卸载后数据依然保留。

## 自动捕获的内容

GitMemo 自动捕获 AI 工作流中的 **8 类知识产物**：

| 类型 | 内容 | 存储位置 |
|------|------|---------|
| **对话记录** | 每轮 AI 对话 | `conversations/` |
| **计划文件** | Plan Mode 的实施方案 | `plans/` |
| **调研报告** | 竞品分析、技术选型调研 | `notes/manual/` |
| **设计文档** | 架构设计、API 设计 | `notes/manual/` |
| **剪贴板** | 文本片段、代码、URL（自动） | `clips/` |
| **导入文件** | 拖拽导入 — Markdown、代码、PDF | `imports/` |
| **AI 记忆** | Claude 的自动记忆和项目上下文 | `claude-config/memory/` |
| **技能与配置** | 自定义技能、CLAUDE.md 指令 | `claude-config/skills/` |

无需手动复制，无需导出按钮，一切自动流入你的 Git 仓库。

## 卸载

```bash
# 移除配置，保留数据
gitmemo uninstall

# 移除配置 + 删除所有数据
gitmemo uninstall --remove-data
```

## 开发

```bash
git clone https://github.com/sahadev/GitMemo.git
cd GitMemo
cargo build
cargo test
cargo run -- help
```

## 许可证

MIT
