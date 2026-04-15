# GitMemo

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Release](https://img.shields.io/github/v/release/sahadev/GitMemo?logo=github&label=release)](https://github.com/sahadev/GitMemo/releases/latest)
[![GitHub Issues](https://img.shields.io/github/issues/sahadev/GitMemo?logo=github)](https://github.com/sahadev/GitMemo/issues)

[English](README.md) | [中文](README_CN.md)

## 简介

> **你的 AI 对话与笔记，自动同步到 Git。** GitMemo 帮你把 AI 对话、笔记和日常工作产物沉淀成一个由 Git 管理的个人知识库。

它提供 CLI 和 Desktop 两种使用形态，并以本地优先的方式服务 Claude Code 和 Cursor 用户。

## 特性

- **Git 支撑的知识库** — AI 对话、笔记和日常工作产物汇入同一目录，由 Git 管理；远程同步始终可选
- **面向已支持编辑器工作流的自动保存** — Claude Code 和 Cursor 对话可按 GitMemo 配置的规则与技能保存为 Markdown
- **搜索与复用** — 通过 CLI、Desktop 或 MCP 搜索已保存内容，而不是让它们淹没在聊天记录里
- **多编辑器** — 同时支持 Claude Code 与 Cursor
- **笔记功能** — 便签、每日笔记、手册，一行命令创建
- **剪贴板捕获** — Desktop 可在启用后本地监控并捕获剪贴板中的文本和图片
- **编辑器捕获链路无需常驻同步守护进程** — 对话保存依赖编辑器原生 hooks / 集成，而不是额外的同步服务
- **数据主权** — 内容在你自己的 Git 仓库中，完全可控；本地索引等辅助数据见 [Data & storage statement（数据与存储声明）](docs/DATA-STATEMENT.md)

## 环境与依赖

- **本机 Git**：用于在同步目录初始化仓库、`commit` / `push` 等；**不强制**配置远程（可长期纯本地，需要把内容同步到另一台电脑或云端仓库时再配远程即可）。
- **Claude Code / Cursor**：**不是**安装 GitMemo 的前置门槛。只有当你希望 **编辑器自动写入对话、Hook、MCP** 时，再在 `gitmemo init` 里接入 **至少其一**；也可先只用 CLI 记笔记与手动同步，之后再补 `init`。
- **远程 Git 托管**（GitHub / GitLab / Gitee / 自建）：**始终可选**。

## 快速开始

### 安装

#### GitMemo Desktop（macOS）— 图形界面优先

1. **下载**：打开 **[GitHub Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest)**，在 **Assets** 中下载 **桌面端**安装包：  
   - 优先选 **`.dmg`**（拖拽安装到「应用程序」）；或  
   - **`.app.tar.gz`**（解压后得到 `.app`，具体文件名随版本变化，认准 **desktop / GitMemo** 相关资源即可）。  
   **Linux / Windows**：当前仓库 **不提供** Desktop 安装包；请使用下方 **CLI 安装**（Linux 支持 CLI）。
2. **首次设置**：先完成一次初始化——**可在 GitMemo Desktop 里按界面引导完成**；若你更习惯终端，也可安装下方 **CLI** 后执行 **`gitmemo init`**。完成后会生成 `~/.gitmemo` 并可选接入 Claude / Cursor。之后日常可**主要用 Desktop** 做浏览、搜索与剪贴板。

> **安装 Desktop 前请注意**：当前 macOS Desktop 安装包**还没有 Apple 签名 / notarization**。在部分 Mac 上，Gatekeeper 可能会提示应用已损坏、无法打开，或先拦截启动，需要你手动清除隔离属性。  
> 如果你对这类系统提示比较介意，或者希望首次使用路径更顺畅，**建议优先使用 CLI 版本**，后续再按需安装 Desktop。
>
> **macOS 打不开应用？** 未签名应用可能被拦截，在终端执行（路径按你实际安装位置调整）：  
> `xattr -cr /Applications/GitMemo.app`  
> 若只用 CLI 二进制，也可：`xattr -cr /usr/local/bin/gitmemo`

#### CLI 安装（macOS / Linux）

一键安装脚本（同时包含 `gitmemo` CLI，并可在脚本流程中安装/更新相关组件）：

```bash
# 一键安装（自动检测平台）
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

<details>
<summary>手动下载 CLI / 从源码编译</summary>

从 [Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest) 的 **Assets** 中下载对应平台的 **CLI** 二进制（如 `gitmemo-macos-aarch64`），然后：

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

按提示选择编辑器、输入 Git 仓库地址（可直接回车跳过，使用纯本地模式）。如需远程同步，将生成的 SSH 公钥添加到仓库的 Deploy Keys 即可。

### 完成初始化后

完成初始化后，对话、笔记和其他已支持来源会随工作流进入同步目录并写入 Git。在 **Claude** 或 **Cursor** 里输入 **`/save`** 可主动保存当前会话（需在 `init` 时已接入对应编辑器）；自动保存也会在已支持工作流和你配置的规则下运行。若无响应，可重启当前编辑器会话。

### Desktop 客户端

**安装包下载**：见上文 **「安装」→「GitMemo Desktop（macOS）」**，直达 **[Releases · Latest](https://github.com/sahadev/GitMemo/releases/latest)**。完成初始化后，打开 GitMemo Desktop，它会读取与 CLI 相同的同步目录（通常是 `~/.gitmemo`）。

- **仪表盘**：统计卡片、同步状态、最近动态 Feed、剪贴板监控指示器
- **全文搜索**：跨对话、笔记、剪贴板、计划和配置搜索
- **剪贴板监控**：支持文本和图片捕获，缩略图预览
- **系统通知**：通过 macOS 通知中心推送同步错误和剪贴板捕获（仅后台）
- **Quick Paste**：浮窗命令面板（Cmd+Shift+Space）
- **系统托盘**：快捷操作（打开/同步/剪贴板/退出）
- **诊断日志**：与「检查更新」相关的条目带 `[updater]` 前缀，写入应用日志文件 `gitmemo.log`（macOS 一般在 `~/Library/Logs/` 下与应用相关的目录中；也可用「控制台」搜索 GitMemo）
- Claude Code 和 Cursor 生成的 plans 都会导入到 `plans/`
- 当前桌面端安装包仅支持 **macOS**（Apple Silicon + Intel）
- 当前 Desktop 安装包**尚未做 Apple 签名 / notarization**；如果你希望首次安装阻力更小，建议先使用 **CLI**
- Desktop 日常使用不必开着终端；**初始化可在应用内完成**，也可用 CLI 执行 `gitmemo init`。CLI 还便于在终端里用 `gitmemo note`、`sync` 等命令

### 对话如何保存

在 **Claude** 或 **Cursor** 中输入 **`/save`** 可保存当前会话（已按 `gitmemo init` 写入保存技能时）。Claude 侧多数对话还会在规则下自动落盘。若某次未被自动记下，用 **`/save`** 即可补存。

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
gitmemo remote             # 查看当前远程仓库
gitmemo remote <url>       # 设置远程仓库（开启同步）
gitmemo remote --remove    # 移除远程仓库（切换到纯本地模式）
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
├── conversations/          # 自动记录的 AI 对话；可选问答摘要（同为年-月子目录）
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
├── claude-config/          # 与 Claude 同步的配置与记忆等
│   ├── CLAUDE.md           # 全局 Claude 指令
│   ├── memory/             # Claude 的自动记忆
│   ├── skills/             # 自定义技能
│   └── projects/           # 项目级记忆
└── .metadata/              # 搜索索引（不同步）
```

主体知识内容为纯 Markdown 等文本，可用任意编辑器打开；`.metadata/` 为本地配置与搜索索引，详见 **[Data & storage statement（数据与存储声明）](docs/DATA-STATEMENT.md)**。卸载后 Git 中的用户内容仍保留在仓库内。

## 自动捕获的内容

GitMemo 可在已支持工作流中捕获并整理 **8 类知识产物**：

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

无需手动复制，无需导出按钮，已支持来源可自动流入同步目录并由 Git 跟踪。

## 支持的编辑器

| 编辑器 | 系统指令 | Git 同步 | MCP |
|--------|---------|----------|-----|
| **Claude Code** | `CLAUDE.md` | PostToolUse Hook（自动） | `~/.claude.json` |
| **Cursor** | Cursor Rules（`.mdc`） | `cds_sync` MCP 工具 | `~/.cursor/mcp.json` |

## 工作原理

对 Claude Code 和 Cursor 的对话捕获链路，GitMemo 不依赖额外的同步守护进程，而是接入各自编辑器的原生机制：

**Claude Code：**

| 注入点 | 作用 |
|--------|------|
| `CLAUDE.md` 指令 | 让 Claude 每次对话后自动保存为 Markdown |
| `settings.json` Hook | 文件写入后自动 `git commit && git push` |
| `~/.claude/skills/save` | `/save` 技能，便于显式触发「保存会话」 |
| `~/.claude/skills/gitmemo-session-log` | 与 Cursor 相同：有实质内容的问答摘要写入 `<同步目录>/conversations/年-月/`（与自动会话同规则） |
| MCP Server | 让 Claude 能搜索历史对话、创建笔记 |

**Cursor：**

| 注入点 | 作用 |
|--------|------|
| `~/.cursor/rules/gitmemo.mdc` | 让 AI 每次对话后自动保存为 Markdown（`init` **始终**写入该全局规则，含 `alwaysApply: true`，与是否只选 Claude Code 无关）；对**成篇**产品规划/技术方案等，**同一轮内**主动写入 `<同步目录>/notes/manual/`，无需用户再说「保存」 |
| `~/.cursor/skills/save` | 与 `/save` 技能说明，便于说「保存会话」时触发 |
| `~/.cursor/skills/gitmemo-session-log` | 将有实质内容的问答摘要写入 `<同步目录>/conversations/年-月/`（与自动保存对话同一路径规则，不是当前项目仓库） |
| `cds_sync` MCP 工具 | AI 保存文件后调用此工具触发 git 同步（仅当 `init` 时选择 Cursor 且未 `--no-mcp`） |
| MCP Server | 让 AI 能搜索历史对话、创建笔记 |

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
cargo run --help
```

## 许可证

MIT
