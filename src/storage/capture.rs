//! Capture conversations from Claude Code and Codex native session logs.
//!
//! Claude Code writes two data sources automatically:
//! 1. `~/.claude/history.jsonl` — global index (sessionId, project, timestamp, display)
//! 2. `~/.claude/projects/{slug}/{sessionId}.jsonl` — full conversation (user + assistant messages)
//!
//! Codex writes `~/.codex/history.jsonl` plus per-session JSONL files under
//! `~/.codex/sessions/{YYYY}/{MM}/{DD}/`.
//!
//! This module reads those files, converts to GitMemo markdown, and writes to the conversations directory.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const MAX_HISTORY_DISPLAY_LEN: usize = 200;

// ── State tracking ──────────────────────────────────────────────────────────

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct CaptureState {
    /// Byte offset into Claude Code history.jsonl (for incremental reads)
    pub history_byte_offset: u64,
    /// Byte offset into Codex history.jsonl (for incremental reads)
    #[serde(default)]
    pub codex_history_byte_offset: u64,
    /// Per-session capture state
    #[serde(default)]
    pub captured_sessions: HashMap<String, SessionState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub last_line_count: usize,
    pub output_path: String,
    pub last_capture_ts: u64,
}

impl CaptureState {
    pub fn load(path: &Path) -> Self {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                if let Ok(state) = serde_json::from_str(&content) {
                    return state;
                }
            }
        }
        Self::default()
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }
}

// ── Data structures ─────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct SessionInfo {
    pub session_id: String,
    pub project: String,
    pub first_ts: u64,
    pub last_ts: u64,
    pub display_texts: Vec<String>,
    pub source: CaptureSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureSource {
    ClaudeCode,
    Codex,
}

impl CaptureSource {
    fn label(self) -> &'static str {
        match self {
            CaptureSource::ClaudeCode => "claude-code-capture",
            CaptureSource::Codex => "codex-capture",
        }
    }
}

#[derive(Debug)]
struct ConversationMessage {
    role: String, // "user" or "assistant"
    text: String,
    timestamp: String, // HH:MM:SS
}

#[derive(Debug)]
struct ConversationContent {
    title: String,
    date_iso: String,
    session_id: String,
    project: String,
    source: CaptureSource,
    messages: Vec<ConversationMessage>,
    total_lines: usize,
}

// ── history.jsonl parsing ───────────────────────────────────────────────────

#[derive(Deserialize)]
struct HistoryEntry {
    display: String,
    timestamp: u64,
    project: String,
    #[serde(rename = "sessionId")]
    session_id: String,
}

#[derive(Deserialize)]
struct CodexHistoryEntry {
    session_id: String,
    ts: u64,
    text: String,
}

fn should_keep_history_display(text: &str) -> bool {
    !text.is_empty() && text.len() < MAX_HISTORY_DISPLAY_LEN
}

/// Discover sessions with new activity since last capture.
fn discover_sessions(history_path: &Path, state: &mut CaptureState) -> Result<Vec<SessionInfo>> {
    if !history_path.exists() {
        return Ok(vec![]);
    }

    let file = std::fs::File::open(history_path)?;
    let file_len = file.metadata()?.len();

    // If file is shorter than our offset (e.g. after reinstall), reset
    if file_len < state.history_byte_offset {
        state.history_byte_offset = 0;
    }

    let mut reader = std::io::BufReader::new(file);
    reader.seek(SeekFrom::Start(state.history_byte_offset))?;

    let mut sessions: HashMap<String, SessionInfo> = HashMap::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<HistoryEntry>(&line) {
            let sid = entry.session_id.clone();
            let info = sessions.entry(sid.clone()).or_insert(SessionInfo {
                session_id: sid,
                project: entry.project.clone(),
                first_ts: entry.timestamp,
                last_ts: entry.timestamp,
                display_texts: Vec::new(),
                source: CaptureSource::ClaudeCode,
            });
            if entry.timestamp < info.first_ts {
                info.first_ts = entry.timestamp;
            }
            if entry.timestamp > info.last_ts {
                info.last_ts = entry.timestamp;
            }
            if should_keep_history_display(&entry.display) {
                info.display_texts.push(entry.display);
            }
        }
    }

    state.history_byte_offset = file_len;

    // Only return sessions with new activity
    let result: Vec<SessionInfo> = sessions
        .into_values()
        .filter(|s| match state.captured_sessions.get(&s.session_id) {
            Some(prev) => s.last_ts > prev.last_capture_ts,
            None => true,
        })
        .collect();

    Ok(result)
}

