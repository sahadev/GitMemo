use anyhow::Result;
use chrono::Local;
use std::path::{Path, PathBuf};

fn local_timestamp(now: &chrono::DateTime<Local>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

/// Get the sync directory path
pub fn sync_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot find home directory")
        .join(".gitmemo")
}

/// Create the directory structure for the sync repo
pub fn create_directory_structure(base: &Path) -> Result<()> {
    let dirs = [
        "conversations",
        "notes/manual",
        "notes/scratch",
        ".metadata",
    ];

    for dir in &dirs {
        std::fs::create_dir_all(base.join(dir))?;
    }

    // Create .gitignore
    std::fs::write(
        base.join(".gitignore"),
        ".metadata/\n.ssh/\n.backups/\n",
    )?;

    Ok(())
}

/// Write a markdown file and return its path
pub fn write_note(base: &Path, rel_path: &str, content: &str) -> Result<PathBuf> {
    let full_path = base.join(rel_path);
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full_path, content)?;
    Ok(full_path)
}

pub fn refresh_updated_frontmatter(content: &str, now: &chrono::DateTime<Local>) -> String {
    let updated_line = format!("updated: {}", local_timestamp(now));

    if !content.starts_with("---") {
        return content.to_string();
    }

    let Some(rest) = content.strip_prefix("---") else {
        return content.to_string();
    };
    let rest = rest.strip_prefix('\r').unwrap_or(rest);
    let Some(rest) = rest.strip_prefix('\n') else {
        return content.to_string();
    };
    let Some(end) = rest.find("\n---") else {
        return content.to_string();
    };

    let frontmatter = &rest[..end];
    let body = &rest[end + 4..];
    let mut lines = Vec::new();
    let mut replaced = false;

    for line in frontmatter.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("updated:") {
            let indent_len = line.len() - trimmed.len();
            let indent = &line[..indent_len];
            lines.push(format!("{}{}", indent, updated_line));
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !replaced {
        lines.push(updated_line);
    }

    format!("---\n{}\n---{}", lines.join("\n"), body)
}

pub fn normalize_date_only_frontmatter(content: &str, now: &chrono::DateTime<Local>) -> String {
    if !content.starts_with("---") {
        return content.to_string();
    }

    let Some(rest) = content.strip_prefix("---") else {
        return content.to_string();
    };
    let rest = rest.strip_prefix('\r').unwrap_or(rest);
    let Some(rest) = rest.strip_prefix('\n') else {
        return content.to_string();
    };
    let Some(end) = rest.find("\n---") else {
        return content.to_string();
    };

    let frontmatter = &rest[..end];
    let body = &rest[end + 4..];
    let current_date = now.format("%Y-%m-%d").to_string();
    let full_timestamp = local_timestamp(now);
    let activity_key = ["updated:", "date:", "created:"].into_iter().find(|key| {
        frontmatter
            .lines()
            .any(|line| line.trim_start().starts_with(key))
    });
    let mut changed = false;
    let lines: Vec<String> = frontmatter
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            if activity_key.is_some_and(|key| trimmed.starts_with(key)) {
                let Some((key, value)) = trimmed.split_once(':') else {
                    return line.to_string();
                };
                let value = value.trim().trim_matches('"').trim_matches('\'');
                if value == current_date {
                    let indent_len = line.len() - trimmed.len();
                    changed = true;
                    return format!("{}{}: {}", &line[..indent_len], key, full_timestamp);
                }
            }
            line.to_string()
        })
        .collect();

    if changed {
        format!("---\n{}\n---{}", lines.join("\n"), body)
    } else {
        content.to_string()
    }
}

