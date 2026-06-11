use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretKind {
    ApiKey,
    Password,
    Token,
    Jwt,
    PrivateKey,
    CloudKey,
    KeystorePassword,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecretFinding {
    pub kind: SecretKind,
    pub severity: SecretSeverity,
    pub line: usize,
    pub start: usize,
    pub end: usize,
    pub fingerprint: String,
    pub preview: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecretScan {
    pub has_secret: bool,
    pub highest_severity: SecretSeverity,
    pub findings: Vec<SecretFinding>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Span {
    kind: SecretKind,
    severity: SecretSeverity,
    start: usize,
    end: usize,
}

const REDACTION: &str = "***";

pub fn scan_text(content: &str) -> SecretScan {
    let findings = collect_spans(content)
        .into_iter()
        .map(|span| {
            let secret = content.get(span.start..span.end).unwrap_or_default();
            SecretFinding {
                kind: span.kind,
                severity: span.severity,
                line: line_for_offset(content, span.start),
                start: span.start,
                end: span.end,
                fingerprint: fingerprint(secret),
                preview: redacted_preview(secret),
            }
        })
        .collect::<Vec<_>>();
    let highest_severity = findings
        .iter()
        .map(|finding| finding.severity)
        .max_by_key(|severity| severity_rank(*severity))
        .unwrap_or(SecretSeverity::Low);

    SecretScan {
        has_secret: !findings.is_empty(),
        highest_severity,
        findings,
    }
}

pub fn redact_text(content: &str) -> String {
    let spans = collect_spans(content);
    if spans.is_empty() {
        return content.to_string();
    }
    apply_redactions(content, &spans)
}

pub fn dominant_kind(scan: &SecretScan) -> SecretKind {
    scan.findings
        .iter()
        .max_by_key(|finding| severity_rank(finding.severity))
        .map(|finding| finding.kind)
        .unwrap_or(SecretKind::Unknown)
}

fn collect_spans(content: &str) -> Vec<Span> {
    let mut spans = Vec::new();
    spans.extend(private_key_spans(content));

    let mut offset = 0;
    for line in content.split_inclusive('\n') {
        let logical = line.strip_suffix('\n').unwrap_or(line);
        spans.extend(key_value_spans(logical, offset));
        spans.extend(pattern_spans(logical, offset));
        offset += line.len();
    }
    if !content.ends_with('\n') && content.is_empty() {
        spans.extend(key_value_spans(content, 0));
        spans.extend(pattern_spans(content, 0));
    }

    normalize_spans(spans)
}

fn private_key_spans(content: &str) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut search_from = 0;
    while let Some(begin_rel) = content[search_from..].find("-----BEGIN ") {
        let begin = search_from + begin_rel;
        let Some(begin_line_end_rel) = content[begin..].find('\n') else {
            break;
        };
        let begin_line_end = begin + begin_line_end_rel;
        let begin_line = &content[begin..begin_line_end];
        if !begin_line.contains("PRIVATE KEY-----") {
            search_from = begin_line_end;
            continue;
        }

        let end = if let Some(end_rel) = content[begin_line_end..].find("-----END ") {
            let marker_start = begin_line_end + end_rel;
            if let Some(marker_end_rel) = content[marker_start..].find('\n') {
                marker_start + marker_end_rel
            } else {
                content.len()
            }
        } else {
            begin_line_end
        };

        spans.push(Span {
            kind: SecretKind::PrivateKey,
            severity: SecretSeverity::Critical,
            start: begin,
            end,
        });
        search_from = end;
    }
    spans
}

fn key_value_spans(line: &str, line_offset: usize) -> Vec<Span> {
    let mut spans = Vec::new();
    let Some((sep_index, sep)) = first_assignment_separator(line) else {
        return spans;
    };
    let key = line[..sep_index].trim();
    if key.is_empty() || key.len() > 96 || !is_sensitive_key_name(key) {
        return spans;
    }
    let value_start = sep_index + sep.len();
    let value = &line[value_start..];
    let trimmed_start = value.len() - value.trim_start().len();
    let trimmed = value.trim_start();
    if trimmed.is_empty() {
        return spans;
    }
    let quote = trimmed.chars().next().filter(|c| *c == '"' || *c == '\'');
    let inner_start = value_start + trimmed_start + quote.map(char::len_utf8).unwrap_or(0);
    let inner = quote.map_or(trimmed, |q| &trimmed[q.len_utf8()..]);
    let inner_end_rel = secret_value_end(inner, quote);
    if inner_end_rel < 6 || is_placeholder_secret(&inner[..inner_end_rel]) {
        return spans;
    }

    spans.push(Span {
        kind: key_kind(key),
        severity: key_severity(key),
        start: line_offset + inner_start,
        end: line_offset + inner_start + inner_end_rel,
    });
    spans
}

fn first_assignment_separator(line: &str) -> Option<(usize, &'static str)> {
    let eq = line.find('=').map(|index| (index, "="));
    let colon = line.find(':').map(|index| (index, ":"));
    match (eq, colon) {
        (Some(a), Some(b)) => Some(if a.0 < b.0 { a } else { b }),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn is_sensitive_key_name(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>()
        .to_ascii_lowercase();
    [
        "password",
        "passwd",
        "passphrase",
        "secret",
        "token",
        "api_key",
        "apikey",
        "access_key",
        "private_key",
        "storepassword",
        "keypassword",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn key_kind(key: &str) -> SecretKind {
    let lower = key.to_ascii_lowercase();
    if lower.contains("storepassword") || lower.contains("keypassword") {
        SecretKind::KeystorePassword
    } else if lower.contains("password") || lower.contains("passwd") || lower.contains("passphrase")
    {
        SecretKind::Password
    } else if lower.contains("api") || lower.contains("access_key") {
        SecretKind::ApiKey
    } else if lower.contains("private_key") {
        SecretKind::PrivateKey
    } else if lower.contains("token") {
        SecretKind::Token
    } else {
        SecretKind::Unknown
    }
}

fn key_severity(key: &str) -> SecretSeverity {
    match key_kind(key) {
        SecretKind::PrivateKey | SecretKind::KeystorePassword => SecretSeverity::Critical,
        SecretKind::Password | SecretKind::ApiKey | SecretKind::Token => SecretSeverity::High,
        _ => SecretSeverity::Medium,
    }
}

fn secret_value_end(value: &str, quote: Option<char>) -> usize {
    for (index, ch) in value.char_indices() {
        if quote.is_some_and(|q| ch == q) {
            return index;
        }
        if quote.is_none()
            && (ch.is_whitespace() || ch == ',' || ch == ';' || ch == ')' || ch == ']' || ch == '}')
        {
            return index;
        }
    }
    value.len()
}

fn pattern_spans(line: &str, line_offset: usize) -> Vec<Span> {
    let mut spans = Vec::new();
    spans.extend(regex_spans(
        line,
        line_offset,
        r"sk-[A-Za-z0-9_-]{16,}",
        SecretKind::ApiKey,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"github_pat_[A-Za-z0-9_]{20,}",
        SecretKind::Token,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"gh[pousr]_[A-Za-z0-9_]{20,}",
        SecretKind::Token,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"(AKIA|ASIA)[0-9A-Z]{16}",
        SecretKind::CloudKey,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"AIza[0-9A-Za-z_-]{20,}",
        SecretKind::CloudKey,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"xox[baprs]-[A-Za-z0-9-]{20,}",
        SecretKind::Token,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"Bearer[[:space:]]+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
        SecretKind::Jwt,
        SecretSeverity::High,
    ));
    spans.extend(regex_spans(
        line,
        line_offset,
        r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
        SecretKind::Jwt,
        SecretSeverity::High,
    ));
    spans
}

fn regex_spans(
    line: &str,
    line_offset: usize,
    pattern: &str,
    kind: SecretKind,
    severity: SecretSeverity,
) -> Vec<Span> {
    let Ok(re) = regex_lite::Regex::new(pattern) else {
        return Vec::new();
    };
    re.find_iter(line)
        .filter(|m| !is_placeholder_secret(m.as_str()))
        .map(|m| Span {
            kind,
            severity,
            start: line_offset + m.start(),
            end: line_offset + m.end(),
        })
        .collect()
}

fn normalize_spans(mut spans: Vec<Span>) -> Vec<Span> {
    spans.sort_by_key(|span| (span.start, span.end));
    let mut normalized: Vec<Span> = Vec::new();
    for span in spans {
        if span.start >= span.end {
            continue;
        }
        if let Some(last) = normalized.last_mut() {
            if span.start < last.end {
                if severity_rank(span.severity) > severity_rank(last.severity) {
                    last.kind = span.kind;
                    last.severity = span.severity;
                }
                last.end = last.end.max(span.end);
                continue;
            }
        }
        normalized.push(span);
    }
    normalized
}

fn apply_redactions(content: &str, spans: &[Span]) -> String {
    let mut output = String::with_capacity(content.len());
    let mut cursor = 0;
    for span in spans {
        if span.start < cursor {
            continue;
        }
        output.push_str(&content[cursor..span.start]);
        output.push_str(REDACTION);
        cursor = span.end;
    }
    output.push_str(&content[cursor..]);
    output
}

fn line_for_offset(content: &str, offset: usize) -> usize {
    content[..offset.min(content.len())]
        .bytes()
        .filter(|b| *b == b'\n')
        .count()
        + 1
}

fn fingerprint(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

fn redacted_preview(secret: &str) -> String {
    let mut chars = secret.chars();
    let prefix = chars.by_ref().take(4).collect::<String>();
    if prefix.is_empty() {
        REDACTION.to_string()
    } else {
        format!("{prefix}...")
    }
}

fn is_placeholder_secret(secret: &str) -> bool {
    let lower = secret.trim_matches(['"', '\'', '`']).to_ascii_lowercase();
    lower.is_empty()
        || lower.contains("your-key")
        || lower.contains("placeholder")
        || lower.contains("example")
        || lower.contains("<redacted>")
        || lower.chars().all(|ch| ch == '*' || ch == 'x')
}

fn severity_rank(severity: SecretSeverity) -> u8 {
    match severity {
        SecretSeverity::Low => 0,
        SecretSeverity::Medium => 1,
        SecretSeverity::High => 2,
        SecretSeverity::Critical => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_and_redacts_openai_style_key() {
        let input = "token sk-abcdefghijklmnopqrstuvwxyz1234567890 done";
        let scan = scan_text(input);
        assert!(scan.has_secret);
        assert_eq!(scan.findings[0].kind, SecretKind::ApiKey);
        assert_eq!(redact_text(input), "token *** done");
    }

    #[test]
    fn redacts_password_value_but_keeps_key() {
        let input = "DB_PASSWORD=super-secret-password";
        assert_eq!(redact_text(input), "DB_PASSWORD=***");
        let scan = scan_text(input);
        assert_eq!(scan.findings[0].kind, SecretKind::Password);
    }

    #[test]
    fn redacts_private_key_block() {
        let input = "a\n-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\nz";
        let output = redact_text(input);
        assert_eq!(output, "a\n***\nz");
        let scan = scan_text(input);
        assert_eq!(scan.findings[0].severity, SecretSeverity::Critical);
    }

    #[test]
    fn ignores_placeholder_values() {
        let input = "OPENAI_API_KEY=your-key";
        assert!(!scan_text(input).has_secret);
        assert_eq!(redact_text(input), input);
    }
}
