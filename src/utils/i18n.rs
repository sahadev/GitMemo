use std::collections::HashMap;
use std::sync::OnceLock;

const EN_TOML: &str = include_str!("i18n/en.toml");
const ZH_TOML: &str = include_str!("i18n/zh.toml");

/// Supported languages
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    En,
    Zh,
}

impl Lang {
    pub fn parse(s: &str) -> Self {
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
            let lang = Lang::parse(&config.lang);
            init(lang);
            return;
        }
    }
    init(Lang::En);
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct I18n {
    pub lang: Lang,
    strings: HashMap<String, toml::Value>,
}

impl I18n {
    pub fn new(lang: Lang) -> Self {
        let raw = match lang {
            Lang::En => EN_TOML,
            Lang::Zh => ZH_TOML,
        };
        let strings: HashMap<String, toml::Value> =
            toml::from_str(raw).expect("Failed to parse i18n TOML");
        Self { lang, strings }
    }

    // ── Internal helpers ────────────────────────────────────

    fn s<'a>(&'a self, key: &'a str) -> &'a str {
        self.strings
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or(key)
    }

    fn fmt1(&self, key: &str, arg: &str) -> String {
        self.s(key).replacen("{}", arg, 1)
    }

    fn fmt2(&self, key: &str, a: &str, b: &str) -> String {
        self.s(key).replacen("{}", a, 1).replacen("{}", b, 1)
    }

    fn fmt_n(&self, key: &str, n: usize) -> String {
        self.s(key).replacen("{}", &n.to_string(), 1)
    }

    fn fmt_u32(&self, key: &str, n: u32) -> String {
        self.s(key).replacen("{}", &n.to_string(), 1)
    }

    fn arr(&self, key: &str) -> Vec<&str> {
        self.strings
            .get(key)
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
            .unwrap_or_default()
    }

    // ── Init command ────────────────────────────────────────

    pub fn init_title(&self) -> &str { self.s("init_title") }
    pub fn select_editor_prompt(&self) -> &str { self.s("select_editor_prompt") }
    pub fn editor_options(&self) -> Vec<&str> { self.arr("editor_options") }
    #[allow(dead_code)]
    pub fn select_language_prompt(&self) -> &str { self.s("select_language_prompt") }
    pub fn unsupported_editor(&self, name: &str) -> String { self.fmt1("unsupported_editor", name) }
    pub fn not_a_git_repo(&self, path: &str) -> String { self.fmt1("not_a_git_repo", path) }
    pub fn linked_repo(&self) -> &str { self.s("linked_repo") }
    pub fn detected_remote(&self) -> &str { self.s("detected_remote") }
    pub fn git_url_prompt(&self) -> &str { self.s("git_url_prompt") }
    pub fn local_mode_selected(&self) -> &str { self.s("local_mode_selected") }
    pub fn local_saved_hint(&self) -> &str { self.s("local_saved_hint") }
    pub fn sync_mode_local(&self) -> &str { self.s("sync_mode_local") }
    pub fn remote_current(&self, url: &str) -> String { self.fmt1("remote_current", url) }
    pub fn remote_none(&self) -> &str { self.s("remote_none") }
    pub fn remote_set_ok(&self) -> &str { self.s("remote_set_ok") }
    pub fn remote_pushing(&self) -> &str { self.s("remote_pushing") }
    pub fn remote_removed(&self) -> &str { self.s("remote_removed") }
    pub fn remote_same(&self, url: &str) -> String { self.fmt1("remote_same", url) }
    pub fn opening_browser(&self) -> &str { self.s("opening_browser") }
    pub fn dir_structure_ready(&self) -> &str { self.s("dir_structure_ready") }
    pub fn git_repo_ready(&self) -> &str { self.s("git_repo_ready") }
    pub fn ssh_key_generated(&self) -> &str { self.s("ssh_key_generated") }
    pub fn ssh_key_exists(&self) -> &str { self.s("ssh_key_exists") }
    pub fn ssh_url_recommended(&self) -> &str { self.s("ssh_url_recommended") }
    pub fn use_ssh_url(&self) -> &str { self.s("use_ssh_url") }
    pub fn keep_https_url(&self) -> &str { self.s("keep_https_url") }
    pub fn choose_url_prompt(&self) -> &str { self.s("choose_url_prompt") }
    pub fn testing_ssh(&self) -> &str { self.s("testing_ssh") }
    pub fn ssh_test_ok(&self) -> &str { self.s("ssh_test_ok") }
    pub fn ssh_test_auth_failed(&self) -> &str { self.s("ssh_test_auth_failed") }
    pub fn ssh_test_connection_failed(&self) -> &str { self.s("ssh_test_connection_failed") }
    pub fn ssh_test_unknown(&self) -> &str { self.s("ssh_test_unknown") }
    pub fn ssh_test_error(&self) -> &str { self.s("ssh_test_error") }
    pub fn configs_backed_up(&self) -> &str { self.s("configs_backed_up") }
    pub fn claude_md_injected(&self) -> &str { self.s("claude_md_injected") }
    pub fn git_hook_injected(&self) -> &str { self.s("git_hook_injected") }
    pub fn claude_mcp_registered(&self) -> &str { self.s("claude_mcp_registered") }
    pub fn save_skill_installed(&self) -> &str { self.s("save_skill_installed") }
    pub fn claude_session_log_skill_installed(&self) -> &str { self.s("claude_session_log_skill_installed") }
    pub fn cursor_rules_injected(&self) -> &str { self.s("cursor_rules_injected") }
    pub fn cursor_save_skill_installed(&self) -> &str { self.s("cursor_save_skill_installed") }
    pub fn cursor_session_log_skill_installed(&self) -> &str { self.s("cursor_session_log_skill_installed") }
    pub fn cursor_mcp_registered(&self) -> &str { self.s("cursor_mcp_registered") }
    pub fn deploy_key_hint(&self) -> &str { self.s("deploy_key_hint") }
    pub fn all_set(&self) -> &str { self.s("all_set") }
    pub fn next_steps(&self) -> &str { self.s("next_steps") }
    pub fn claude_next_step_1(&self) -> &str { self.s("claude_next_step_1") }
    pub fn claude_next_step_2(&self) -> &str { self.s("claude_next_step_2") }
    pub fn cursor_next_step_1(&self) -> &str { self.s("cursor_next_step_1") }
    pub fn cursor_next_step_2(&self) -> &str { self.s("cursor_next_step_2") }
    pub fn verify_heading(&self) -> &str { self.s("verify_heading") }
    pub fn verify_test(&self) -> &str { self.s("verify_test") }
    pub fn verify_status(&self) -> &str { self.s("verify_status") }
    pub fn recommend(&self) -> &str { self.s("recommend") }

