//! Shared marker block helpers for injectable instruction files.
//!
//! Both `~/.claude/CLAUDE.md` and `~/.config/opencode/AGENTS.md` host the same
//! GitMemo block, delimited by HTML comment markers so injection is idempotent
//! and removable without touching user content.

use anyhow::Result;
use std::path::Path;

pub const MARKER_START: &str = "<!-- [gitmemo:start] -->";
pub const MARKER_END: &str = "<!-- [gitmemo:end] -->";

/// Whether the content already contains an injected GitMemo block.
pub fn contains_block(content: &str) -> bool {
    content.contains(MARKER_START)
}

/// Insert or replace the GitMemo block in `path`, keeping surrounding content.
pub fn upsert(path: &Path, block: &str) -> Result<()> {
    let content = if path.exists() {
        std::fs::read_to_string(path)?
    } else {
        String::new()
    };
    let cleaned = strip_block(&content);
    let new_content = if cleaned.is_empty() {
        block.to_string()
    } else {
        format!("{}\n\n{}", cleaned.trim_end(), block)
    };

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, new_content)?;
    Ok(())
}

/// Remove the GitMemo block from `path` if present. The file itself is kept.
pub fn remove(path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(path)?;
    std::fs::write(path, strip_block(&content))?;
    Ok(())
}

/// Remove the GitMemo block from a string, collapsing the leftover gap.
pub fn strip_block(content: &str) -> String {
    if let (Some(start), Some(end)) = (content.find(MARKER_START), content.find(MARKER_END)) {
        if end < start {
            return content.to_string();
        }
        let before = content[..start].trim();
        let after = content[end + MARKER_END.len()..].trim_start();
        match (before.is_empty(), after.is_empty()) {
            (true, _) => after.to_string(),
            (_, true) => before.to_string(),
            _ => format!("{before}\n\n{after}"),
        }
    } else if let Some(start) = content.find(MARKER_START) {
        // Unterminated block: drop the tail so a broken file can be repaired.
        content[..start].trim_end().to_string()
    } else {
        content.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_block_keeps_user_content_around_it() {
        let content = "# Mine\n\n<!-- [gitmemo:start] -->\nGitMemo\n<!-- [gitmemo:end] -->\n\ntail\n";
        assert_eq!(strip_block(content), "# Mine\n\ntail\n");
    }

    #[test]
    fn strip_block_handles_unterminated_block() {
        let content = "# Mine\n\n<!-- [gitmemo:start] -->\nGitMemo\n";
        assert_eq!(strip_block(content), "# Mine");
    }

    #[test]
    fn strip_block_is_noop_without_markers() {
        assert_eq!(strip_block("# Mine\n"), "# Mine\n");
    }

    #[test]
    fn upsert_replaces_existing_block_and_is_idempotent() {
        let dir = std::env::temp_dir().join(format!("gitmemo-marker-{}", std::process::id()));
        let path = dir.join("AGENTS.md");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "# Mine\n").unwrap();

        let block = format!("{MARKER_START}\nv1\n{MARKER_END}");
        upsert(&path, &block).unwrap();
        let block2 = format!("{MARKER_START}\nv2\n{MARKER_END}");
        upsert(&path, &block2).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("# Mine"));
        assert!(content.contains("v2"));
        assert!(!content.contains("v1"));
        assert_eq!(content.matches(MARKER_START).count(), 1);

        remove(&path).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), "# Mine");
        std::fs::remove_dir_all(&dir).ok();
    }
}
