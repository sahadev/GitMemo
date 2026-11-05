//! OpenCode global rules live in `~/.config/opencode/AGENTS.md` (XDG aware).
//!
//! OpenCode resolves global instructions in this order: `~/.config/opencode/AGENTS.md`
//! first, then `~/.claude/CLAUDE.md`. Writing our block here makes GitMemo rules
//! apply without depending on the Claude Code integration being installed.
//!
//! OpenCode also scans `~/.claude/skills/*`, so GitMemo's `save` skill works with no
//! extra copy. Conversation capture is not supported for OpenCode, hence the
//! instruction block is generated with `auto_capture = false`.

use crate::inject::{claude_md, marker_block};
use crate::utils::i18n::Lang;
use anyhow::Result;
use std::path::{Path, PathBuf};

/// `~/.config/opencode/AGENTS.md` (or `$XDG_CONFIG_HOME/opencode/AGENTS.md`).
pub fn path() -> PathBuf {
    crate::inject::opencode_config_dir().join("AGENTS.md")
}

/// Instruction block for OpenCode: same rules as CLAUDE.md, without the
/// auto-capture promise.
pub fn generate_instruction(sync_dir: &str, lang: Lang) -> String {
    claude_md::generate_instruction_for(sync_dir, lang, false)
}

/// Insert or replace the GitMemo block, keeping user-authored instructions.
pub fn inject(agents_md_path: &Path, sync_dir: &str, lang: Lang) -> Result<()> {
    let instruction = generate_instruction(sync_dir, lang);
    marker_block::upsert(agents_md_path, &instruction)
}

/// Remove the GitMemo block from AGENTS.md.
pub fn remove(agents_md_path: &Path) -> Result<()> {
    marker_block::remove(agents_md_path)
}

/// Whether AGENTS.md currently contains the GitMemo block.
pub fn is_injected(agents_md_path: &Path) -> bool {
    std::fs::read_to_string(agents_md_path)
        .map(|content| marker_block::contains_block(&content))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_block_does_not_claim_auto_capture() {
        let zh = generate_instruction("~/.gitmemo", Lang::Zh);
        assert!(zh.contains(marker_block::MARKER_START));
        assert!(zh.contains("不会自动收录"));
        assert!(zh.contains("notes/manual/"));

        let en = generate_instruction("~/.gitmemo", Lang::En);
        assert!(en.contains("does not capture conversations"));
    }

    #[test]
    fn inject_and_remove_roundtrip() {
        let dir = std::env::temp_dir().join(format!("gitmemo-opencode-{}", std::process::id()));
        let path = dir.join("AGENTS.md");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "# My rules\n").unwrap();

        inject(&path, "~/.gitmemo", Lang::En).unwrap();
        assert!(is_injected(&path));

        remove(&path).unwrap();
        assert!(!is_injected(&path));
        assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), "# My rules");
        std::fs::remove_dir_all(&dir).ok();
    }
}