fn discover_codex_sessions(
    history_path: &Path,
    state: &mut CaptureState,
) -> Result<Vec<SessionInfo>> {
    if !history_path.exists() {
        return Ok(vec![]);
    }

    let file = std::fs::File::open(history_path)?;
    let file_len = file.metadata()?.len();

    if file_len < state.codex_history_byte_offset {
        state.codex_history_byte_offset = 0;
    }

    let mut reader = std::io::BufReader::new(file);
    reader.seek(SeekFrom::Start(state.codex_history_byte_offset))?;

    let mut sessions: HashMap<String, SessionInfo> = HashMap::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<CodexHistoryEntry>(&line) {
            let sid = format!("codex:{}", entry.session_id);
            let ts = entry.ts.saturating_mul(1000);
            let info = sessions.entry(sid.clone()).or_insert(SessionInfo {
                session_id: sid,
                project: "Codex".to_string(),
                first_ts: ts,
                last_ts: ts,
                display_texts: Vec::new(),
                source: CaptureSource::Codex,
            });
            if ts < info.first_ts {
                info.first_ts = ts;
            }
            if ts > info.last_ts {
                info.last_ts = ts;
            }
            if should_keep_history_display(&entry.text) {
                info.display_texts.push(entry.text);
            }
        }
    }

    state.codex_history_byte_offset = file_len;

    let result: Vec<SessionInfo> = sessions
        .into_values()
        .filter(|s| match state.captured_sessions.get(&s.session_id) {
            Some(prev) => s.last_ts > prev.last_capture_ts,
            None => true,
        })
        .collect();

    Ok(result)
}

// ── Per-session JSONL parsing ───────────────────────────────────────────────

fn project_slug(project: &str) -> String {
    project.replace('/', "-")
}

fn session_jsonl_path(session: &SessionInfo) -> PathBuf {
    match session.source {
        CaptureSource::ClaudeCode => claude_session_jsonl_path(session),
        CaptureSource::Codex => codex_session_jsonl_path(session),
    }
}

fn claude_session_jsonl_path(session: &SessionInfo) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    let slug = project_slug(&session.project);
    home.join(".claude")
        .join("projects")
        .join(&slug)
        .join(format!("{}.jsonl", session.session_id))
}

