pub fn frontmatter_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let fm = &rest[..end];
    let prefix = format!("{}:", key);
    for line in fm.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix(&prefix) {
            let value = v.trim().trim_matches('"').trim_matches('\'').trim();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

pub fn markdown_body(content: &str) -> &str {
    if !content.starts_with("---") {
        return content;
    }
    let Some(end) = content[3..].find("---") else {
        return content;
    };
    content[3 + end + 3..].trim_start()
}
