# GitMemo

> 你的 AI 对话与笔记，自动备份到 Git

GitMemo 自动记录你与 Claude 的每一次对话，同时支持你随时创建笔记，所有内容通过 Git 同步，数据完全属于你。

## 特性

- **自动记录** — 对话自动保存为 Markdown，用户零感知
- **笔记功能** — 便签、每日笔记、手册，一行命令创建
- **Git 同步** — 自动 commit & push，版本控制、跨设备访问
- **MCP 集成** — 在 Claude 中直接搜索历史对话、创建笔记
- **零进程** — 不启动后台服务，利用 Claude Code 原生 hooks 驱动
- **数据主权** — 数据存储在你自己的 Git 仓库，完全可控

## 工作原理

GitMemo 不是一个后台服务，而是通过注入 Claude Code 的配置来工作：

| 注入点 | 作用 |
|--------|------|
| `CLAUDE.md` 指令 | Claude 遵循指令，每次对话后自动保存为 Markdown |
| `settings.json` Hook | 文件写入后自动 `git commit && git push` |
| MCP Server | 让 Claude 能搜索历史对话、创建笔记 |

## 快速开始

### 安装

```bash
# 从源码编译安装
cargo install --path .

# 或下载预编译二进制
curl -fsSL https://github.com/sahadev/GitMemo/releases/latest/download/gitmemo-aarch64-apple-darwin -o /usr/local/bin/gitmemo
chmod +x /usr/local/bin/gitmemo
```

### 初始化

```bash
# 全新开始
gitmemo init

# 或使用已有的本地 Git 仓库
gitmemo init --path ~/Documents/my-notes
```

按提示输入 Git 仓库地址（已有仓库会自动检测），将生成的 SSH 公钥添加到仓库的 Deploy Keys，完成。

### 就这样

从现在起，你的 Claude 对话会自动保存到 Git 仓库。不需要任何额外操作。

## 命令

```
gitmemo init               # 初始化配置
gitmemo status             # 查看状态
gitmemo note "记个笔记"     # 创建便签
gitmemo daily              # 今日笔记
gitmemo manual "Rust 指南"  # 创建手册
gitmemo search "docker"    # 搜索对话和笔记
gitmemo recent             # 最近的对话
gitmemo stats              # 统计信息
gitmemo uninstall          # 移除配置（保留数据）
```

## 数据结构

```
~/.gitmemo/
├── conversations/          # 自动记录的 AI 对话
│   └── 2026-03/
│       └── 03-23-rust-async.md
├── notes/                  # 用户笔记
│   ├── daily/              # 每日笔记
│   ├── manual/             # 手册
│   └── scratch/            # 便签
└── .metadata/              # 搜索索引（不同步）
```

所有数据都是 Markdown 文件，可以用任何编辑器打开。

## 卸载

```bash
# 移除配置，保留数据
gitmemo uninstall

# 移除配置 + 删除数据
gitmemo uninstall --remove-data
```

## 开发

```bash
cargo build
cargo test
cargo run -- help
```

## License

MIT
