# GitMemo — 产品设计文档

## 一、我们要解决什么问题

Novi Notes 的开发者 Hojong 精确描述了这个痛点：

> "当我开始在 Claude Desktop 和 Claude Code 中工作时，一个意想不到的问题出现了：markdown 文件开始在各个角落堆积。技能文档、agent 配置、项目笔记、CLAUDE.md 文件——散落在数十个项目目录中。版本控制成了噩梦，每次启动新项目，都不得不翻遍旧文件夹来寻找和重新配置一切。"

这个问题正在被每一个 AI 重度用户经历，但它实际上由两个子问题组成：

**问题 A：对话即用即弃**
用户与 Claude 的每一次深度对话都包含大量有价值的知识——问题分析、解决方案、代码片段、设计决策。但对话结束后，这些知识就沉入历史记录，难以检索、无法版本管理、不能跨设备共享。

**问题 B：笔记碎片化**
开发者在使用 AI 的过程中会产生大量笔记——会议记录、技术备忘、项目文档、学习心得。这些内容散落在不同工具和目录中，缺乏统一管理。

**现有方案的不足**：

| 方案 | 解决了什么 | 没解决什么 |
|------|-----------|-----------|
| Claude 自带历史 | 能回看对话 | 不能导出、不能搜索、不能版本控制、厂商锁定 |
| Notion/Obsidian | 笔记管理强大 | 需要手动复制粘贴对话，无法自动化 |
| Novi Notes | MCP 集成、本地优先 | 仅 Mac、闭源、无 Git 同步、不能自动记录对话 |
| 手动复制到 Git | 版本控制 | 太费时间，不可持续 |

---

## 二、产品定位

### 核心定义

**GitMemo 是一个面向开发者的 AI 知识管理工具，它同时做两件事：**
1. **自动记录**：在后台静默捕获所有 AI 对话，用户无感知
2. **主动笔记**：提供轻量的笔记能力，用户可以随时记录想法

**两者通过 Git 统一管理，实现版本控制、跨设备同步、永久保存。**

### Tagline

> **你的 AI 对话与笔记，自动备份到 Git**

### 一句话描述

> GitMemo 自动记录你与 AI 的每一次对话，同时支持你随时创建笔记，所有内容通过 Git 同步，数据完全属于你。

### 与 Novi Notes 的定位差异

| 维度 | Novi Notes | GitMemo |
|------|-----------|----------------|
| **核心动作** | 用户主动写笔记 | 对话自动记录 + 用户主动写笔记 |
| **AI 集成** | MCP（Claude 读写笔记） | MCP + 文件监控（Claude 读写 + 自动捕获对话） |
| **数据同步** | 本地存储，无云同步 | 本地 + Git 自动同步 |
| **平台** | 仅 Mac GUI 应用 | 跨平台 CLI 工具 |
| **开源** | 闭源，一次性买断 | 开源，免费 |
| **目标用户** | Mac 用户 | 所有终端用户（开发者优先） |

**我们不是 Novi Notes 的竞品，而是互补品**：
- Novi Notes 是一个**笔记应用**，碰巧支持 AI
- GitMemo 是一个**AI 对话备份工具**，同时支持笔记

---

## 三、目标用户

### 核心用户画像

**开发者 Hojong**（Novi Notes 的开发者恰好就是典型用户）
- 每天使用 Claude Desktop / Claude Code 工作
- 在 TypeScript、Kotlin、Swift 等多语言间切换
- 痛点：对话内容散落各处，CLAUDE.md 和项目笔记版本控制困难
- 需求：一个地方统一管理所有 AI 产出，且支持 Git

### 用户分层

**第一层：CLI 开发者**（MVP 目标用户）
- 每天使用 Claude Code / CLI
- 熟悉 Git，有自己的 Git 服务
- 核心需求：对话自动备份到 Git，偶尔写笔记