    // ── Uninstall command ───────────────────────────────────

    pub fn uninstall_title(&self) -> &str { self.s("uninstall_title") }
    pub fn claude_md_removed(&self) -> &str { self.s("claude_md_removed") }
    pub fn git_hook_removed(&self) -> &str { self.s("git_hook_removed") }
    pub fn claude_mcp_removed(&self) -> &str { self.s("claude_mcp_removed") }
    pub fn save_skill_removed(&self) -> &str { self.s("save_skill_removed") }
    pub fn claude_session_log_skill_removed(&self) -> &str { self.s("claude_session_log_skill_removed") }
    pub fn cursor_rules_removed(&self) -> &str { self.s("cursor_rules_removed") }
    pub fn cursor_save_skill_removed(&self) -> &str { self.s("cursor_save_skill_removed") }
    pub fn cursor_session_log_skill_removed(&self) -> &str { self.s("cursor_session_log_skill_removed") }
    pub fn cursor_mcp_removed(&self) -> &str { self.s("cursor_mcp_removed") }
    pub fn data_deleted(&self, path: &str) -> String { self.fmt1("data_deleted", path) }
    pub fn data_preserved(&self, path: &str) -> String { self.fmt1("data_preserved", path) }

    // ── Status command ──────────────────────────────────────

    pub fn status_title(&self) -> &str { self.s("status_title") }
    pub fn not_initialized(&self) -> &str { self.s("not_initialized") }
    pub fn data_dir(&self) -> &str { self.s("data_dir") }
    pub fn git_remote(&self) -> &str { self.s("git_remote") }
    pub fn git_branch(&self) -> &str { self.s("git_branch") }
    pub fn conversations_count(&self) -> &str { self.s("conversations_count") }
    pub fn notes_count(&self) -> &str { self.s("notes_count") }
    pub fn unpushed_commits(&self, count: usize) -> String { self.fmt_n("unpushed_commits", count) }
    pub fn sync_ok(&self) -> &str { self.s("sync_ok") }

    // ── Sync command ────────────────────────────────────────

