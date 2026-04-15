//! Parse Markdown frontmatter timestamps for authored-date metadata and activity-based UI sorting/display.

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone};
use std::time::SystemTime;

/// First YAML frontmatter block only (`---` … `---`).
fn frontmatter_block(content: &str) -> Option<&str> {
    if !content.starts_with("---") {
        return None;
    }
    let rest = content.strip_prefix("---")?;
    let rest = rest.strip_prefix('\r').unwrap_or(rest);
    let rest = rest.strip_prefix('\n')?;
    let end = rest.find("\n---")?;
    Some(rest[..end].trim())
}

fn strip_yaml_scalar_quotes(s: &str) -> &str {
    let s = s.trim();
    if s.len() >= 2 {
        let b = s.as_bytes();
        if (b[0] == b'"' && b[s.len() - 1] == b'"') || (b[0] == b'\'' && b[s.len() - 1] == b'\'') {
            return &s[1..s.len() - 1];
        }
    }
    s
}

/// Raw `date` / `created` / `updated` value from the first frontmatter block (in that order).
pub fn frontmatter_record_datetime_raw(content: &str) -> Option<String> {
    let fm = frontmatter_block(content)?;
    for key in ["date:", "created:", "updated:"] {
        for line in fm.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix(key) {
                let v = strip_yaml_scalar_quotes(v).trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// Raw `updated` / `date` / `created` value from the first frontmatter block (in that order).
pub fn frontmatter_activity_datetime_raw(content: &str) -> Option<String> {
    let fm = frontmatter_block(content)?;
    for key in ["updated:", "date:", "created:"] {
        for line in fm.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix(key) {
                let v = strip_yaml_scalar_quotes(v).trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// Parse values produced by GitMemo / editors: RFC3339, date-only, legacy `YYYY-MM-DD HH:mm:ss`.
fn parse_gitmemo_datetime(s: &str) -> Option<DateTime<Local>> {
    let s = strip_yaml_scalar_quotes(s).trim();
    if s.is_empty() {
        return None;
    }
    let s = s.strip_suffix(" UTC").unwrap_or(s).trim();

    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Local));
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let naive = d.and_hms_opt(0, 0, 0)?;
        return Local.from_local_datetime(&naive).latest();
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Local.from_local_datetime(&naive).latest();
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M") {
        return Local.from_local_datetime(&naive).latest();
    }
    if s.contains('T') && !s.contains(['+', 'Z']) {
        if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
            return Local.from_local_datetime(&naive).latest();
        }
        if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M") {
            return Local.from_local_datetime(&naive).latest();
        }
    }
    None
}

/// Prefer frontmatter `updated` / `date` / `created`; otherwise use file `modified` time.
/// Returns `(RFC3339 display string, unix millis for sorting)`.
///
/// Consumed by the `gitmemo-desktop` crate; the CLI binary does not reference it.
#[allow(dead_code)]
pub fn record_timestamp_for_markdown(content: &str, modified: SystemTime) -> (String, i64) {
    let fallback_ms = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let fallback_dt: DateTime<Local> = modified.into();
    let fallback_str = fallback_dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

    if let Some(raw) = frontmatter_activity_datetime_raw(content) {
        if let Some(dt) = parse_gitmemo_datetime(&raw) {
            let ms = dt.timestamp_millis();
            let s = dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
            return (s, ms);
        }
    }
    (fallback_str, fallback_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_prefers_date() {
        let md = "---\ntitle: A\ncreated: 2025-02-01\ndate: 2025-01-15T10:00:00+08:00\n---\n\nHi";
        assert_eq!(
            frontmatter_record_datetime_raw(md).as_deref(),
            Some("2025-01-15T10:00:00+08:00")
        );
    }

    #[test]
    fn activity_time_prefers_updated() {
        let md = "---\ntitle: A\ncreated: 2025-02-01\ndate: 2025-01-15T10:00:00+08:00\nupdated: 2025-03-01T09:30:00+08:00\n---\n\nHi";
        assert_eq!(
            frontmatter_activity_datetime_raw(md).as_deref(),
            Some("2025-03-01T09:30:00+08:00")
        );
    }

    #[test]
    fn record_timestamp_prefers_activity_time() {
        let md = "---\ndate: 2025-01-15T10:00:00+08:00\nupdated: 2025-03-01T09:30:00+08:00\n---\n\nHi";
        let t = SystemTime::UNIX_EPOCH;
        let (s, _) = record_timestamp_for_markdown(md, t);
        assert!(s.starts_with("2025-03-01T09:30:00"));
    }

    #[test]
    fn record_timestamp_parses_legacy_space_datetime() {
        let md = "---\ndate: 2026-03-31 22:43:39\n---\n\nHi";
        let t = SystemTime::UNIX_EPOCH;
        let (s, ms) = record_timestamp_for_markdown(md, t);
        assert!(s.starts_with("2026-03-31T22:43:39"));
        assert_ne!(ms, 0);
    }

    #[test]
    fn record_timestamp_parses_local_t_datetime_without_timezone() {
        let md = "---\ndate: 2026-03-31T22:43:39\n---\n\nHi";
        let t = SystemTime::UNIX_EPOCH;
        let (s, ms) = record_timestamp_for_markdown(md, t);
        assert!(s.starts_with("2026-03-31T22:43:39"));
        assert_ne!(ms, 0);
    }

    #[test]
    fn record_time_falls_back_to_mtime() {
        let md = "# no frontmatter\n\nx";
        let t = SystemTime::UNIX_EPOCH;
        let (s, ms) = record_timestamp_for_markdown(md, t);
        assert!(s.contains("1970"));
        assert_eq!(ms, 0);
    }
}
