//! Small YAML-frontmatter helpers shared by indexing and datetime parsing.

/// First YAML frontmatter block only (`---` ... `---`).
pub fn block(content: &str) -> Option<&str> {
    if !content.starts_with("---") {
        return None;
    }
    let rest = content.strip_prefix("---")?;
    let rest = rest.strip_prefix('\r').unwrap_or(rest);
    let rest = rest.strip_prefix('\n')?;
    let end = rest.find("\n---")?;
    Some(rest[..end].trim())
}

pub fn strip_scalar_quotes(value: &str) -> &str {
    let value = value.trim();
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        if (bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'')
        {
            return &value[1..value.len() - 1];
        }
    }
    value
}

pub fn scalar_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    block(content)?.lines().find_map(|line| {
        let (candidate, value) = line.trim().split_once(':')?;
        if candidate.trim() != key {
            return None;
        }
        let value = strip_scalar_quotes(value).trim();
        (!value.is_empty()).then_some(value)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scalar_value_reads_quoted_value_with_colon() {
        let content = "---\ntitle: \"Dashboard: quick note\"\n---\n\nBody";
        assert_eq!(
            scalar_value(content, "title"),
            Some("Dashboard: quick note")
        );
    }

    #[test]
    fn scalar_value_ignores_non_frontmatter_content() {
        assert_eq!(scalar_value("title: Body text", "title"), None);
    }
}