**第二层：AI 重度用户**
- 使用 Claude Desktop、Cursor、GitHub Copilot 等多种 AI 工具
- 需要统一管理不同 AI 工具的对话记录
- 核心需求：多 Agent 支持，强搜索能力

**第三层：团队用户**
- 团队共用 Git 仓库管理 AI 知识
- 需要分享、协作、审计对话历史
- 核心需求：团队仓库、权限管理

---

## 四、产品架构

### 4.1 核心洞察：不需要守护进程

分析用户本机现有的"自动保存会话"机制后发现，Claude Code 自身已经提供了完整的自动化基础设施：

| Claude Code 机制 | 作用 | 我们如何利用 |
|-----------------|------|------------|
| **`CLAUDE.md` 指令** | Claude 每次对话都会读取并遵循 | 注入"自动保存对话记录"指令，让 Claude 主动将对话保存为文件 |
| **`settings.json` hooks** | 工具调用前后自动执行 shell 命令 | 注入 PostToolUse hook，文件写入后自动 git commit & push |
| **`~/.claude.json` mcpServers** | 注册 MCP 工具供 Claude 调用 | 注册搜索/笔记 MCP Server |

**这意味着：`gitmemo init` 只需要注入配置，不需要启动任何后台进程。**

### 4.2 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                    Claude Code 会话                       │
│                                                          │
│  ┌────────────────────┐  ┌─────────────────────────────┐ │
│  │ CLAUDE.md 指令      │  │ MCP Server                  │ │
│  │                    │  │ (gitmemo mcp-serve)  │ │
│  │ "每次回答后自动将   │  │                             │ │
│  │  对话保存为 MD 文件" │  │  search()  - 搜索对话/笔记  │ │
│  │                    │  │  note()    - 创建笔记       │ │
│  │ Claude 读取并遵循   │  │  daily()   - 每日笔记       │ │
│  │ → 调用 Write 工具   │  │  manual()  - 创建手册       │ │
│  │ → 保存到本地仓库    │  │  stats()   - 统计信息       │ │
│  └─────────┬──────────┘  └─────────────┬───────────────┘ │
│            │ Write/Edit                 │ Write/Edit      │
│            ▼                            ▼                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ PostToolUse Hook (settings.json)                     │ │
│  │                                                      │ │
│  │ 当 Write/Edit 触发且目标在仓库目录内时：               │ │
│  │   → git add -A                                       │ │
│  │   → git commit -m "auto: save {filename}"            │ │
│  │   → git push origin main                             │ │
│  └──────────────────────────┬───────────────────────────┘ │
└─────────────────────────────┼────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │  本地 Git 仓库           │
                │  ~/.gitmemo/     │
                │                         │
                │  conversations/  notes/ │
                └────────────┬────────────┘
                             │ auto push
                             ▼
                ┌─────────────────────────┐
                │  远程 Git 仓库           │
                │  github/gitee/自建      │
                └─────────────────────────┘
```

### 4.3 三个注入点的详细设计

#### 注入点 1：CLAUDE.md 指令（自动记录对话）

`init` 命令会在 `~/.claude/CLAUDE.md` 中追加以下内容：

```markdown
## GitMemo - 自动对话记录

每次对话结束时（用户发送新问题前），自动将本轮对话保存为 Markdown 文件。

**保存位置**：`~/.gitmemo/conversations/{YYYY-MM}/{MM-DD}-{标题摘要}.md`

**文件格式**：
- 顶部包含元数据（时间、模型、消息数）
- 按 User/Assistant 轮次记录完整对话
- 代码块保留原始格式

