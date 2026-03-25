# GitMemo — 开发环境与项目初始化

> 对应 SOP 阶段 2.2-2.3：开发环境搭建 + 项目初始化

---

## 1. 代码仓库

### 1.1 仓库信息

| 项目 | 值 |
|------|---|
| 仓库名 | `gitmemo` |
| 托管平台 | GitHub（主仓库）+ Gitee（镜像） |
| 开源协议 | MIT |
| 默认分支 | `main` |
| 语言 | Rust |

### 1.2 .gitignore

```gitignore
# Rust
/target/
**/*.rs.bk
Cargo.lock

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test artifacts
/tests/fixtures/tmp/

# Release binaries
/dist/
```

**注意**：`Cargo.lock` 对于二进制项目应该提交，但在开发初期可以先 gitignore，稳定后加入。

---

## 2. 项目结构

```
gitmemo/
├── Cargo.toml                  # 项目配置 + 依赖
├── Cargo.lock
├── LICENSE                     # MIT
├── README.md
├── .gitignore
│
├── docs/                       # 产品 & 技术文档
│   ├── product-design.md
│   ├── technical-architecture.md
│   └── dev-setup.md            # 本文档
│
├── src/
│   ├── main.rs                 # 入口点 + CLI 命令分发
│   ├── cli/
│   │   ├── mod.rs              # CLI 命令定义 (clap)
│   │   ├── init.rs             # init 子命令实现
│   │   ├── uninstall.rs        # uninstall 子命令
│   │   ├── note.rs             # note/daily/manual 子命令
│   │   ├── search.rs           # search/recent/stats 子命令
│   │   └── status.rs           # status 子命令
│   │
│   ├── inject/
│   │   ├── mod.rs
│   │   ├── claude_md.rs        # CLAUDE.md 指令注入/移除
│   │   ├── settings_hook.rs    # settings.json Hook 注入/移除
│   │   └── mcp_register.rs     # MCP Server 注册/移除
│   │
│   ├── mcp/
│   │   ├── mod.rs
│   │   ├── server.rs           # MCP Server 主循环 (stdio JSON-RPC)
│   │   ├── tools.rs            # MCP 工具实现
│   │   └── types.rs            # MCP 协议类型定义
│   │
│   ├── storage/
│   │   ├── mod.rs
│   │   ├── database.rs         # SQLite 操作（建表、查询、索引）
│   │   ├── files.rs            # Markdown 文件读写
│   │   └── git.rs              # Git 操作（init、commit、push）
│   │
│   ├── models/
│   │   ├── mod.rs
│   │   ├── conversation.rs     # 对话数据结构
│   │   └── note.rs             # 笔记数据结构
│   │
│   └── utils/
│       ├── mod.rs
│       ├── config.rs           # 配置文件读写
│       ├── ssh.rs              # SSH 密钥生成
│       └── sanitize.rs         # 敏感信息过滤
│
├── tests/
│   ├── init_test.rs            # init 命令集成测试
│   ├── inject_test.rs          # 配置注入测试
│   ├── mcp_test.rs             # MCP Server 测试
│   └── fixtures/
│       ├── sample_claude_md.md
│       ├── sample_settings.json
│       └── sample_conversation.md
│
└── scripts/
    ├── install.sh              # curl 安装脚本
    └── release.sh              # 多平台编译 + 发布
```

---

## 3. 依赖清单

### 3.1 Cargo.toml

```toml
[package]
name = "gitmemo"
version = "0.1.0"
edition = "2021"
description = "Auto-sync your AI conversations and notes to Git"
license = "MIT"
repository = "https://github.com/sahadev/GitMemo"

[[bin]]
name = "gitmemo"
path = "src/main.rs"

[dependencies]
# CLI
clap = { version = "4", features = ["derive"] }
dialoguer = "0.11"              # 交互式输入
console = "0.15"                # 终端美化

# 异步
tokio = { version = "1", features = ["rt", "macros", "io-std", "io-util"] }

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"

# Git
git2 = "0.19"

# 数据库
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }

# 时间
chrono = { version = "0.4", features = ["serde"] }

# 文件操作
dirs = "5"                      # 跨平台获取 home 目录
walkdir = "2"                   # 目录递归遍历

# 哈希
sha2 = "0.10"

# SSH 密钥
ssh-key = { version = "0.6", features = ["ed25519"] }
rand = "0.8"

# 错误处理
anyhow = "1"
thiserror = "1"

# 日志
tracing = "0.1"
tracing-subscriber = "0.3"

[dev-dependencies]
tempfile = "3"                  # 测试用临时目录
assert_cmd = "2"                # CLI 集成测试
predicates = "3"                # 断言库
```

### 3.2 依赖选择理由