    pub fn synced_to_git(&self) -> &str { self.s("synced_to_git") }
    pub fn committed_push_failed(&self, err: &str) -> String { self.fmt1("committed_push_failed", err) }
    pub fn retry_push_hint(&self) -> &str { self.s("retry_push_hint") }
    pub fn no_changes(&self) -> &str { self.s("no_changes") }
    pub fn all_synced(&self) -> &str { self.s("all_synced") }
    pub fn pushing_commits(&self, count: usize) -> String { self.fmt_n("pushing_commits", count) }
    pub fn pushed_commits(&self, count: usize) -> String { self.fmt_n("pushed_commits", count) }
    pub fn push_failed(&self, err: &str) -> String { self.fmt1("push_failed", err) }

    // ── Unpushed command ────────────────────────────────────

    pub fn no_unpushed(&self) -> &str { self.s("no_unpushed") }
    pub fn unpushed_heading(&self, count: usize) -> String { self.fmt_n("unpushed_heading", count) }
    pub fn push_hint(&self) -> &str { self.s("push_hint") }

    // ── Note commands ───────────────────────────────────────

    pub fn scratch_created(&self, path: &str) -> String { self.fmt1("scratch_created", path) }
    pub fn daily_saved(&self) -> &str { self.s("daily_saved") }
    pub fn daily_appended(&self, path: &str) -> String { self.fmt1("daily_appended", path) }
    pub fn content_empty(&self) -> &str { self.s("content_empty") }
    pub fn manual_saved(&self, path: &str) -> String { self.fmt1("manual_saved", path) }

    // ── Search / Recent ─────────────────────────────────────

    pub fn no_results(&self, query: &str) -> String { self.fmt1("no_results", query) }
    pub fn found_results(&self, count: usize) -> String { self.fmt_n("found_results", count) }
    pub fn badge_conversation(&self) -> &str { self.s("badge_conversation") }
    pub fn badge_note(&self) -> &str { self.s("badge_note") }
    pub fn no_recent(&self, days: u32) -> String { self.fmt_u32("no_recent", days) }
    pub fn recent_heading(&self, days: u32) -> String { self.fmt_u32("recent_heading", days) }

    // ── Stats ───────────────────────────────────────────────

    pub fn stats_title(&self) -> &str { self.s("stats_title") }
    pub fn stats_conversations(&self) -> &str { self.s("stats_conversations") }
    pub fn stats_daily(&self) -> &str { self.s("stats_daily") }
    pub fn stats_manual(&self) -> &str { self.s("stats_manual") }
    pub fn stats_scratch(&self) -> &str { self.s("stats_scratch") }
    pub fn stats_storage(&self) -> &str { self.s("stats_storage") }

    // ── Reindex ─────────────────────────────────────────────

    pub fn index_rebuilt(&self, count: usize) -> String { self.fmt_n("index_rebuilt", count) }

    // ── Branch command ──────────────────────────────────────

    pub fn branch_current(&self, branch: &str) -> String { self.fmt1("branch_current", branch) }
    pub fn branch_switched(&self, from: &str, to: &str) -> String { self.fmt2("branch_switched", from, to) }
    pub fn branch_same(&self, branch: &str) -> String { self.fmt1("branch_same", branch) }

    // ── Global errors ───────────────────────────────────────

    pub fn not_init_error(&self) -> &str { self.s("not_init_error") }
    pub fn not_init_error_mcp(&self) -> &str { self.s("not_init_error_mcp") }

    // ── MCP tool descriptions ───────────────────────────────

    pub fn mcp_search_desc(&self) -> &str { self.s("mcp_search_desc") }
    pub fn mcp_search_query_desc(&self) -> &str { self.s("mcp_search_query_desc") }
    pub fn mcp_search_type_desc(&self) -> &str { self.s("mcp_search_type_desc") }
    pub fn mcp_search_limit_desc(&self) -> &str { self.s("mcp_search_limit_desc") }
    pub fn mcp_recent_desc(&self) -> &str { self.s("mcp_recent_desc") }
    pub fn mcp_recent_limit_desc(&self) -> &str { self.s("mcp_recent_limit_desc") }
    pub fn mcp_recent_days_desc(&self) -> &str { self.s("mcp_recent_days_desc") }
    pub fn mcp_read_desc(&self) -> &str { self.s("mcp_read_desc") }
    pub fn mcp_read_path_desc(&self) -> &str { self.s("mcp_read_path_desc") }
    pub fn mcp_note_desc(&self) -> &str { self.s("mcp_note_desc") }
    pub fn mcp_note_content_desc(&self) -> &str { self.s("mcp_note_content_desc") }
    pub fn mcp_daily_desc(&self) -> &str { self.s("mcp_daily_desc") }
    pub fn mcp_daily_content_desc(&self) -> &str { self.s("mcp_daily_content_desc") }
    pub fn mcp_manual_desc(&self) -> &str { self.s("mcp_manual_desc") }
    pub fn mcp_manual_title_desc(&self) -> &str { self.s("mcp_manual_title_desc") }
    pub fn mcp_manual_content_desc(&self) -> &str { self.s("mcp_manual_content_desc") }
    pub fn mcp_manual_append_desc(&self) -> &str { self.s("mcp_manual_append_desc") }
    pub fn mcp_stats_desc(&self) -> &str { self.s("mcp_stats_desc") }
    pub fn mcp_sync_desc(&self) -> &str { self.s("mcp_sync_desc") }
    pub fn mcp_sync_message_desc(&self) -> &str { self.s("mcp_sync_message_desc") }