**规则**：
- 同一会话的追问追加到已有文件
- 新会话创建新文件
- 静默保存，不告知用户
- 标题从对话内容自动生成，不超过 20 字
```

**为什么这样设计**：
- 利用了你本机已验证的"自动保存会话记录"模式（CLAUDE.md 第76-105行）
- Claude 天然支持这种指令，不需要额外代码
- 对话记录的质量由 Claude 自身保证（它理解对话结构）

#### 注入点 2：settings.json Hook（自动 Git 同步）

`init` 命令会在 `~/.claude/settings.json` 的 `hooks.PostToolUse` 中追加：

```json
{
  "matcher": "Write|Edit",
  "hooks": [{
    "type": "command",
    "async": true,
    "command": "FILE=$(cat /dev/stdin | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))\" 2>/dev/null); SYNC_DIR=\"$HOME/.gitmemo\"; if echo \"$FILE\" | grep -q \"^$SYNC_DIR/\"; then cd \"$SYNC_DIR\" && git add -A && git commit -m \"auto: save $(basename \"$FILE\")\" && git push origin main 2>/dev/null; fi"
  }]
}
```

**工作原理**：
1. Hook 监听所有 `Write|Edit` 工具调用
2. 从 stdin 提取被写入的文件路径
3. 判断文件是否在 `~/.gitmemo/` 目录下
4. 如果是，自动 `git add && git commit && git push`
5. `async: true` 确保不阻塞 Claude 的响应

**为什么这样设计**：
- 与你本机现有的 PostToolUse hook（settings.json 第18-29行）完全一致
- 已验证的模式，稳定可靠
- 无需守护进程，无需额外资源

#### 注入点 3：MCP Server（搜索与笔记）

`init` 命令会在 `~/.claude.json` 的 `mcpServers` 中注册：

```json
{
  "mcpServers": {
    "gitmemo": {
      "command": "gitmemo",
      "args": ["mcp-serve"],
      "type": "stdio"
    }
  }
}
```

**提供的 MCP 工具**：

| 工具名 | 参数 | 功能 |
|--------|------|------|
| `cds_search` | `query`, `type?` | 全文搜索对话和笔记 |
| `cds_recent` | `limit?` | 列出最近的对话 |
| `cds_note` | `content` | 创建便签 |
| `cds_daily` | `content` | 追加到今日笔记 |
| `cds_manual` | `title`, `content` | 创建手册文档 |
| `cds_stats` | - | 统计信息 |

**用户体验**：
```
用户: 帮我搜索上周关于 Docker 的对话
Claude: [调用 cds_search] 找到 3 条相关对话...

用户: 把这次对话的要点记到今天的日记里
Claude: [调用 cds_daily] 已追加到今日笔记。

用户: 创建一篇手册，总结我所有关于 K8s 的对话
Claude: [调用 cds_search → cds_manual] 已创建《Kubernetes 使用指南》。
```

### 4.4 安装流程（重新设计）

```bash
gitmemo init

┌─────────────────────────────────────────────────┐
│  GitMemo 初始化                          │
│                                                  │
│  第 1 步：配置 Git 仓库                           │
│  > git@github.com:user/my-ai-notes.git          │
│                                                  │
│  第 2 步：自动配置中...                            │
│    ✓ 本地仓库已创建: ~/.gitmemo/          │
│    ✓ SSH 密钥已生成                               │
│    ✓ CLAUDE.md 指令已注入                         │
│    ✓ Git 同步 Hook 已注入                         │
│    ✓ MCP Server 已注册                           │
│                                                  │
│  第 3 步：请将以下公钥添加到仓库的 Deploy Keys:    │
│  ssh-ed25519 AAAAC3Nza...kF3x                   │
│  添加完成后按回车...                               │
│                                                  │
│  ✓ 连接测试通过                                   │
│                                                  │
│  一切就绪！从现在起：                              │
│  • 对话将自动保存到 Git 仓库                       │
│  • 在 Claude 中说"搜索我的对话"即可检索            │
│  • 运行 gitmemo help 查看更多命令         │
└─────────────────────────────────────────────────┘
```

**安装做了什么，不做什么**：

| 做 | 不做 |
|----|------|
| ✅ 创建本地 Git 仓库 | ❌ 不启动守护进程 |
| ✅ 生成 SSH 密钥 | ❌ 不运行后台服务 |
| ✅ 注入 CLAUDE.md 指令 | ❌ 不占用系统资源 |
| ✅ 注入 settings.json hook | ❌ 不监听文件变化 |
| ✅ 注册 MCP Server | ❌ 不需要 launchd/systemd |

### 4.5 数据目录结构

与之前一致，不变：

```
~/.gitmemo/              # 工作目录（即 Git 仓库）
├── .git/                        # Git 数据
├── .sync-config.toml            # 同步配置
│
├── conversations/               # [自动] AI 对话记录
│   └── {YYYY-MM}/
│       └── {MM-DD}-{标题摘要}.md
│
├── notes/                       # [手动] 用户笔记
│   ├── daily/                   #   每日笔记
│   │   └── {YYYY-MM-DD}.md
│   ├── manual/                  #   手册/长期文档
│   │   └── {标题}.md
│   └── scratch/                 #   便签/临时想法
│       └── {标题}.md
│
└── .metadata/                   # 内部元数据（gitignore）
    └── index.db                 #   SQLite 搜索索引
