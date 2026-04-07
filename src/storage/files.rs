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
        "notes/daily",
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

/// Append to today's daily note (create if not exists)
pub fn append_daily(base: &Path, content: &str) -> Result<String> {
    let now = Local::now();
    let date_str = now.format("%Y-%m-%d").to_string();
    let rel_path = format!("notes/daily/{}.md", date_str);
    let full_path = base.join(&rel_path);

    std::fs::create_dir_all(full_path.parent().unwrap())?;

    if full_path.exists() {
        // Append
        let mut existing = std::fs::read_to_string(&full_path)?;
        existing.push_str(&format!(
            "\n## {} - \n\n{}\n",
            now.format("%H:%M"),
            content
        ));
        std::fs::write(&full_path, existing)?;
    } else {
        // Create new
        let md = format!(
            "---\ndate: {}\n---\n\n# {}\n\n## {} - \n\n{}\n",
            date_str,
            date_str,
            now.format("%H:%M"),
            content
        );
        std::fs::write(&full_path, md)?;
    }

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

    if append && full_path.exists() {
        let mut existing = std::fs::read_to_string(&full_path)?;
        existing.push_str(&format!("\n\n{}\n", content));
        std::fs::write(&full_path, existing)?;
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
