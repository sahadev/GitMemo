# Data & Storage Statement（数据与存储声明）

This document clarifies what GitMemo stores **in Git** versus what stays under **local `.metadata/`**, so expectations align with how retention works.

---

## English

### 1. Content retained in Git

Markdown and other tracked files under paths such as `conversations/`, `notes/`, `clips/`, `plans/`, `imports/`, and `claude-config/` are **your knowledge assets**. They are **version-controlled with Git** and, when you use a remote, are pushed there. Git is the source of truth for that content. Layout matches the “Data structure” section in [README.md](../README.md) / [README_CN.md](../README_CN.md).

### 2. What `.metadata/` is

Under the sync root (often `~/.gitmemo/`), **`.metadata/`** holds **local app data**, including:

| Path | Purpose |
|------|---------|
| `.metadata/config.toml` | GitMemo runtime configuration (sync path, remote-related settings, etc.) |
| `.metadata/index.db` | **Full-text search index** (SQLite), built from your Markdown and other files to speed up `gitmemo search` and Desktop search |

`.metadata/` is listed in the repo’s **`.gitignore`**, so it is **not committed** and **not pushed** to your remote (same idea as “search index (not synced)” in the README tree).

### 3. Relation to “complete retention”

**“Complete retention”** refers to **files that participate in your Git workflow**—persisted and auditable via Git—not every file on disk under `~/.gitmemo/`. The search index is **regenerable** with **`gitmemo reindex`**; it is auxiliary, not a substitute for content in Git.

### 4. Other ignored paths

Paths such as `.ssh/` and `.backups/` may also be ignored by design (see `create_directory_structure` in the repo). They are **not** user knowledge content in the Git sense.

---

## 中文

### 1. 由 Git 管理、用于「完整保留」的内容

以下目录中的文件（以 Markdown 等纯文本为主）属于 **GitMemo 面向用户的内容资产**，随你在 `gitmemo init` 中配置的仓库 **提交并推送**（若已配置远程）：

- `conversations/`、`notes/`、`clips/`、`plans/`、`imports/`、`claude-config/` 等（与 [README_CN.md](../README_CN.md)「数据结构」一致）。

这些内容由 **Git 版本化管理**；在正常使用 Git（含按需 `push`、远程备份）的前提下，不会因 GitMemo 应用卸载而单独「锁死」在专有数据库中——**持久性与可追溯性由 Git 承担**。

### 2. `.metadata/` 是什么（与上述内容不同类）

在同步根目录（通常为 `~/.gitmemo/`）下的 **`.metadata/`** 文件夹由 GitMemo **在本机创建与维护**，主要包括：

| 路径 | 用途 |
|------|------|
| `.metadata/config.toml` | GitMemo 运行配置（如同步路径、远程相关设置等） |
| `.metadata/index.db` | **全文搜索索引**（SQLite），由程序根据上述 Markdown 等文件构建，用于加速 `gitmemo search` 与桌面端搜索 |

根目录的 `.gitignore` 中包含 **`.metadata/`**，因此该目录 **默认不会进入你的 Git 提交**，也 **不会随 `push` 上传到远程仓库**（与 README 中「搜索索引（不同步）」的表述一致）。

### 3. 与「完整保留」表述的关系

- **「完整保留」所指**：GitMemo **纳入 Git 工作流管理** 的文件，其长期保存与历史追溯由 **Git** 保障；应用侧不替代 Git 成为唯一数据源。
- **`.metadata/` 的定位**：本机 **性能与配置辅助数据**；其中搜索索引在丢失或损坏时，可通过 **`gitmemo reindex`** 依据现有内容 **重新生成**，不属于与用户笔记/对话同级的「必须随仓库同步的资产」。

### 4. 其他被 `.gitignore` 排除的目录（简述）

同步根目录默认还会在 `.gitignore` 中忽略例如 `.ssh/`、`.backups/` 等（详见仓库内 `create_directory_structure` 实现），多为 **密钥或本地备份**，同样 **不进入 Git**；请勿将此类路径与「用户知识内容是否进仓库」混为一谈。

---

*This statement may change as the product evolves; the repository code and READMEs are authoritative.*  
*本声明随产品实现演进可能更新；以当前仓库代码与 README 为准。*
