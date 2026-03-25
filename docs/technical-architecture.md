# GitMemo — 技术架构文档

> 对应 SOP 阶段 2.1：技术架构设计

---

## 1. 系统架构

### 1.1 架构概述

GitMemo 不是一个独立运行的服务，而是**寄生在 Claude Code 基础设施上的配置注入工具**。

它由三部分组成：
1. **CLI 工具**（`gitmemo` 二进制）：负责 init、笔记命令、MCP Server
2. **CLAUDE.md 指令**：注入到 Claude 的 prompt 中，驱动自动对话记录
3. **PostToolUse Hook**：注入到 Claude Code harness 中，驱动自动 Git 同步

### 1.2 组件关系图

```
┌─────────────────────────────────────────────────────────────┐
│                     gitmemo 二进制                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ init     │  │ note     │  │ search   │  │ mcp-serve   │ │
│  │ 子命令    │  │ daily    │  │ recent   │  │ MCP Server  │ │
│  │          │  │ manual   │  │ stats    │  │ (stdio)     │ │
│  │ 注入配置  │  │ 笔记命令  │  │ CLI 搜索  │  │ 供 Claude   │ │
│  │ 生成密钥  │  │ 写入本地  │  │ 查询索引  │  │ 调用        │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                   操作的数据存储
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  ~/.gitmemo/  (本地 Git 仓库)                        │
│                                                              │
│  conversations/    notes/         .metadata/                 │
│  ├── 2026-03/      ├── daily/     ├── index.db (SQLite)     │
│  │   └── *.md      ├── manual/    └── config.toml           │
│  └── 2026-04/      └── scratch/                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 数据库设计

### 2.1 选型：SQLite + FTS5

- **SQLite**：嵌入式，无需额外服务，单文件存储
- **FTS5**：SQLite 全文搜索扩展，支持中英文搜索
- **存储位置**：`~/.gitmemo/.metadata/index.db`（在 `.gitignore` 中，不同步）

### 2.2 Schema

```sql
-- 对话记录索引
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,                    -- 文件名哈希
    file_path   TEXT NOT NULL UNIQUE,                -- 相对路径: conversations/2026-03/03-23-xxx.md
    title       TEXT NOT NULL,                       -- 对话标题
    created_at  TEXT NOT NULL,                       -- ISO 8601 格式
    updated_at  TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,                 -- 消息轮次数
    model       TEXT,                                -- 使用的模型
    content_hash TEXT NOT NULL                        -- 内容 SHA256，用于去重
);

CREATE INDEX idx_conv_created ON conversations(created_at);
CREATE INDEX idx_conv_title ON conversations(title);

-- 笔记索引
CREATE TABLE notes (
    id          TEXT PRIMARY KEY,
    file_path   TEXT NOT NULL UNIQUE,                -- 相对路径: notes/daily/2026-03-23.md
    type        TEXT NOT NULL CHECK(type IN ('daily', 'manual', 'scratch')),
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    content_hash TEXT NOT NULL
);

CREATE INDEX idx_notes_type ON notes(type);
CREATE INDEX idx_notes_created ON notes(created_at);

-- 全文搜索虚拟表（对话 + 笔记统一搜索）
CREATE VIRTUAL TABLE search_index USING fts5(
    source_type,     -- 'conversation' | 'note'
    source_id,       -- 关联到 conversations.id 或 notes.id
    title,
    content,         -- 全文内容
    tokenize='unicode61'
);

-- 同步日志
CREATE TABLE sync_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL,
    action      TEXT NOT NULL CHECK(action IN ('commit', 'push', 'pull')),
    status      TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    message     TEXT,
    error       TEXT
);