    // ── MCP tool responses ──────────────────────────────────

    pub fn mcp_note_created(&self, path: &str) -> String { self.fmt1("mcp_note_created", path) }
    pub fn mcp_daily_appended(&self, path: &str) -> String { self.fmt1("mcp_daily_appended", path) }
    pub fn mcp_manual_saved(&self, path: &str) -> String { self.fmt1("mcp_manual_saved", path) }
    pub fn mcp_sync_done(&self) -> &str { self.s("mcp_sync_done") }
    pub fn mcp_committed_push_failed(&self, err: &str) -> String { self.fmt1("mcp_committed_push_failed", err) }
    pub fn mcp_pushed_commits(&self, count: usize) -> String { self.fmt_n("mcp_pushed_commits", count) }
    pub fn mcp_push_failed(&self, err: &str) -> String { self.fmt1("mcp_push_failed", err) }
    pub fn mcp_all_synced(&self) -> &str { self.s("mcp_all_synced") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_en_simple_strings() {
        let i18n = I18n::new(Lang::En);
        assert_eq!(i18n.init_title(), "GitMemo Setup");
        assert_eq!(i18n.all_set(), "All set!");
        assert_eq!(i18n.sync_ok(), "Sync status: ✓ up to date");
    }

    #[test]
    fn test_zh_simple_strings() {
        let i18n = I18n::new(Lang::Zh);
        assert_eq!(i18n.init_title(), "GitMemo 初始化");
        assert_eq!(i18n.all_set(), "一切就绪！");
    }

    #[test]
    fn test_format_one_arg() {
        let i18n = I18n::new(Lang::En);
        assert_eq!(i18n.push_failed("timeout"), "Push failed: timeout");
        assert_eq!(i18n.scratch_created("notes/scratch/test.md"), "Scratch note created: notes/scratch/test.md");
    }

    #[test]
    fn test_format_numeric() {
        let i18n = I18n::new(Lang::En);
        assert_eq!(i18n.pushed_commits(5), "Pushed 5 commits");
        assert_eq!(i18n.found_results(3), "🔍 Found 3 results:");
    }

    #[test]
    fn test_format_two_args() {
        let i18n = I18n::new(Lang::En);
        let result = i18n.branch_switched("dev", "main");
        assert_eq!(result, "Sync branch changed: dev → main");
    }

    #[test]
    fn test_editor_options_array() {
        let en = I18n::new(Lang::En);
        let opts = en.editor_options();
        assert_eq!(opts.len(), 3);
        assert_eq!(opts[0], "Claude Code");

        let zh = I18n::new(Lang::Zh);
        let opts_zh = zh.editor_options();
        assert_eq!(opts_zh.len(), 3);
        assert_eq!(opts_zh[2], "两者都安装");
    }

    #[test]
    fn test_missing_key_returns_key() {
        let i18n = I18n::new(Lang::En);
        assert_eq!(i18n.s("nonexistent_key"), "nonexistent_key");
    }

    #[test]
    fn test_lang_parse() {
        assert_eq!(Lang::parse("zh"), Lang::Zh);
        assert_eq!(Lang::parse("zh-cn"), Lang::Zh);
        assert_eq!(Lang::parse("chinese"), Lang::Zh);
        assert_eq!(Lang::parse("en"), Lang::En);
        assert_eq!(Lang::parse("anything"), Lang::En);
    }

    #[test]
    fn test_lang_as_str() {
        assert_eq!(Lang::En.as_str(), "en");
        assert_eq!(Lang::Zh.as_str(), "zh");
    }

    #[test]
    fn test_format_u32() {
        let i18n = I18n::new(Lang::En);
        let result = i18n.no_recent(7);
        assert_eq!(result, "No conversations in the last 7 days.");
    }
}