```

### 4.6 与守护进程方案的对比

| 维度 | 守护进程方案（旧） | Hook 注入方案（新） |
|------|-----------------|-------------------|
| **安装复杂度** | 需要配置 launchd/systemd | 只需 `init` 一次 |
| **系统资源** | 常驻进程占用内存 | 零占用，按需触发 |
| **可靠性** | 进程可能崩溃需重启 | 随 Claude Code 生命周期 |
| **跨平台** | 每个 OS 需要不同的进程管理 | 所有平台统一 |
| **维护成本** | 需要进程监控和日志 | 几乎零维护 |
| **局限性** | 无 | 仅在 Claude Code 会话中生效 |

**局限性说明**：Hook 方案只在 Claude Code 运行时才会触发 git sync。但这恰好是我们的目标场景——用户在用 Claude Code 的时候，对话就会被记录和同步。不用 Claude Code 的时候不需要同步。

---

## 五、用户体验设计

### 5.1 安装与初始化

安装流程已在 4.4 节详细描述。核心原则：
- 只问一个问题：Git 仓库地址
- 其他全部自动完成
- 安装完成后**没有后台进程**，用户不需要管理任何服务

### 5.2 日常使用：对话自动记录

**用户视角**：什么都不用做。

```
用户正常使用 Claude CLI
  → Claude 遵循 CLAUDE.md 指令，自动调用 Write 保存对话
    → PostToolUse Hook 检测到写入，自动 git commit & push
      → 对话出现在远程 Git 仓库
```

**用户完全无感知，整个链路由 Claude Code 基础设施驱动。**

### 5.3 日常使用：主动写笔记

```bash
# 快速记一条便签
gitmemo note "今天发现 Rust 的 async trait 终于稳定了"

# 写今天的日记（打开编辑器）
gitmemo daily

# 创建一篇手册
gitmemo manual "Rust 异步编程指南"

# 让 Claude 帮你整理笔记（通过 MCP）
# 在 Claude 对话中直接说：
# "帮我把今天关于 Docker 的对话要点整理到笔记里"
```

### 5.4 搜索与回溯

```bash
# 搜索所有对话和笔记
gitmemo search "rust async"

  对话记录:
  1. [03-15] Rust 异步编程入门
     "...tokio 是 Rust 最流行的 async 运行时..."
  2. [03-19] Rust async trait 讨论
     "...async trait 在 Rust 1.82 中稳定..."

  笔记:
  1. [manual] Rust 异步编程指南
     "...使用 async/await 的最佳实践..."

# 查看最近的对话
gitmemo recent

# 查看统计
gitmemo stats
```

### 5.5 MCP 集成：让 Claude 读写你的笔记

配置 Claude Desktop/Code 的 MCP：
```json
{
  "mcpServers": {
    "gitmemo": {
      "command": "gitmemo",
      "args": ["mcp-server"]
    }
  }
}
```

然后在 Claude 对话中：
```
你: 帮我搜索上周关于 Docker 的对话
Claude: [调用 search_conversations] 找到 3 条相关对话...