fn codex_session_jsonl_path(session: &SessionInfo) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    let session_id = session
        .session_id
        .strip_prefix("codex:")
        .unwrap_or(&session.session_id);
    let mut path = home.join(".codex").join("sessions");
    if let Ok(entries) = std::fs::read_dir(&path) {
        for year in entries.filter_map(|entry| entry.ok()) {
            if !year.path().is_dir() {
                continue;
            }
            if let Ok(months) = std::fs::read_dir(year.path()) {
                for month in months.filter_map(|entry| entry.ok()) {
                    if !month.path().is_dir() {
                        continue;
                    }
                    if let Ok(days) = std::fs::read_dir(month.path()) {
                        for day in days.filter_map(|entry| entry.ok()) {
                            if !day.path().is_dir() {
                                continue;
                            }
                            if let Ok(files) = std::fs::read_dir(day.path()) {
                                for file in files.filter_map(|entry| entry.ok()) {
                                    let file_path = file.path();
                                    if is_codex_session_jsonl_for_id(&file_path, session_id) {
                                        return file_path;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    path.push(format!("{}.jsonl", session_id));
    path
}

fn is_codex_session_jsonl_for_id(file_path: &Path, session_id: &str) -> bool {
    file_path.extension().is_some_and(|ext| ext == "jsonl")
        && file_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.contains(session_id))
}

#[derive(Deserialize)]
struct SessionEntry {
    #[serde(rename = "type")]
    entry_type: String,
    message: Option<serde_json::Value>,
    timestamp: Option<String>,
    #[serde(rename = "customTitle")]
    custom_title: Option<String>,
    #[serde(rename = "isMeta")]
    is_meta: Option<bool>,
    #[serde(rename = "isSnapshotUpdate")]
    is_snapshot_update: Option<bool>,
    payload: Option<serde_json::Value>,
}

fn content_value_to_text(content: Option<&serde_json::Value>) -> Option<String> {
    match content {
        Some(serde_json::Value::String(s)) => {
            if is_internal_command_content(s) {
                return None;
            }
            Some(s.clone())
        }
        Some(serde_json::Value::Array(arr)) => {
            let texts: Vec<String> = arr
                .iter()
                .filter_map(|block| {
                    let block_type = block.get("type")?.as_str()?;
                    if is_supported_message_content_block(block_type) {
                        Some(block.get("text")?.as_str()?.to_string())
                    } else {
                        None
                    }
                })
                .collect();
            if texts.is_empty() {
                None
            } else {
                Some(texts.join("\n"))
            }
        }
        _ => None,
    }
}

fn is_internal_command_content(text: &str) -> bool {
    text.starts_with("<command-name>") || text.starts_with("<local-command-caveat>")
}

fn is_supported_message_content_block(block_type: &str) -> bool {
    matches!(block_type, "text" | "input_text" | "output_text")
}

fn is_conversation_role(role: &str) -> bool {
    matches!(role, "user" | "assistant")
}

fn should_skip_session_entry(entry: &SessionEntry) -> bool {
    entry.is_snapshot_update.unwrap_or(false)
        || matches!(
            entry.entry_type.as_str(),
            "file-history-snapshot" | "system" | "queue-operation" | "agent-name"
        )
}

fn codex_payload_message(entry: &SessionEntry) -> Option<ConversationMessage> {
    let payload = entry.payload.as_ref()?;
    let ts = entry
        .timestamp
        .as_deref()
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
        .map(|dt| {
            let local: chrono::DateTime<chrono::Local> = dt.into();
            local.format("%H:%M:%S").to_string()
        })
        .unwrap_or_default();

    if entry.entry_type == "event_msg" {
        let payload_type = payload.get("type")?.as_str()?;
        let role = match payload_type {
            "user_message" => "user",
            "agent_message" => "assistant",
            _ => return None,
        };
        let text = payload.get("message")?.as_str()?.to_string();
        if text.trim().is_empty() {
            return None;
        }
        return Some(ConversationMessage {
            role: role.to_string(),
            text,
            timestamp: ts,
        });
    }

    if entry.entry_type == "response_item" && payload.get("type")?.as_str()? == "message" {
        let role = payload.get("role")?.as_str()?;
        if !is_conversation_role(role) {
            return None;
        }
        let text = content_value_to_text(payload.get("content"))?;
        if text.trim().is_empty() {
            return None;
        }
        return Some(ConversationMessage {
            role: role.to_string(),
            text,
            timestamp: ts,
        });
    }

    None
}

fn extract_conversation(
    session: &SessionInfo,
    state: &CaptureState,
) -> Result<ConversationContent> {
    let jsonl_path = session_jsonl_path(session);
    let skip_lines = state
        .captured_sessions
        .get(&session.session_id)
        .map(|s| s.last_line_count)
        .unwrap_or(0);

    let mut messages: Vec<ConversationMessage> = Vec::new();
    let mut title = String::new();
    let mut total_lines = 0usize;

    if jsonl_path.exists() {
        let file = std::fs::File::open(&jsonl_path)?;
        let reader = std::io::BufReader::new(file);

        for (i, line) in reader.lines().enumerate() {
            total_lines = i + 1;
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            let entry: SessionEntry = match serde_json::from_str(&line) {
                Ok(e) => e,
                Err(_) => continue,
            };

            if entry.entry_type == "custom-title" {
                if let Some(t) = entry.custom_title {
                    title = t;
                }
                continue;
            }

            if should_skip_session_entry(&entry) {
                continue;
            }

            if i < skip_lines {
                continue;
            }

            if entry.is_meta.unwrap_or(false) {
                continue;
            }

            if session.source == CaptureSource::Codex {
                if entry.entry_type == "event_msg" {
                    if let Some(msg) = codex_payload_message(&entry) {
                        messages.push(msg);
                    }
                }
                continue;
            }

            let ts = entry
                .timestamp
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| {
                    let local: chrono::DateTime<chrono::Local> = dt.into();
                    local.format("%H:%M:%S").to_string()
                })
                .unwrap_or_default();

            if let Some(msg) = entry.message {
                let role = msg
                    .get("role")
                    .and_then(|r| r.as_str())
                    .unwrap_or("")
                    .to_string();
                let content = msg.get("content");

                let text = match content_value_to_text(content) {
                    Some(text) => text,
                    None => continue,
                };

                if text.trim().is_empty() {
                    continue;
                }

                if is_conversation_role(&role) && !text.trim().is_empty() {
                    messages.push(ConversationMessage {
                        role,
                        text,
                        timestamp: ts,
                    });
                }
            }
        }
    } else {
        for display in &session.display_texts {
            messages.push(ConversationMessage {
                role: "user".to_string(),
                text: display.clone(),
                timestamp: String::new(),
            });
        }
    }

    if title.is_empty() {
        title = messages
            .iter()
            .find(|m| m.role == "user")
            .map(|m| {
                let t: String = m.text.chars().take(40).collect();
                t.lines().next().unwrap_or(&t).trim().to_string()
            })
            .unwrap_or_else(|| "Untitled session".to_string());
    }

    let date_iso = chrono::DateTime::from_timestamp_millis(session.first_ts as i64)
        .map(|dt| {
            let local: chrono::DateTime<chrono::Local> = dt.into();
            local.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
        })
        .unwrap_or_else(|| {
            chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
        });

    Ok(ConversationContent {
        title,
        date_iso,
        session_id: session.session_id.clone(),
        project: session.project.clone(),
        source: session.source,
        messages,
        total_lines,
    })
}

// ── Markdown generation ─────────────────────────────────────────────────────

fn sanitize_title(title: &str) -> String {
    let clean: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' || c > '\u{4e00}' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let clean = clean.trim().replace(' ', "-");
    if clean.len() > 60 {
        clean.chars().take(60).collect()
    } else {
        clean
    }
}

fn to_markdown(content: &ConversationContent) -> String {
    let mut md = String::new();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("title: {}\n", content.title));
    md.push_str(&format!("date: {}\n", content.date_iso));
    md.push_str(&format!("session_id: {}\n", content.session_id));
    md.push_str(&format!("project: {}\n", content.project));
    md.push_str(&format!("source: {}\n", content.source.label()));
    md.push_str(&format!(
        "messages: {}\n",
        content.messages.iter().filter(|m| m.role == "user").count()
    ));
    md.push_str("---\n\n");

    // Title
    md.push_str(&format!("# {}\n\n", content.title));

    // Messages (limit to ~300 lines)
    let mut line_count = 0;
    for msg in &content.messages {
        let role_label = if msg.role == "user" {
            "User"
        } else {
            "Assistant"
        };
        let header = if msg.timestamp.is_empty() {
            format!("### {}\n\n", role_label)
        } else {
            format!("### {} ({})\n\n", role_label, msg.timestamp)
        };
        md.push_str(&header);

        // Truncate very long messages
        let text = if msg.text.lines().count() > 80 {
            let truncated: String = msg.text.lines().take(80).collect::<Vec<_>>().join("\n");
            format!("{}\n\n*...truncated...*", truncated)
        } else {
            msg.text.clone()
        };

        md.push_str(&text);
        md.push_str("\n\n");

        line_count += text.lines().count() + 4;
        if line_count > 300 {
            md.push_str("*...conversation truncated for brevity...*\n");
            break;
        }
    }

    md
}

// ── Output path ─────────────────────────────────────────────────────────────

fn output_rel_path(content: &ConversationContent) -> String {
    let dt = chrono::DateTime::parse_from_rfc3339(&content.date_iso)
        .map(|d| {
            let local: chrono::DateTime<chrono::Local> = d.into();
            local
        })
        .unwrap_or_else(|_| chrono::Local::now());

    let month_dir = dt.format("%Y-%m").to_string();
    let date_prefix = dt.format("%m-%d").to_string();
    let safe_title = sanitize_title(&content.title);

    format!(
        "conversations/{}/{}-{}.md",
        month_dir, date_prefix, safe_title
    )
}

// ── Check for existing captures ─────────────────────────────────────────────

fn find_existing_session_file(sync_dir: &Path, session_id: &str) -> Option<String> {
    let convos_dir = sync_dir.join("conversations");
    if !convos_dir.exists() {
        return None;
    }

    for entry in walkdir::WalkDir::new(&convos_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
    {
        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            if content.contains(&format!("session_id: {}", session_id)) {
                let rel = entry
                    .path()
                    .strip_prefix(sync_dir)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .to_string();
                return Some(rel);
            }
        }
    }
    None
}

// ── Public API ──────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct CaptureResult {
    pub new_sessions: usize,
    pub updated_sessions: usize,
    pub skipped: usize,
}

/// Run capture: discover new sessions, extract conversations, write markdown.
pub fn run_capture(
    sync_dir: &Path,
    project_filter: Option<&str>,
    dry_run: bool,
) -> Result<CaptureResult> {
    let state_path = sync_dir.join(".metadata").join("capture_state.json");
    let mut state = CaptureState::load(&state_path);

    let history_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude")
        .join("history.jsonl");
    let codex_history_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".codex")
        .join("history.jsonl");

    let mut sessions = discover_sessions(&history_path, &mut state)?;
    sessions.extend(discover_codex_sessions(&codex_history_path, &mut state)?);

    let mut result = CaptureResult {
        new_sessions: 0,
        updated_sessions: 0,
        skipped: 0,
    };

    for session in &sessions {
        // Apply project filter if specified
        if let Some(filter) = project_filter {
            if !session.project.contains(filter) {
                result.skipped += 1;
                continue;
            }
        }

        // Check if already captured by AI (via /save or CLAUDE.md instruction)
        if let Some(existing) = find_existing_session_file(sync_dir, &session.session_id) {
            // Session already saved — check if we need to update
            if let Some(prev) = state.captured_sessions.get(&session.session_id) {
                if session.last_ts <= prev.last_capture_ts {
                    result.skipped += 1;
                    continue;
                }
            }
            // Update path to match existing file
            state
                .captured_sessions
                .entry(session.session_id.clone())
                .or_insert(SessionState {
                    last_line_count: 0,
                    output_path: existing,
                    last_capture_ts: 0,
                });
        }

        let content = extract_conversation(session, &state)?;

        if content.messages.is_empty() {
            result.skipped += 1;
            continue;
        }

        let rel_path = state
            .captured_sessions
            .get(&session.session_id)
            .map(|s| s.output_path.clone())
            .unwrap_or_else(|| output_rel_path(&content));

        if dry_run {
            eprintln!(
                "  [dry-run] {} → {} ({} messages)",
                session.session_id,
                rel_path,
                content.messages.len()
            );
        } else {
            let md = to_markdown(&content);
            super::files::write_note(sync_dir, &rel_path, &md)?;
        }

        let is_new = !state.captured_sessions.contains_key(&session.session_id);
        state.captured_sessions.insert(
            session.session_id.clone(),
            SessionState {
                last_line_count: content.total_lines,
                output_path: rel_path,
                last_capture_ts: session.last_ts,
            },
        );

        if is_new {
            result.new_sessions += 1;
        } else {
            result.updated_sessions += 1;
        }
    }

    if !dry_run {
        state.save(&state_path)?;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::sync::Mutex;

    static HOME_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct HomeOverride {
        original: Option<OsString>,
    }

    impl HomeOverride {
        fn set(path: &Path) -> Self {
            let original = std::env::var_os("HOME");
            std::env::set_var("HOME", path);
            Self { original }
        }
    }

    impl Drop for HomeOverride {
        fn drop(&mut self) {
            if let Some(original) = self.original.take() {
                std::env::set_var("HOME", original);
            } else {
                std::env::remove_var("HOME");
            }
        }
    }

    #[test]
    fn content_text_skips_internal_command_markers() {
        assert_eq!(
            content_value_to_text(Some(&serde_json::Value::String(
                "<command-name>/save</command-name>".to_string()
            ))),
            None
        );
        assert_eq!(
            content_value_to_text(Some(&serde_json::json!([
                { "type": "tool_call", "text": "ignored" },
                { "type": "input_text", "text": "kept" }
            ]))),
            Some("kept".to_string())
        );
    }

    #[test]
    fn skip_session_entry_identifies_non_conversation_entries() {
        let system_entry = SessionEntry {
            entry_type: "system".to_string(),
            message: None,
            timestamp: None,
            custom_title: None,
            is_meta: None,
            is_snapshot_update: None,
            payload: None,
        };
        let snapshot_entry = SessionEntry {
            entry_type: "message".to_string(),
            message: None,
            timestamp: None,
            custom_title: None,
            is_meta: None,
            is_snapshot_update: Some(true),
            payload: None,
        };
        let message_entry = SessionEntry {
            entry_type: "message".to_string(),
            message: None,
            timestamp: None,
            custom_title: None,
            is_meta: None,
            is_snapshot_update: None,
            payload: None,
        };

        assert!(should_skip_session_entry(&system_entry));
        assert!(should_skip_session_entry(&snapshot_entry));
        assert!(!should_skip_session_entry(&message_entry));
    }

    #[test]
    fn codex_history_discovery_uses_prefixed_session_ids_and_epoch_ms() {
        let dir = tempfile::tempdir().unwrap();
        let history_path = dir.path().join("history.jsonl");
        std::fs::write(
            &history_path,
            concat!(
                r#"{"session_id":"abc123","ts":1715000000,"text":"first prompt"}"#,
                "\n",
                r#"{"session_id":"abc123","ts":1715000060,"text":"follow up"}"#,
                "\n",
            ),
        )
        .unwrap();

        let mut state = CaptureState::default();
        let sessions = discover_codex_sessions(&history_path, &mut state).unwrap();

        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "codex:abc123");
        assert_eq!(sessions[0].project, "Codex");
        assert_eq!(sessions[0].source, CaptureSource::Codex);
        assert_eq!(sessions[0].first_ts, 1_715_000_000_000);
        assert_eq!(sessions[0].last_ts, 1_715_000_060_000);
        assert_eq!(sessions[0].display_texts, vec!["first prompt", "follow up"]);
        assert!(state.codex_history_byte_offset > 0);

        let sessions = discover_codex_sessions(&history_path, &mut state).unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn codex_extraction_uses_event_messages_without_response_item_duplicates() {
        let _guard = HOME_ENV_LOCK.lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let _home_override = HomeOverride::set(home.path());

        let session_id = "019e2b97-70c0-7331-8522-04aca9e8055f";
        let session_dir = home.path().join(".codex/sessions/2026/05/15");
        std::fs::create_dir_all(&session_dir).unwrap();
        std::fs::write(
            session_dir.join(format!("rollout-2026-05-15T20-23-25-{session_id}.jsonl")),
            concat!(
                r#"{"timestamp":"2026-05-15T12:00:00Z","type":"event_msg","payload":{"type":"user_message","message":"hello codex"}}"#,
                "\n",
                r#"{"timestamp":"2026-05-15T12:00:01Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello codex"}]}}"#,
                "\n",
                r#"{"timestamp":"2026-05-15T12:00:02Z","type":"event_msg","payload":{"type":"agent_message","message":"hi back"}}"#,
                "\n",
                r#"{"timestamp":"2026-05-15T12:00:03Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hi back"}]}}"#,
                "\n",
            ),
        )
        .unwrap();

        let session = SessionInfo {
            session_id: format!("codex:{session_id}"),
            project: "Codex".to_string(),
            first_ts: 1_715_774_400_000,
            last_ts: 1_715_774_400_000,
            display_texts: vec!["hello codex".to_string()],
            source: CaptureSource::Codex,
        };

        let content = extract_conversation(&session, &CaptureState::default()).unwrap();

        assert_eq!(content.messages.len(), 2);
        assert_eq!(content.title, "hello codex");
        assert_eq!(content.project, "Codex");
        assert_eq!(content.source, CaptureSource::Codex);
        assert_eq!(content.total_lines, 4);
        assert_eq!(content.messages[0].role, "user");
        assert_eq!(content.messages[0].text, "hello codex");
        assert_eq!(content.messages[1].role, "assistant");
        assert_eq!(content.messages[1].text, "hi back");

        let markdown = to_markdown(&content);
        assert!(markdown.contains("source: codex-capture"));
        assert!(markdown.contains(&format!("session_id: codex:{session_id}")));
        assert!(markdown.contains("project: Codex"));
    }
}
