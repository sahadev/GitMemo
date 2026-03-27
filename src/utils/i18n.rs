use std::sync::OnceLock;

/// Supported languages
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    En,
    Zh,
}

impl Lang {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "zh" | "zh-cn" | "chinese" => Lang::Zh,
            _ => Lang::En,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Zh => "zh",
        }
    }
}

/// Global i18n instance (initialized once per process)
static I18N: OnceLock<I18n> = OnceLock::new();

/// Get the global i18n instance, defaulting to English if not initialized
pub fn get() -> &'static I18n {
    I18N.get_or_init(|| I18n::new(Lang::En))
}

/// Initialize global i18n with a specific language
pub fn init(lang: Lang) {
    let _ = I18N.set(I18n::new(lang));
}

/// Initialize from config file (reads ~/.gitmemo/.metadata/config.toml)
pub fn init_from_config() {
    let config_path = crate::utils::config::Config::config_path();
    if config_path.exists() {
        if let Ok(config) = crate::utils::config::Config::load(&config_path) {
            let lang = Lang::from_str(&config.lang);
            init(lang);
            return;
        }
    }
    init(Lang::En);
}

#[derive(Debug)]
pub struct I18n {
    pub lang: Lang,
}

impl I18n {
    pub fn new(lang: Lang) -> Self {
        Self { lang }
    }

    // ── Init command ─────────────────────────────────────────

    pub fn init_title(&self) -> &str {
        match self.lang {
            Lang::En => "GitMemo Setup",
            Lang::Zh => "GitMemo 初始化",
        }
    }

    pub fn select_editor_prompt(&self) -> &str {
        match self.lang {
            Lang::En => "Select editor to configure",
            Lang::Zh => "选择要配置的编辑器",
        }
    }

    pub fn editor_options(&self) -> Vec<&str> {
        match self.lang {
            Lang::En => vec!["Claude Code", "Cursor", "Both"],
            Lang::Zh => vec!["Claude Code", "Cursor", "两者都安装"],
        }
    }

    #[allow(dead_code)]
    pub fn select_language_prompt(&self) -> &str {
        match self.lang {
            Lang::En => "Select language",
            Lang::Zh => "选择语言",
        }
    }

    pub fn unsupported_editor(&self, name: &str) -> String {
        match self.lang {
            Lang::En => format!("Unsupported editor: {}. Options: claude, cursor, all", name),
            Lang::Zh => format!("不支持的编辑器: {}。可选: claude, cursor, all", name),
        }
    }