你: 把这次对话的要点记到今天的日记里
Claude: [调用 append_daily_note] 已添加到今日笔记。

你: 创建一篇手册，总结我所有关于 K8s 的对话
Claude: [调用 create_manual] 已创建《Kubernetes 使用指南》...
```

**MCP 提供的工具**：

| 工具 | 描述 |
|------|------|
| `search` | 搜索对话和笔记 |
| `list_recent` | 列出最近的对话 |
| `get_conversation` | 获取某次对话全文 |
| `create_note` | 创建便签 |
| `append_daily` | 追加到今日笔记 |
| `create_manual` | 创建手册 |
| `get_stats` | 获取统计信息 |

---

## 六、功能分层

### 第 1 层：核心功能（MVP）

**必须有，否则产品没有意义**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| CLAUDE.md 指令注入 | 让 Claude 自动保存对话到本地仓库 | P0 |
| PostToolUse Hook 注入 | 文件写入后自动 git commit & push | P0 |
| `init` 命令 | 配置 Git 仓库 + 注入三个配置点 | P0 |
| SSH 密钥管理 | 自动生成并引导用户配置 | P0 |
| SSH 密钥管理 | 自动生成并引导用户配置 | P0 |

### 第 2 层：笔记功能

**让产品从"备份工具"升级为"知识管理工具"**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 便签 `note` | 一行命令快速记录 | P1 |
| 每日笔记 `daily` | 按日组织的笔记 | P1 |
| 手册 `manual` | 长期维护的文档 | P1 |
| MCP Server | 让 Claude 直接读写笔记和对话 | P1 |

### 第 3 层：增强功能

**提升体验，但不影响核心价值**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 全文搜索 `search` | 搜索所有对话和笔记 | P2 |
| 统计分析 `stats` | 对话频率、热门话题等 | P2 |
| 敏感信息过滤 | 自动脱敏 API Key 等 | P2 |
| 多 Agent 支持 | 支持 Cursor、Copilot 等 | P2 |

### 第 4 层：生态扩展

**长期愿景**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Web UI | 浏览器查看对话和笔记 | P3 |
| 团队协作 | 共享仓库、权限管理 | P3 |
| 插件系统 | 自定义捕获源和导出目标 | P3 |

---

## 七、竞品分析

### 全景对比

```
                    主动记录 ←────────────→ 自动记录
                        │                     │
            ┌───────────┼─────────────────────┼──────────┐
  本地存储  │  Obsidian  │                     │          │
            │  Bear      │                     │          │
            │  Novi Notes│                     │          │
            ├───────────┼─────────────────────┼──────────┤
  云端存储  │  Notion    │                     │          │
            │  Evernote  │                     │          │
            ├───────────┼─────────────────────┼──────────┤
  Git 同步  │            │            GitMemo     │
            │            │           ← 唯一占位 →         │
            └───────────┼─────────────────────┼──────────┘
                        │                     │