CREATE INDEX idx_sync_timestamp ON sync_log(timestamp);
```

### 2.3 索引构建策略

- **初次构建**：`init` 时扫描仓库中已有的 Markdown 文件，批量建立索引
- **增量更新**：MCP Server 启动时检查文件变化（比对 content_hash），增量更新
- **重建**：`gitmemo reindex` 命令可以全量重建索引

---

## 3. MCP 接口设计

### 3.1 MCP Server 协议

遵循 [Model Context Protocol](https://modelcontextprotocol.io/) 标准，通过 stdio 通信。

**启动方式**：
```bash
gitmemo mcp-serve
```

**注册配置**（写入 `~/.claude.json`）：
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

### 3.2 工具定义

#### `cds_search` — 搜索对话和笔记

```json
{
  "name": "cds_search",
  "description": "搜索用户的历史 AI 对话和笔记。当用户说'搜索我的对话'、'找一下之前关于 X 的讨论'、'我之前问过什么'时使用。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "搜索关键词"
      },
      "type": {
        "type": "string",
        "enum": ["all", "conversation", "note"],
        "description": "搜索范围，默认 all"
      },
      "limit": {
        "type": "number",
        "description": "返回结果数量，默认 10"
      }
    },
    "required": ["query"]
  }
}
```

**返回格式**：
```json
{
  "results": [
    {
      "type": "conversation",
      "title": "Rust 异步编程入门",
      "date": "2026-03-15",
      "snippet": "...tokio 是 Rust 最流行的 async 运行时...",
      "file_path": "conversations/2026-03/03-15-rust-async.md"
    }
  ],
  "total": 3
}
```

#### `cds_recent` — 列出最近的对话

```json
{
  "name": "cds_recent",
  "description": "列出最近的 AI 对话记录。当用户说'最近的对话'、'看看历史'时使用。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "description": "返回数量，默认 10"
      },
      "days": {
        "type": "number",
        "description": "最近几天，默认 7"
      }
    }
  }
}
```

#### `cds_read` — 读取对话或笔记全文

```json
{
  "name": "cds_read",
  "description": "读取某条对话或笔记的完整内容。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "文件相对路径，从 cds_search 或 cds_recent 的结果中获取"
      }
    },
    "required": ["file_path"]
  }
}
```

#### `cds_note` — 创建便签

```json
{
  "name": "cds_note",
  "description": "创建一条便签笔记。当用户说'记一下'、'保存这个想法'时使用。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "笔记内容，Markdown 格式"
      },
      "title": {
        "type": "string",
        "description": "标题，可选，不提供则从内容生成"
      }
    },
    "required": ["content"]
  }
}
```

#### `cds_daily` — 追加到今日笔记

```json
{
  "name": "cds_daily",
  "description": "追加内容到今天的日记。当用户说'记到今天的日记里'、'今日总结'时使用。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "要追加的内容"
      }
    },
    "required": ["content"]
  }
}
```

#### `cds_manual` — 创建或追加手册

```json
{
  "name": "cds_manual",
  "description": "创建或追加到手册文档。当用户说'创建一篇手册'、'整理成文档'时使用。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "手册标题"
      },
      "content": {
        "type": "string",
        "description": "手册内容，Markdown 格式"
      },
      "append": {
        "type": "boolean",
        "description": "是否追加到已有同名手册，默认 false"
      }
    },
    "required": ["title", "content"]
  }
}
```

#### `cds_stats` — 统计信息

```json
{
  "name": "cds_stats",
  "description": "获取对话和笔记的统计信息。当用户问'我用了多少次 Claude'、'统计一下'时使用。",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**返回格式**：
```json
{
  "conversations": {
    "total": 42,
    "this_week": 8,
    "this_month": 25
  },
  "notes": {
    "daily": 15,
    "manual": 5,
    "scratch": 12
  },
  "storage": {
    "total_files": 74,
    "total_size_mb": 15.3
  },
  "last_sync": {
    "timestamp": "2026-03-23T14:30:00Z",
    "status": "success"
  }
}
```

---

## 4. CLI 命令设计

### 4.1 命令列表

```
gitmemo <command> [options]

Commands:
  init          初始化配置（Git 仓库 + 注入 Claude Code 配置）
  uninstall     移除注入的配置，保留数据
  note <text>   创建便签
  daily         打开/追加今日笔记
  manual <title> 创建手册
  search <query> 搜索对话和笔记
  recent        列出最近的对话
  stats         显示统计信息
  reindex       重建搜索索引
  mcp-serve     启动 MCP Server（由 Claude Code 自动调用）
  status        显示配置和同步状态
  help          显示帮助信息
```

### 4.2 `init` 命令详细流程

```
gitmemo init [--git-url <url>] [--no-mcp]

流程：
1. 检查 ~/.gitmemo/ 是否已存在
   → 已存在：提示是否覆盖
   → 不存在：创建目录

2. 交互式输入 Git 仓库地址（或 --git-url 传入）

3. 初始化本地 Git 仓库
   → git init ~/.gitmemo/
   → 创建 conversations/ notes/daily/ notes/manual/ notes/scratch/ .metadata/
   → 创建 .gitignore（排除 .metadata/）
   → git remote add origin <url>

4. 生成 SSH 密钥
   → ssh-keygen -t ed25519 -f ~/.gitmemo/.ssh/id_ed25519 -N ""
   → 显示公钥，提示用户添加到 Git 平台

5. 等待用户确认 → 测试连接
   → git ls-remote origin

6. 注入 CLAUDE.md 指令
   → 读取 ~/.claude/CLAUDE.md
   → 追加对话记录指令块（带标记注释，方便 uninstall 移除）

7. 注入 PostToolUse Hook
   → 读取 ~/.claude/settings.json
   → 在 hooks.PostToolUse 数组中追加新的 hook 条目
   → 保留已有 hook，不覆盖

8. 注册 MCP Server（除非 --no-mcp）
   → 读取 ~/.claude.json
   → 在 mcpServers 中添加 gitmemo 条目

9. 初始提交
   → git add -A && git commit -m "init: gitmemo"
   → git push origin main

10. 显示完成信息
```

### 4.3 `uninstall` 命令详细流程

```
gitmemo uninstall [--remove-data]

流程：
1. 从 ~/.claude/CLAUDE.md 移除标记的指令块
2. 从 ~/.claude/settings.json 移除注入的 hook
3. 从 ~/.claude.json 移除 MCP Server 注册
4. 如果 --remove-data：删除 ~/.gitmemo/ 目录
5. 否则：保留数据，仅移除配置注入
```

---

## 5. 配置注入安全设计

### 5.1 注入标记

所有注入的内容都用特殊标记包裹，方便识别和移除：

**CLAUDE.md 注入标记**：
```markdown
<!-- [gitmemo:start] -->
## GitMemo - 自动对话记录
...
<!-- [gitmemo:end] -->
```

**settings.json Hook 标识**：
在 hook 对象中添加 `_source` 字段（Claude Code 会忽略未知字段）：
```json
{
  "_source": "gitmemo",
  "matcher": "Write|Edit",
  "hooks": [...]
}
```

### 5.2 冲突处理

**CLAUDE.md 冲突**：
- init 前检查是否已有 `[gitmemo:start]` 标记
- 如有：替换旧版本
- 如无：追加到文件末尾

**settings.json Hook 冲突**：
- 读取现有 PostToolUse 数组
- 检查是否已有 `_source: "gitmemo"` 的条目
- 如有：替换
- 如无：追加到数组中（不影响已有 hook）

**~/.claude.json MCP 冲突**：
- 检查 mcpServers 中是否已有 `gitmemo` key
- 如有：替换
- 如无：添加

### 5.3 备份策略

init 前自动备份被修改的文件：
```
~/.gitmemo/.backups/
├── CLAUDE.md.backup              # init 前的 CLAUDE.md
├── settings.json.backup          # init 前的 settings.json
└── claude.json.backup            # init 前的 .claude.json
```

uninstall 时如果恢复失败，可以从 backup 手动恢复。

---

## 6. Markdown 文件格式规范

### 6.1 对话记录格式

**文件名**：`{MM-DD}-{标题摘要}.md`（最长 50 字符）
**存储位置**：`conversations/{YYYY-MM}/`

```markdown
---
title: Rust 异步编程入门
date: 2026-03-23 14:30:00
model: claude-opus-4-6
messages: 12
---

# Rust 异步编程入门

### User (14:30:05)

我想了解 Rust 的异步编程，应该从哪里开始？

### Assistant (14:30:12)

Rust 的异步编程主要基于 `async`/`await` 语法和 `Future` trait...

```rust
async fn hello() {
    println!("hello");
}
```

### User (14:32:30)

tokio 和 async-std 该选哪个？

### Assistant (14:32:45)

推荐使用 tokio，它是生态最成熟的异步运行时...
```

### 6.2 每日笔记格式

**文件名**：`{YYYY-MM-DD}.md`
**存储位置**：`notes/daily/`

```markdown
---
date: 2026-03-23
---

# 2026-03-23

## 14:30 - Rust async trait 终于稳定了

今天发现 Rust 1.82 正式稳定了 async trait，不再需要 async-trait 宏。

## 16:00 - Docker 网络问题排查

容器间通信失败，原因是自定义 bridge 网络的 DNS 配置问题...
```

### 6.3 手册格式

**文件名**：`{标题}.md`
**存储位置**：`notes/manual/`

```markdown
---
title: Rust 异步编程指南
created: 2026-03-23
updated: 2026-03-25
---

# Rust 异步编程指南

## 基础概念

...

## 最佳实践

...
```

### 6.4 便签格式

**文件名**：`{YYYY-MM-DD}-{序号}-{摘要}.md`
**存储位置**：`notes/scratch/`

```markdown
---
date: 2026-03-23 14:30:00
---

Rust 的 async trait 终于在 1.82 稳定了，不再需要 async-trait 宏。
迁移时注意：旧代码中的 `#[async_trait]` 可以直接删除。
```

---

## 7. 第三方服务依赖

| 服务 | 用途 | 必要性 | 替代方案 |
|------|------|--------|---------|
| Git 托管平台 | 远程仓库存储 | 必须 | GitHub / GitLab / Gitee / 自建 |
| Claude Code | 宿主环境 | 必须 | 无（产品依赖 Claude Code 基础设施） |
| SQLite | 本地搜索索引 | 必须 | 无（嵌入式，随二进制分发） |

**零外部依赖**：除了用户自己的 Git 服务和 Claude Code，不依赖任何第三方云服务。
