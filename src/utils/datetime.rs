//! Parse “record created” time from Markdown frontmatter for UI sorting / display.

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

/// Parse values produced by GitMemo / editors: RFC3339, date-only, legacy `YYYY-MM-DD HH:mm:ss`.
fn parse_gitmemo_datetime(s: &str) -> Option<DateTime<Local>> {
    let s = strip_yaml_scalar_quotes(s).trim();
    if s.is_empty() {
        return None;
    }
    let s = s.strip_suffix(" UTC").unwrap_or(s).trim();
    let candidate = if s.contains(' ') && !s.contains('T') {
        format!("{}T{}", &s[..10], &s[11..])
    } else {
        s.to_string()
    };

    if let Ok(dt) = DateTime::parse_from_rfc3339(&candidate) {
        return Some(dt.with_timezone(&Local));
    }
    if let Ok(d) = NaiveDate::parse_from_str(&candidate, "%Y-%m-%d") {
        let naive = d.and_hms_opt(0, 0, 0)?;
        return Local.from_local_datetime(&naive).latest();
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(&candidate, "%Y-%m-%d %H:%M:%S") {
        return Local.from_local_datetime(&naive).latest();
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(&candidate, "%Y-%m-%d %H:%M") {
        return Local.from_local_datetime(&naive).latest();
    }
    None
}

/// Prefer frontmatter `date` / `created` / `updated`; otherwise use file `modified` time.
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

    if let Some(raw) = frontmatter_record_datetime_raw(content) {
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
    fn record_time_falls_back_to_mtime() {
        let md = "# no frontmatter\n\nx";
        let t = SystemTime::UNIX_EPOCH;
        let (s, ms) = record_timestamp_for_markdown(md, t);
        assert!(s.contains("1970"));
        assert_eq!(ms, 0);
    }
}