```

**GitMemo 独占的象限：Git 同步 + 自动记录 + 主动笔记**

### 逐一对比

| 维度 | Novi Notes | Obsidian | Notion | GitMemo |
|------|-----------|----------|--------|----------------|
| 对话自动记录 | ❌ | ❌ | ❌ | ✅ |
| 笔记功能 | ✅ 丰富 | ✅ 强大 | ✅ 全能 | ✅ 轻量 |
| Git 版本控制 | ❌ | ⚠️ 插件 | ❌ | ✅ 原生 |
| MCP 集成 | ✅ | ❌ | ❌ | ✅ |
| 跨平台 | ❌ Mac | ✅ | ✅ | ✅ |
| 开源 | ❌ | ❌ | ❌ | ✅ |
| 零配置 | ✅ | ⚠️ | ✅ | ⚠️ 需配 Git |
| 离线支持 | ✅ | ✅ | ❌ | ✅ |
| 价格 | 一次性买断 | 免费/付费 | 订阅 | 免费 |

### 核心差异化总结

1. **自动记录是杀手功能**：没有任何竞品做到了"对话自动备份到 Git"
2. **Git 原生**：不是"支持 Git"，而是"就是一个 Git 仓库"
3. **双模式**：自动记录 + 主动笔记，一个工具解决两个问题
4. **开源免费**：没有商业风险，社区驱动

---

## 八、产品原则

### 1. 后台优先，前台可选

对话记录必须自动、静默、零干扰。笔记功能是可选的增值。用户可以只用自动记录功能，永远不碰笔记功能，产品依然有价值。

### 2. Git 是用户界面

不需要专门的 GUI。`conversations/` 和 `notes/` 目录就是用户的数据，Markdown 文件就是用户的界面。用户可以用任何编辑器打开、用 `git log` 查看历史、用 `git diff` 对比变更。

### 3. 笔记功能保持轻量

我们不是要做另一个 Obsidian。笔记功能只提供三种类型（便签、日记、手册），不做双向链接、不做图谱、不做富文本。保持简单。

### 4. 数据格式人类可读

所有数据都是 Markdown 文件。不依赖私有格式。即使用户卸载了 GitMemo，数据依然可以用任何文本编辑器打开。

### 5. 配置最小化

只问用户一个问题：Git 仓库地址。其他一切都有合理的默认值。高级配置可选但不强制。

---

## 九、商业模式

### 9.1 定价策略

**核心产品：开源免费（MIT License）**

| 层级 | 内容 | 价格 |
|------|------|------|
| **开源版** | CLI 工具 + 自动记录 + Git 同步 + 笔记 + MCP Server | 免费 |
| **云端版**（未来） | 托管 Git 仓库 + Web UI + 全文搜索 + 数据统计 | $5/月 或 ¥29/月 |
| **团队版**（未来） | 共享仓库 + 权限管理 + 审计日志 + 优先支持 | $15/人/月 |

### 9.2 为什么选择开源免费

1. **降低获客成本**：开源社区自传播，无需广告投入
2. **建立信任**：用户可以审查代码，消除隐私疑虑
3. **参考 Novi Notes 教训**：一次性买断 ≠ 持续收入，独立开发者可持续性存疑
4. **云端增值空间**：开源版解决核心问题，云端版解决"懒得自己搭 Git"的用户

### 9.3 收入来源规划

| 阶段 | 收入来源 | 预期时间 |
|------|---------|---------|
| Phase 1-3 | 无收入，专注用户增长 | 0-3 个月 |
| Phase 4 | GitHub Sponsors / Open Collective | 3-6 个月 |
| Phase 5 | 云端托管版订阅 | 6-12 个月 |
| Phase 6 | 团队版 + 企业定制 | 12+ 个月 |

---

## 十、用户旅程图

### 10.1 完整用户旅程

```
发现 → 了解 → 安装 → 初始化 → 自动记录 → 主动使用 → 深度依赖
 │      │      │       │         │          │          │
 ▼      ▼      ▼       ▼         ▼          ▼          ▼

[发现]
 用户在 GitHub Trending / Hacker News / 技术社区看到推荐
 "自动备份 Claude 对话到 Git"引起兴趣
 ↓
[了解]
 访问 GitHub README，30 秒内理解产品价值
 看到"一行命令安装，零配置运行"
 ↓
[安装]  ← 关键节点：转化率目标 > 80%
 运行 brew install gitmemo 或 curl 安装
 耗时 < 30 秒
 ↓
[初始化]  ← 关键节点：完成率目标 > 90%
 运行 gitmemo init
 输入 Git 仓库地址 → 复制公钥到 Git 平台 → 完成
 耗时 < 3 分钟
 ↓
[自动记录]  ← 核心价值体现，用户无感知
 正常使用 Claude Code
 对话自动保存到 Git 仓库
 用户完全不知道后台发生了什么
 ↓
