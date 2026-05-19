use std::path::Path;

use anyhow::Result;

use crate::storage::{files, git};

#[derive(Debug)]
pub struct NoteWriteResult {
    pub rel_path: String,
    pub sync: git::SyncResult,
}

fn commit_message(prefix: &str, content: &str) -> String {
    format!(
        "{}: {}",
        prefix,
        content.chars().take(50).collect::<String>()
    )
}

pub fn create_scratch(sync_dir: &Path, content: &str) -> Result<NoteWriteResult> {
    let rel_path = files::create_scratch(sync_dir, content)?;
    let sync = git::commit_and_push(sync_dir, &commit_message("note", content))?;
    Ok(NoteWriteResult { rel_path, sync })
}

pub fn append_daily(sync_dir: &Path, content: &str) -> Result<NoteWriteResult> {
    let rel_path = files::append_daily(sync_dir, content)?;
    let sync = git::commit_and_push(sync_dir, &commit_message("daily", content))?;
    Ok(NoteWriteResult { rel_path, sync })
}

pub fn write_manual(
    sync_dir: &Path,
    title: &str,
    content: &str,
    append: bool,
) -> Result<NoteWriteResult> {
    let rel_path = files::write_manual(sync_dir, title, content, append)?;
    let action = if append { "update" } else { "create" };
    let sync = git::commit_and_push(sync_dir, &format!("manual: {} {}", action, title))?;
    Ok(NoteWriteResult { rel_path, sync })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commit_message_truncates_long_content() {
        let content = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let msg = commit_message("note", content);
        assert_eq!(
            msg,
            "note: abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX"
        );
    }

    #[test]
    fn commit_message_truncates_on_character_boundary() {
        let content = "你好世界".repeat(20);
        let msg = commit_message("daily", &content);
        assert_eq!(msg, format!("daily: {}", "你好世界".repeat(12) + "你好"));
    }
}