pub fn normalize_repo_date_only_frontmatter(base: &Path) -> Result<u32> {
    let mut changed = 0u32;
    let now = Local::now();
    for subdir in ["conversations", "notes", "clips", "plans", "imports"] {
        let root = base.join(subdir);
        if !root.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&root)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "md"))
        {
            let path = entry.path();
            let content = std::fs::read_to_string(path)?;
            let normalized = normalize_date_only_frontmatter(&content, &now);
            if normalized != content {
                std::fs::write(path, normalized)?;
                changed += 1;
            }
        }
    }
    Ok(changed)
}

/// Create a scratch note, returns relative path
pub fn create_scratch(base: &Path, content: &str) -> Result<String> {
    let now = Local::now();
    let date_str = now.format("%Y-%m-%d").to_string();

    // Find next sequence number
    let scratch_dir = base.join("notes/scratch");
    std::fs::create_dir_all(&scratch_dir)?;
    let mut seq = 1u32;
    loop {
        let candidate = scratch_dir.join(format!("{}-{:03}.md", date_str, seq));
        if !candidate.exists() {
            break;
        }
        seq += 1;
    }

    let filename = format!("{}-{:03}.md", date_str, seq);
    let rel_path = format!("notes/scratch/{}", filename);

    let md = format!(
        "---\ndate: {}\n---\n\n{}\n",
        local_timestamp(&now),
        content
    );

    write_note(base, &rel_path, &md)?;
    Ok(rel_path)
}