[主动使用]  ← 从"被动工具"变为"主动工具"
 某天想找之前 Claude 给的方案 → 搜索历史对话 → 找到了
 觉得好用 → 开始用笔记功能记录想法
 在 Claude 中直接说"搜索我的对话" → MCP 响应
 ↓
[深度依赖]  ← 留存关键
 Git 仓库积累了大量知识 → 不愿卸载
 推荐给同事 → 口碑传播
 团队开始共用仓库 → 升级团队版
```

### 10.2 关键节点转化目标

| 节点 | 用户行为 | 转化目标 | 失败风险 | 应对措施 |
|------|---------|---------|---------|---------|
| 发现 → 了解 | 点击 GitHub 链接 | CTR > 5% | README 不够吸引 | 精心设计 README，GIF 演示 |
| 了解 → 安装 | 执行安装命令 | > 60% | 安装太复杂 | 一行命令安装 |
| 安装 → 初始化 | 执行 init | > 80% | Git 配置太麻烦 | SSH 密钥自动生成，交互引导 |
| 初始化 → 自动记录 | 无需操作 | > 99% | Hook 注入失败 | init 时自动验证 |
| 自动记录 → 主动使用 | 首次搜索 | > 40% | 不知道有搜索功能 | init 完成后提示搜索命令 |
| 主动使用 → 深度依赖 | 7 日留存 | > 60% | 功能不够好 | 持续优化 MCP 体验 |

### 10.3 首次使用关键体验（FTUE）

**目标**：用户在 5 分钟内完成从"不知道这是什么"到"它已经在帮我工作了"的转变。

```
分钟 0:00  用户看到推荐，访问 GitHub
分钟 0:30  读完 README，决定试试
分钟 1:00  安装完成
分钟 1:30  运行 init，输入 Git 仓库地址
分钟 2:30  复制公钥到 GitHub Deploy Keys
分钟 3:00  init 完成，看到成功信息
分钟 3:30  继续正常使用 Claude（忘记了这个工具的存在）
分钟 5:00  对话结束，Git 仓库中出现了第一条记录
           → 用户感受："原来它真的在工作"
