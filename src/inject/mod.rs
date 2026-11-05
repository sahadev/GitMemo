pub mod claude_md;
pub mod cursor_mcp;
pub mod cursor_rules;
pub mod marker_block;
pub mod mcp_register;
pub mod opencode_agents_md;
pub mod opencode_mcp;
pub mod session_log_skill;
pub mod settings_hook;

use std::path::PathBuf;

/// OpenCode's config directory: `$XDG_CONFIG_HOME/opencode` or `~/.config/opencode`.
pub fn opencode_config_dir() -> PathBuf {
    match std::env::var("XDG_CONFIG_HOME") {
        Ok(dir) if !dir.trim().is_empty() => PathBuf::from(dir).join("opencode"),
        _ => dirs::home_dir()
            .unwrap_or_default()
            .join(".config")
            .join("opencode"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opencode_config_dir_honors_xdg_config_home() {
        // Serialize with the crate's single-threaded test usage of env vars.
        let key = "XDG_CONFIG_HOME";
        let previous = std::env::var(key).ok();

        std::env::set_var(key, "/tmp/xdg-test");
        assert_eq!(opencode_config_dir(), PathBuf::from("/tmp/xdg-test/opencode"));

        match previous {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
    }
}
