//! Canonical display-title extraction for Markdown-backed documents.
//!
//! The title is a presentation value, not a rewrite of the document body. The
//! first H1 is therefore only a fallback when frontmatter does not provide a
//! title.

use super::frontmatter::scalar_value as frontmatter_value;
use std::path::Path;

/// Extract the title used by lists, search results, recent activity, and other
/// document surfaces.
///
/// Priority:
/// 1. `frontmatter.title`
/// 2. the first level-one Markdown heading
/// 3. a short body summary for generated date-named files and text clips
/// 4. the file stem
pub fn extract_display_title(path: &Path, rel_path: &str, content: &str) -> String {
    let body = markdown_body(content);

    if let Some(title) = frontmatter_title(content) {
        return title;
    }
    if let Some(title) = first_h1_title(body) {
        return title;
    }

    let stem = file_stem(path);
    if should_use_body_summary(&stem, rel_path, content) {
        if let Some(summary) = body_summary(body) {
            return summary;
        }
    }

    if !stem.is_empty() {
        return stem;
    }
    if !rel_path.trim().is_empty() {
        return rel_path.to_string();
    }
    "Untitled".to_string()
}

fn frontmatter_title(content: &str) -> Option<String> {
    frontmatter_value(content.trim_start_matches('\u{feff}'), "title")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn markdown_body(content: &str) -> &str {
    let content = content.trim_start_matches('\u{feff}');
    if !content.starts_with("---") {
        return content;
    }
    let Some(rest) = content.strip_prefix("---") else {
        return content;
    };
    let rest = rest.strip_prefix('\r').unwrap_or(rest);
    let Some(rest) = rest.strip_prefix('\n') else {
        return content;
    };
    let Some(end) = rest.find("\n---") else {
        return content;
    };
    let body = &rest[end + 4..];
    body.strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))
        .unwrap_or(body)
}

fn first_h1_title(body: &str) -> Option<String> {
    body.lines().find_map(|line| {
        let heading = line.trim_start().strip_prefix('#')?;
        if heading.starts_with('#') || !heading.chars().next().is_some_and(char::is_whitespace) {
            return None;
        }
        let title = heading.trim().trim_end_matches('#').trim();
        (!title.is_empty()).then(|| title.to_string())
    })
}

fn body_summary(body: &str) -> Option<String> {
    let summary = body
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with('#')
                && !line.starts_with("![")
                && !line.starts_with("```")
        })
        .take(3)
        .collect::<Vec<_>>()
        .join("\n");
    let summary = summary.chars().take(200).collect::<String>();
    (!summary.is_empty()).then_some(summary)
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .trim()
        .to_string()
}

fn is_generated_date_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() >= 10
        && bytes[0..4].iter().all(u8::is_ascii_digit)
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(u8::is_ascii_digit)
}

fn is_clip_path(rel_path: &str) -> bool {
    rel_path.replace('\\', "/").starts_with("clips/")
}

fn is_text_clip(content: &str) -> bool {
    frontmatter_value(content.trim_start_matches('\u{feff}'), "source")
        .is_some_and(|source| source == "clipboard")
}

fn should_use_body_summary(stem: &str, rel_path: &str, content: &str) -> bool {
    is_generated_date_name(stem) || (is_clip_path(rel_path) && is_text_clip(content))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn title(path: &str, content: &str) -> String {
        extract_display_title(Path::new(path), path, content)
    }

    #[test]
    fn frontmatter_title_has_highest_priority() {
        assert_eq!(
            title(
                "notes/scratch/2026-07-15-001.md",
                "---\ntitle: Canonical title\n---\n\n# Heading\n\nBody"
            ),
            "Canonical title"
        );
    }

    #[test]
    fn first_h1_is_used_when_frontmatter_title_is_missing() {
        assert_eq!(
            title("notes/manual/example.md", "Intro\n\n# Heading #\n\nBody"),
            "Heading"
        );
    }

    #[test]
    fn generated_date_file_uses_body_summary_before_stem() {
        assert_eq!(
            title(
                "notes/scratch/2026-07-15-001.md",
                "---\ndate: 2026-07-15\n---\n\nA generated note summary."
            ),
            "A generated note summary."
        );
    }

    #[test]
    fn text_clip_uses_body_summary_even_when_name_is_time_based() {
        assert_eq!(
            title(
                "clips/15-19-34-http.md",
                "---\nsource: clipboard\n---\n\nhttps://example.test"
            ),
            "https://example.test"
        );
    }

    #[test]
    fn image_clip_does_not_use_image_markup_as_title() {
        assert_eq!(
            title(
                "clips/15-23-33-screenshot.md",
                "---\nsource: clipboard-image\n---\n\n![screenshot](shot.png)"
            ),
            "15-23-33-screenshot"
        );
    }

    #[test]
    fn ordinary_file_falls_back_to_stem() {
        assert_eq!(
            title("notes/manual/readme.md", "Body without a heading"),
            "readme"
        );
    }
}