```

---

## 十一、技术选型建议

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | **Rust** | 跨平台、单二进制部署、MCP Server 性能好 |
| Git 操作 | `git2` crate | 原生 Git 操作，不依赖系统 git |
| 搜索索引 | SQLite FTS5 | 轻量、嵌入式、全文搜索 |
| MCP Server | JSON-RPC over stdio | 符合 MCP 协议标准 |
| CLI 框架 | `clap` | Rust 生态标准 |
| 配置格式 | TOML | Rust 生态标准，人类可读 |
| JSON 操作 | `serde_json` | 读写 settings.json / .claude.json |

**注意**：不再需要文件监控（`notify`）和守护进程（`launchd`/`systemd`），因为对话捕获由 CLAUDE.md 指令驱动，Git 同步由 PostToolUse Hook 驱动。

---

## 十二、开发路线图

### Phase 1：MVP（1 周）

**目标**：`init` 一次，对话自动备份到 Git

- [ ] `init` 命令：创建本地 Git 仓库 + 生成 SSH 密钥
- [ ] CLAUDE.md 指令注入：自动保存对话记录
- [ ] settings.json Hook 注入：Write/Edit 后自动 git commit & push
- [ ] `uninstall` 命令：清理注入的配置

**验收标准**：`init` → 正常使用 Claude → 对话自动出现在 Git 仓库

### Phase 2：笔记 + MCP（2 周）

**目标**：支持主动笔记，Claude 可以读写

- [ ] MCP Server 实现：搜索、笔记、统计
- [ ] MCP Server 自动注册到 `~/.claude.json`
- [ ] `note` / `daily` / `manual` CLI 命令
- [ ] 笔记与对话统一 Git 同步

**验收标准**：在 Claude 对话中可以搜索历史对话、创建笔记

### Phase 3：搜索与增强（2 周）

**目标**：提升检索和使用体验

- [ ] `search` 命令：全文搜索
- [ ] `stats` 命令：统计分析
- [ ] `recent` 命令：最近对话列表
- [ ] 敏感信息过滤

### Phase 4：多 Agent + 生态（持续）

- [ ] 支持 Cursor 对话记录
- [ ] 支持 GitHub Copilot Chat 记录
- [ ] Web UI
- [ ] 插件系统

---

## 十三、成功指标

### 北极星指标

**周活跃用户的 Git 仓库中，本周新增的对话记录数**

这个指标同时衡量了：用户是否在用（活跃）、自动记录是否在工作（新增记录）、Git 同步是否正常（仓库中有数据）。

### 关键指标

| 阶段 | 指标 | 目标 |
|------|------|------|
| MVP | 对话捕获成功率 | > 99%（CLAUDE.md 指令被正确执行） |
| MVP | Git 同步成功率 | > 99%（Hook 触发且推送成功） |
| MVP | init 成功率 | > 95%（配置注入无冲突） |
| Phase 2 | 笔记功能使用率 | > 30% 的用户使用过 |
| Phase 3 | MCP 工具调用次数 | 日均 > 5 次/活跃用户 |
| 6 个月 | GitHub Stars | > 1,000 |
| 6 个月 | 周活跃用户 | > 500 |

---

## 十四、风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Claude Code 更改 hooks/CLAUDE.md 机制 | 低 | 高 | 跟踪 Claude Code 更新日志，快速适配 |
| CLAUDE.md 指令被 Claude 忽略/误执行 | 中 | 中 | 精确的指令措辞 + 验证测试 |
| settings.json 格式变更 | 低 | 高 | init 时备份原配置，提供 uninstall 回滚 |
| Git push 频繁失败（网络） | 中 | 低 | Hook 是 async 的，失败不影响使用；下次写入时重试 |
| 用户已有 PostToolUse hook 冲突 | 中 | 中 | init 时检测并合并，而非覆盖 |
| 对话文件过大导致 Git 仓库膨胀 | 低 | 中 | 按月归档 + 可选 shallow clone |
| 隐私担忧（对话含敏感信息） | 高 | 高 | CLAUDE.md 指令中包含脱敏规则；支持 `.syncignore` |

---

## 附录 A：配置文件设计

```toml
# ~/.gitmemo/.sync-config.toml

[git]
remote = "git@github.com:user/my-ai-notes.git"
branch = "main"
push_interval_minutes = 15      # 推送间隔
commit_delay_seconds = 300      # 对话结束后多久提交

[capture]
watch_paths = ["~/.claude/"]    # 监控路径
exclude = ["*.tmp", "*.lock"]   # 排除文件

[notes]
default_editor = "$EDITOR"      # 默认编辑器
daily_template = ""             # 每日笔记模板（可选）

[security]
filter_patterns = [             # 自动脱敏规则
  "sk-[a-zA-Z0-9]{20,}",
  "ghp_[a-zA-Z0-9]{36}",
  "password\\s*=\\s*['\"].*?['\"]"
]
```

## 附录 B：Novi Notes 完整参考资料

**产品信息**：
- 名称：Novi Notes
- Tagline：基于 MCP 实现零配置的本地优先 Mac AI 笔记应用
- Product Hunt 投票：98 票
- 创建时间：2026-03-21

**开发者 Hojong 的核心观点**：
- 痛点：Claude 使用过程中 markdown 文件散落各处，版本控制困难
- 尝试过 Notion、Obsidian、Evernote、Bear、SimpleNote，都不满足
- 核心差异：MCP 原生集成、本地优先、一次性买断、为开发者工作流设计

**市场评价**：
- 精准切入开发者与 AI 协同工作时的碎片化知识管理痛点
- MCP 集成比传统 API/插件模式更优雅
- 挑战：市场教育（用户需理解 MCP 价值）、独立开发者可持续性