| 依赖 | 用途 | 为什么选它 |
|------|------|-----------|
| `clap` | CLI 命令解析 | Rust 生态标准，derive 模式开发快 |
| `git2` | Git 操作 | libgit2 绑定，不依赖系统 git 命令 |
| `rusqlite` (bundled) | SQLite | 内嵌 SQLite，不依赖系统库 |
| `serde_json` | JSON 读写 | 操作 settings.json / .claude.json |
| `dialoguer` | 交互式输入 | init 时的用户交互 |
| `ssh-key` | SSH 密钥生成 | 纯 Rust 实现，不依赖 ssh-keygen |
| `tokio` | 异步运行时 | MCP Server stdio 通信需要异步 IO |

---

## 4. CI/CD 配置

### 4.1 GitHub Actions

**`.github/workflows/ci.yml`**：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        rust: [stable]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cargo test --all-features
      - run: cargo clippy -- -D warnings
      - run: cargo fmt --check

  release:
    needs: test
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            binary: gitmemo
          - os: macos-latest
            target: aarch64-apple-darwin
            binary: gitmemo
          - os: macos-latest
            target: x86_64-apple-darwin
            binary: gitmemo
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            binary: gitmemo.exe
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      - run: cargo build --release --target ${{ matrix.target }}
      - uses: softprops/action-gh-release@v2
        with:
          files: target/${{ matrix.target }}/release/${{ matrix.binary }}
```

### 4.2 发布流程

```bash
# 1. 更新版本号
# 修改 Cargo.toml 中的 version

# 2. 提交并打 tag
git commit -am "release: v0.1.0"
git tag v0.1.0
git push origin main --tags

# 3. GitHub Actions 自动：
#    - 运行测试
#    - 编译三平台二进制
#    - 创建 GitHub Release
#    - 上传二进制文件
```

---

## 5. 代码规范

### 5.1 Rust 规范

- **格式化**：`rustfmt`，使用默认配置
- **Lint**：`clippy`，CI 中 `-D warnings`（所有警告视为错误）
- **命名**：遵循 Rust 标准（snake_case 函数/变量，CamelCase 类型）
- **错误处理**：库内用 `thiserror`，应用层用 `anyhow`

### 5.2 Git 提交规范

```
<type>: <description>

type 可选值：
  feat:     新功能
  fix:      Bug 修复
  refactor: 重构
  docs:     文档
  test:     测试
  chore:    构建/工具
  release:  发版
```

示例：
```
feat: implement init command with SSH key generation
fix: handle existing PostToolUse hooks in settings.json
docs: add user journey map to product design
```

### 5.3 测试规范

- **单元测试**：与源文件同目录，`#[cfg(test)] mod tests`
- **集成测试**：`tests/` 目录，测试 CLI 命令端到端行为
- **测试覆盖**：核心模块（inject、storage）要求 > 80% 覆盖率
- **测试隔离**：使用 `tempfile` 创建临时目录，不污染真实配置

---

## 6. 开发环境要求

### 6.1 必备工具

| 工具 | 版本要求 | 安装方式 |
|------|---------|---------|
| Rust toolchain | stable (>= 1.75) | `rustup install stable` |
| Git | >= 2.30 | 系统自带或 brew install |
| SQLite 开发库 | 不需要 | rusqlite bundled 模式自带 |

### 6.2 可选工具

| 工具 | 用途 |
|------|------|
| `cargo-watch` | 文件变化时自动重编译：`cargo watch -x test` |
| `cargo-nextest` | 更快的测试运行器 |
| `cargo-release` | 自动化发版流程 |

### 6.3 本地开发流程

```bash
# 克隆仓库
git clone git@github.com:sahadev/GitMemo.git
cd gitmemo

# 编译
cargo build

# 运行测试
cargo test

# 本地运行
cargo run -- init
cargo run -- note "测试笔记"
cargo run -- search "test"

# 测试 MCP Server（手动输入 JSON-RPC）
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | cargo run -- mcp-serve
```

---

## 7. MVP 开发任务拆解

### Phase 1（1 周）

| 天 | 任务 | 验收标准 |
|----|------|---------|
| D1 | 搭建项目骨架 + CLI 命令定义 | `cargo run -- help` 显示所有命令 |
| D2 | 实现 `init`：Git 仓库创建 + SSH 密钥生成 | 本地仓库可以 push 到远程 |
| D3 | 实现 `init`：CLAUDE.md 指令注入 + settings.json Hook 注入 | Claude 对话后自动保存 + 自动 push |
| D4 | 实现 `uninstall` + 配置备份恢复 | 注入的配置可以干净移除 |
| D5 | 集成测试 + Bug 修复 + README | 端到端流程跑通 |

### Phase 2（2 周）

| 天 | 任务 | 验收标准 |
|----|------|---------|
| D1-2 | SQLite 数据库 + 索引构建 | Markdown 文件可以被索引 |
| D3-4 | MCP Server 实现 | `cds_search` / `cds_recent` 可用 |
| D5-6 | 笔记命令（note/daily/manual） | CLI 创建笔记并自动同步 |
| D7-8 | MCP 笔记工具 | Claude 中可以创建笔记 |
| D9-10 | 测试 + 文档 + 发布准备 | 所有功能测试通过 |