    pub fn not_a_git_repo(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("{} is not a Git repository", path),
            Lang::Zh => format!("{} 不是一个 Git 仓库", path),
        }
    }

    pub fn linked_repo(&self) -> &str {
        match self.lang {
            Lang::En => "Linked to existing repo",
            Lang::Zh => "链接到已有仓库",
        }
    }

    pub fn detected_remote(&self) -> &str {
        match self.lang {
            Lang::En => "Detected existing remote",
            Lang::Zh => "检测到已有远程",
        }
    }

    pub fn git_url_prompt(&self) -> &str {
        match self.lang {
            Lang::En => "Git repository URL",
            Lang::Zh => "Git 仓库地址",
        }
    }

    pub fn dir_structure_ready(&self) -> &str {
        match self.lang {
            Lang::En => "Directory structure ready",
            Lang::Zh => "目录结构就绪",
        }
    }

    pub fn git_repo_ready(&self) -> &str {
        match self.lang {
            Lang::En => "Git repo ready",
            Lang::Zh => "Git 仓库就绪",
        }
    }

    pub fn ssh_key_generated(&self) -> &str {
        match self.lang {
            Lang::En => "SSH key generated",
            Lang::Zh => "SSH 密钥已生成",
        }
    }

    pub fn ssh_key_exists(&self) -> &str {
        match self.lang {
            Lang::En => "SSH key exists, skipped generation",
            Lang::Zh => "SSH 密钥已存在，跳过生成",
        }
    }

    pub fn configs_backed_up(&self) -> &str {
        match self.lang {
            Lang::En => "Original configs backed up",
            Lang::Zh => "原始配置已备份",
        }
    }

    pub fn claude_md_injected(&self) -> &str {
        match self.lang {
            Lang::En => "CLAUDE.md instructions injected",
            Lang::Zh => "CLAUDE.md 指令已注入",
        }
    }

    pub fn git_hook_injected(&self) -> &str {
        match self.lang {
            Lang::En => "Git sync hook injected",
            Lang::Zh => "Git 同步 Hook 已注入",
        }
    }

    pub fn claude_mcp_registered(&self) -> &str {
        match self.lang {
            Lang::En => "Claude MCP Server registered",
            Lang::Zh => "Claude MCP Server 已注册",
        }
    }

    pub fn save_skill_installed(&self) -> &str {
        match self.lang {
            Lang::En => "/save shortcut installed",
            Lang::Zh => "/save 快捷命令已安装",
        }
    }

    pub fn cursor_rules_injected(&self) -> &str {
        match self.lang {
            Lang::En => "Cursor Rules injected",
            Lang::Zh => "Cursor Rules 已注入",
        }
    }

    pub fn cursor_mcp_registered(&self) -> &str {
        match self.lang {
            Lang::En => "Cursor MCP Server registered",
            Lang::Zh => "Cursor MCP Server 已注册",
        }
    }

    pub fn deploy_key_hint(&self) -> &str {
        match self.lang {
            Lang::En => "Please add this public key to your repo's Deploy Keys (allow write access):",
            Lang::Zh => "请将以下公钥添加到仓库的 Deploy Keys（允许写入）：",
        }
    }

    pub fn all_set(&self) -> &str {
        match self.lang {
            Lang::En => "All set!",
            Lang::Zh => "一切就绪！",
        }
    }

    pub fn next_steps(&self) -> &str {
        match self.lang {
            Lang::En => "Next steps:",
            Lang::Zh => "下一步：",
        }
    }

    pub fn claude_next_step_1(&self) -> &str {
        match self.lang {
            Lang::En => "Try typing {} in Claude to save the current session (no restart needed)",
            Lang::Zh => "在 Claude 中输入 {} 试试保存当前会话（无需重启）",
        }
    }

    pub fn claude_next_step_2(&self) -> &str {
        match self.lang {
            Lang::En => "If /save doesn't work, restart the Claude session",
            Lang::Zh => "如果 /save 未生效，重启 Claude 会话即可",
        }
    }

    pub fn cursor_next_step_1(&self) -> &str {
        match self.lang {
            Lang::En => "{} Restart Cursor (to apply config)",
            Lang::Zh => "{} 重启 Cursor（使配置生效）",
        }
    }

    pub fn cursor_next_step_2(&self) -> &str {
        match self.lang {
            Lang::En => "Conversations will auto-sync to Git via MCP",
            Lang::Zh => "对话保存后会自动通过 MCP 同步到 Git",
        }
    }

    pub fn verify_heading(&self) -> &str {
        match self.lang {
            Lang::En => "Verify it works:",
            Lang::Zh => "验证是否生效：",
        }
    }

    pub fn verify_test(&self) -> &str {
        match self.lang {
            Lang::En => "manual test",
            Lang::Zh => "手动测试",
        }
    }

    pub fn verify_status(&self) -> &str {
        match self.lang {
            Lang::En => "check status",
            Lang::Zh => "查看状态",
        }
    }

    pub fn recommend(&self) -> &str {
        match self.lang {
            Lang::En => "Recommended",
            Lang::Zh => "建议",
        }
    }

    // ── Uninstall command ────────────────────────────────────

    pub fn uninstall_title(&self) -> &str {
        match self.lang {
            Lang::En => "GitMemo Uninstall",
            Lang::Zh => "GitMemo 卸载",
        }
    }

    pub fn claude_md_removed(&self) -> &str {
        match self.lang {
            Lang::En => "CLAUDE.md instructions removed",
            Lang::Zh => "CLAUDE.md 指令已移除",
        }
    }

    pub fn git_hook_removed(&self) -> &str {
        match self.lang {
            Lang::En => "Git sync hook removed",
            Lang::Zh => "Git 同步 Hook 已移除",
        }
    }

    pub fn claude_mcp_removed(&self) -> &str {
        match self.lang {
            Lang::En => "Claude MCP Server removed",
            Lang::Zh => "Claude MCP Server 已移除",
        }
    }

    pub fn save_skill_removed(&self) -> &str {
        match self.lang {
            Lang::En => "/save shortcut removed",
            Lang::Zh => "/save 快捷命令已移除",
        }
    }

    pub fn cursor_rules_removed(&self) -> &str {
        match self.lang {
            Lang::En => "Cursor Rules removed",
            Lang::Zh => "Cursor Rules 已移除",
        }
    }

    pub fn cursor_mcp_removed(&self) -> &str {
        match self.lang {
            Lang::En => "Cursor MCP Server removed",
            Lang::Zh => "Cursor MCP Server 已移除",
        }
    }

    pub fn data_deleted(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Data directory deleted: {}", path),
            Lang::Zh => format!("数据目录已删除: {}", path),
        }
    }

    pub fn data_preserved(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Data preserved at {}", path),
            Lang::Zh => format!("数据已保留在 {}", path),
        }
    }

    // ── Status command ───────────────────────────────────────

    pub fn status_title(&self) -> &str {
        match self.lang {
            Lang::En => "GitMemo Status",
            Lang::Zh => "GitMemo 状态",
        }
    }

    pub fn not_initialized(&self) -> &str {
        match self.lang {
            Lang::En => "Not initialized. Run {} to get started.",
            Lang::Zh => "未初始化。运行 {} 开始。",
        }
    }

    pub fn data_dir(&self) -> &str {
        match self.lang {
            Lang::En => "Data directory",
            Lang::Zh => "数据目录",
        }
    }

    pub fn git_remote(&self) -> &str {
        match self.lang {
            Lang::En => "Git remote",
            Lang::Zh => "Git 远程",
        }
    }

    pub fn git_branch(&self) -> &str {
        match self.lang {
            Lang::En => "Git branch",
            Lang::Zh => "Git 分支",
        }
    }

    pub fn conversations_count(&self) -> &str {
        match self.lang {
            Lang::En => "Conversations",
            Lang::Zh => "对话记录",
        }
    }

    pub fn notes_count(&self) -> &str {
        match self.lang {
            Lang::En => "Notes",
            Lang::Zh => "笔记",
        }
    }

    pub fn unpushed_commits(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("Unpushed: {} commits (run {} to push)", count, "gitmemo sync"),
            Lang::Zh => format!("未推送: {} 条提交（运行 {} 推送）", count, "gitmemo sync"),
        }
    }

    pub fn sync_ok(&self) -> &str {
        match self.lang {
            Lang::En => "Sync status: ✓ up to date",
            Lang::Zh => "同步状态: ✓ 已同步",
        }
    }

    // ── Sync command ─────────────────────────────────────────

    pub fn synced_to_git(&self) -> &str {
        match self.lang {
            Lang::En => "Synced to Git",
            Lang::Zh => "已同步到 Git",
        }
    }

    pub fn committed_push_failed(&self, err: &str) -> String {
        match self.lang {
            Lang::En => format!("Committed, but push failed: {}", err),
            Lang::Zh => format!("已提交，但推送失败: {}", err),
        }
    }

    pub fn retry_push_hint(&self) -> &str {
        match self.lang {
            Lang::En => "Run {} to retry push",
            Lang::Zh => "运行 {} 重试推送",
        }
    }

    pub fn committing(&self) -> &str {
        match self.lang {
            Lang::En => "Committed, pushing...",
            Lang::Zh => "已提交，推送中...",
        }
    }

    pub fn no_changes(&self) -> &str {
        match self.lang {
            Lang::En => "No changes to commit",
            Lang::Zh => "无变更需要提交",
        }
    }

    pub fn all_synced(&self) -> &str {
        match self.lang {
            Lang::En => "All synced, nothing to do",
            Lang::Zh => "一切已同步，无需操作",
        }
    }

    pub fn pushing_commits(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("{} unpushed commits, pushing...", count),
            Lang::Zh => format!("{} 条未推送的提交，正在推送...", count),
        }
    }

    pub fn pushed_commits(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("Pushed {} commits", count),
            Lang::Zh => format!("已推送 {} 条提交", count),
        }
    }

    pub fn push_failed(&self, err: &str) -> String {
        match self.lang {
            Lang::En => format!("Push failed: {}", err),
            Lang::Zh => format!("推送失败: {}", err),
        }
    }

    // ── Unpushed command ─────────────────────────────────────

    pub fn no_unpushed(&self) -> &str {
        match self.lang {
            Lang::En => "No unpushed commits",
            Lang::Zh => "没有未推送的提交",
        }
    }

    pub fn unpushed_heading(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("⚠ {} unpushed commits:", count),
            Lang::Zh => format!("⚠ {} 条未推送的提交：", count),
        }
    }

    pub fn push_hint(&self) -> &str {
        match self.lang {
            Lang::En => "Run {} to push to remote",
            Lang::Zh => "运行 {} 推送到远程",
        }
    }

    // ── Note commands ────────────────────────────────────────

    pub fn scratch_created(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Scratch note created: {}", path),
            Lang::Zh => format!("便签已创建: {}", path),
        }
    }

    pub fn daily_saved(&self) -> &str {
        match self.lang {
            Lang::En => "Today's note saved",
            Lang::Zh => "今日笔记已保存",
        }
    }

    pub fn daily_appended(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Appended to today's note: {}", path),
            Lang::Zh => format!("已追加到今日笔记: {}", path),
        }
    }

    pub fn content_empty(&self) -> &str {
        match self.lang {
            Lang::En => "Content is empty, skipped.",
            Lang::Zh => "内容为空，跳过。",
        }
    }

    pub fn manual_saved(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Manual saved: {}", path),
            Lang::Zh => format!("手册已保存: {}", path),
        }
    }

    // ── Search / Recent ──────────────────────────────────────

    pub fn no_results(&self, query: &str) -> String {
        match self.lang {
            Lang::En => format!("No results matching \"{}\".", query),
            Lang::Zh => format!("未找到匹配 \"{}\" 的结果。", query),
        }
    }

    pub fn found_results(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("🔍 Found {} results:", count),
            Lang::Zh => format!("🔍 找到 {} 条结果：", count),
        }
    }

    pub fn badge_conversation(&self) -> &str {
        match self.lang {
            Lang::En => "conv",
            Lang::Zh => "对话",
        }
    }

    pub fn badge_note(&self) -> &str {
        match self.lang {
            Lang::En => "note",
            Lang::Zh => "笔记",
        }
    }

    pub fn no_recent(&self, days: u32) -> String {
        match self.lang {
            Lang::En => format!("No conversations in the last {} days.", days),
            Lang::Zh => format!("最近 {} 天没有对话记录。", days),
        }
    }

    pub fn recent_heading(&self, days: u32) -> String {
        match self.lang {
            Lang::En => format!("📋 Conversations in the last {} days:", days),
            Lang::Zh => format!("📋 最近 {} 天的对话：", days),
        }
    }

    // ── Stats ────────────────────────────────────────────────

    pub fn stats_title(&self) -> &str {
        match self.lang {
            Lang::En => "GitMemo Stats",
            Lang::Zh => "GitMemo 统计",
        }
    }

    pub fn stats_conversations(&self) -> &str {
        match self.lang {
            Lang::En => "Conversations",
            Lang::Zh => "对话记录",
        }
    }

    pub fn stats_daily(&self) -> &str {
        match self.lang {
            Lang::En => "Daily notes",
            Lang::Zh => "每日笔记",
        }
    }

    pub fn stats_manual(&self) -> &str {
        match self.lang {
            Lang::En => "Manuals",
            Lang::Zh => "手册",
        }
    }

    pub fn stats_scratch(&self) -> &str {
        match self.lang {
            Lang::En => "Scratch notes",
            Lang::Zh => "便签",
        }
    }

    pub fn stats_storage(&self) -> &str {
        match self.lang {
            Lang::En => "Storage size",
            Lang::Zh => "存储大小",
        }
    }

    // ── Reindex ──────────────────────────────────────────────

    pub fn index_rebuilt(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("Index rebuilt, {} files indexed", count),
            Lang::Zh => format!("索引已重建，共 {} 个文件", count),
        }
    }

    // ── Global errors ────────────────────────────────────────

    pub fn not_init_error(&self) -> &str {
        match self.lang {
            Lang::En => "Not initialized. Please run gitmemo init first",
            Lang::Zh => "未初始化。请先运行 gitmemo init",
        }
    }

    pub fn not_init_error_mcp(&self) -> &str {
        match self.lang {
            Lang::En => "GitMemo not initialized. Please run gitmemo init first",
            Lang::Zh => "GitMemo 未初始化。请先运行 gitmemo init",
        }
    }

    // ── MCP tool descriptions ────────────────────────────────

    pub fn mcp_search_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Search the user's AI conversation history and notes. Use when the user says 'search my conversations' or 'find discussions about X'.",
            Lang::Zh => "搜索用户的历史 AI 对话和笔记。当用户说'搜索我的对话'、'找一下之前关于 X 的讨论'时使用。",
        }
    }

    pub fn mcp_search_query_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Search keywords",
            Lang::Zh => "搜索关键词",
        }
    }

    pub fn mcp_search_type_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Search scope, default all",
            Lang::Zh => "搜索范围，默认 all",
        }
    }

    pub fn mcp_search_limit_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Number of results, default 10",
            Lang::Zh => "返回结果数量，默认 10",
        }
    }

    pub fn mcp_recent_desc(&self) -> &str {
        match self.lang {
            Lang::En => "List recent AI conversations. Use when the user says 'recent conversations' or 'show history'.",
            Lang::Zh => "列出最近的 AI 对话记录。当用户说'最近的对话'、'看看历史'时使用。",
        }
    }

    pub fn mcp_recent_limit_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Number of results, default 10",
            Lang::Zh => "返回数量，默认 10",
        }
    }

    pub fn mcp_recent_days_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Days to look back, default 7",
            Lang::Zh => "最近几天，默认 7",
        }
    }

    pub fn mcp_read_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Read the full content of a conversation or note.",
            Lang::Zh => "读取某条对话或笔记的完整内容。",
        }
    }

    pub fn mcp_read_path_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Relative file path",
            Lang::Zh => "文件相对路径",
        }
    }

    pub fn mcp_note_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Create a scratch note. Use when the user says 'note this down' or 'save this idea'.",
            Lang::Zh => "创建一条便签笔记。当用户说'记一下'、'保存这个想法'时使用。",
        }
    }

    pub fn mcp_note_content_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Note content",
            Lang::Zh => "笔记内容",
        }
    }

    pub fn mcp_daily_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Append content to today's daily note. Use when the user says 'add to today's journal'.",
            Lang::Zh => "追加内容到今天的日记。当用户说'记到今天的日记里'时使用。",
        }
    }

    pub fn mcp_daily_content_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Content to append",
            Lang::Zh => "要追加的内容",
        }
    }

    pub fn mcp_manual_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Create or append to a manual document. Use when the user says 'create a manual' or 'organize into a doc'.",
            Lang::Zh => "创建或追加到手册文档。当用户说'创建一篇手册'、'整理成文档'时使用。",
        }
    }

    pub fn mcp_manual_title_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Manual title",
            Lang::Zh => "手册标题",
        }
    }

    pub fn mcp_manual_content_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Manual content",
            Lang::Zh => "手册内容",
        }
    }

    pub fn mcp_manual_append_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Whether to append to existing manual",
            Lang::Zh => "是否追加到已有手册",
        }
    }

    pub fn mcp_stats_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Get statistics about conversations and notes.",
            Lang::Zh => "获取对话和笔记的统计信息。",
        }
    }

    pub fn mcp_sync_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Sync GitMemo data changes to Git (git add + commit + push). In editors without auto hooks (like Cursor), this must be called after saving conversation files.",
            Lang::Zh => "将 GitMemo 数据目录的变更同步到 Git（git add + commit + push）。在 Cursor 等没有自动 Hook 的编辑器中，保存对话文件后必须调用此工具完成同步。",
        }
    }

    pub fn mcp_sync_message_desc(&self) -> &str {
        match self.lang {
            Lang::En => "Commit message (optional, auto-generated by default)",
            Lang::Zh => "commit message（可选，默认自动生成）",
        }
    }

    // ── MCP tool responses ───────────────────────────────────

    pub fn mcp_note_created(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Scratch note created: {}", path),
            Lang::Zh => format!("便签已创建: {}", path),
        }
    }

    pub fn mcp_daily_appended(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Appended to today's note: {}", path),
            Lang::Zh => format!("已追加到今日笔记: {}", path),
        }
    }

    pub fn mcp_manual_saved(&self, path: &str) -> String {
        match self.lang {
            Lang::En => format!("Manual saved: {}", path),
            Lang::Zh => format!("手册已保存: {}", path),
        }
    }

    pub fn mcp_sync_done(&self) -> &str {
        match self.lang {
            Lang::En => "Git sync complete (committed and pushed)",
            Lang::Zh => "Git 同步完成（已提交并推送）",
        }
    }

    pub fn mcp_committed_push_failed(&self, err: &str) -> String {
        match self.lang {
            Lang::En => format!("Committed, but push failed: {}", err),
            Lang::Zh => format!("已提交，但推送失败: {}", err),
        }
    }

    pub fn mcp_pushed_commits(&self, count: usize) -> String {
        match self.lang {
            Lang::En => format!("Pushed {} commits", count),
            Lang::Zh => format!("已推送 {} 条提交", count),
        }
    }

    pub fn mcp_push_failed(&self, err: &str) -> String {
        match self.lang {
            Lang::En => format!("Push failed: {}", err),
            Lang::Zh => format!("推送失败: {}", err),
        }
    }

    pub fn mcp_all_synced(&self) -> &str {
        match self.lang {
            Lang::En => "All synced, nothing to do",
            Lang::Zh => "一切已同步，无需操作",
        }
    }
}