/// Create or append to a manual
pub fn write_manual(base: &Path, title: &str, content: &str, append: bool) -> Result<String> {
    // Sanitize title for filename
    let safe_title: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect();
    let safe_title = safe_title.trim().replace(' ', "-");

    let rel_path = format!("notes/manual/{}.md", safe_title);
    let full_path = base.join(&rel_path);

    std::fs::create_dir_all(full_path.parent().unwrap())?;
    let now = Local::now();

    if append && full_path.exists() {
        let existing = std::fs::read_to_string(&full_path)?;
        let mut updated = refresh_updated_frontmatter(&existing, &now);
        updated.push_str(&format!("\n\n{}\n", content));
        std::fs::write(&full_path, updated)?;
    } else {
        let now = Local::now();
        let md = format!(
            "---\ntitle: {}\ncreated: {}\nupdated: {}\n---\n\n# {}\n\n{}\n",
            title,
            local_timestamp(&now),
            local_timestamp(&now),
            title,
            content
        );
        std::fs::write(&full_path, md)?;
    }

    Ok(rel_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_directory_structure() {
        let tmp = tempfile::tempdir().unwrap();
        create_directory_structure(tmp.path()).unwrap();

        assert!(tmp.path().join("conversations").is_dir());
        assert!(tmp.path().join("notes/manual").is_dir());
        assert!(tmp.path().join("notes/scratch").is_dir());
        assert!(tmp.path().join(".metadata").is_dir());
        assert!(tmp.path().join(".gitignore").exists());
    }

    #[test]
    fn test_refresh_updated_frontmatter_replaces_existing() {
        let now = Local::now();
        let content = "---\ntitle: A\nupdated: 2025-01-01T00:00:00+08:00\n---\n\nBody\n";
        let updated = refresh_updated_frontmatter(content, &now);
        assert!(updated.contains("updated:"));
        assert!(!updated.contains("updated: 2025-01-01T00:00:00+08:00"));
        assert!(updated.contains("Body"));
    }

    #[test]
    fn test_refresh_updated_frontmatter_inserts_missing() {
        let now = Local::now();
        let content = "---\ndate: 2025-04-13\n---\n\nBody\n";
        let updated = refresh_updated_frontmatter(content, &now);
        assert!(updated.contains("date: 2025-04-13"));
        assert!(updated.contains("updated:"));
    }

    #[test]
    fn test_normalize_date_only_frontmatter_replaces_current_date() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-05-24T20:33:22+08:00")
            .unwrap()
            .with_timezone(&Local);
        let expected = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
        let content = "---\ntitle: 深夜代码\ndate: 2026-05-24\n---\n\nBody\n";
        let normalized = normalize_date_only_frontmatter(content, &now);
        assert!(normalized.contains(&format!("date: {expected}")));
    }

    #[test]
    fn test_normalize_date_only_frontmatter_keeps_historical_date() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-05-24T20:33:22+08:00")
            .unwrap()
            .with_timezone(&Local);
        let content = "---\ndate: 2026-05-20\n---\n\nBody\n";
        let normalized = normalize_date_only_frontmatter(content, &now);
        assert_eq!(normalized, content);
    }

    #[test]
    fn test_normalize_date_only_frontmatter_keeps_date_when_updated_exists() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-05-24T20:33:22+08:00")
            .unwrap()
            .with_timezone(&Local);
        let content = "---\ndate: 2026-05-24\nupdated: 2026-05-24T18:00:00+08:00\n---\n\nBody\n";
        let normalized = normalize_date_only_frontmatter(content, &now);
        assert_eq!(normalized, content);
    }

    #[test]
    fn test_normalize_date_only_frontmatter_replaces_updated_activity() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-05-24T20:33:22+08:00")
            .unwrap()
            .with_timezone(&Local);
        let expected = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
        let content = "---\ndate: 2026-05-20\nupdated: 2026-05-24\n---\n\nBody\n";
        let normalized = normalize_date_only_frontmatter(content, &now);
        assert!(normalized.contains(&format!("updated: {expected}")));
        assert!(normalized.contains("date: 2026-05-20"));
    }

    #[test]
    fn test_write_note() {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_note(tmp.path(), "notes/test.md", "# Hello\n\nWorld").unwrap();
        assert!(path.exists());
        let content = std::fs::read_to_string(path).unwrap();
        assert!(content.contains("# Hello"));
    }

    #[test]
    fn test_create_scratch() {
        let tmp = tempfile::tempdir().unwrap();
        let rel = create_scratch(tmp.path(), "Quick note").unwrap();
        assert!(rel.starts_with("notes/scratch/"));
        assert!(rel.ends_with("-001.md"));

        let content = std::fs::read_to_string(tmp.path().join(&rel)).unwrap();
        assert!(content.contains("Quick note"));
        assert!(content.contains("date:"));
    }

    #[test]
    fn test_create_scratch_sequential() {
        let tmp = tempfile::tempdir().unwrap();
        let r1 = create_scratch(tmp.path(), "First").unwrap();
        let r2 = create_scratch(tmp.path(), "Second").unwrap();
        assert!(r1.ends_with("-001.md"));
        assert!(r2.ends_with("-002.md"));
    }

    #[test]
    fn test_write_manual_new() {
        let tmp = tempfile::tempdir().unwrap();
        let rel = write_manual(tmp.path(), "My Guide", "Guide content here", false).unwrap();
        assert_eq!(rel, "notes/manual/My-Guide.md");

        let content = std::fs::read_to_string(tmp.path().join(&rel)).unwrap();
        assert!(content.contains("title: My Guide"));
        assert!(content.contains("# My Guide"));
        assert!(content.contains("Guide content here"));
    }

    #[test]
    fn test_write_manual_append() {
        let tmp = tempfile::tempdir().unwrap();
        write_manual(tmp.path(), "Log", "Entry 1", false).unwrap();
        let rel = write_manual(tmp.path(), "Log", "Entry 2", true).unwrap();

        let content = std::fs::read_to_string(tmp.path().join(&rel)).unwrap();
        assert!(content.contains("Entry 1"));
        assert!(content.contains("Entry 2"));
        assert_eq!(content.matches("updated:").count(), 1);
    }

    #[test]
    fn test_write_manual_sanitizes_title() {
        let tmp = tempfile::tempdir().unwrap();
        let rel = write_manual(tmp.path(), "My/Bad:Title", "content", false).unwrap();
        assert_eq!(rel, "notes/manual/My_Bad_Title.md");
    }
}
