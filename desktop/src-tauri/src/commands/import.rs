use super::markdown::{frontmatter_value, markdown_body};
use super::settings;
use gitmemo_core::storage::{files, git};
use serde::{Deserialize, Serialize};
use std::path::Path;

const SKIP_DIRECTORY_NAMES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".metadata",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".vite",
    "coverage",
    ".cache",
];

fn local_timestamp(now: &chrono::DateTime<chrono::Local>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

/// Supported file type categories for routing
#[derive(Debug, Clone, Serialize)]
pub enum FileCategory {
    Markdown,
    Image,
    Document, // PDF, Word, etc.
    Code,
    Other,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub success: bool,
    pub imported: Vec<ImportedFile>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportedFile {
    pub original_name: String,
    pub dest_path: String,
    pub category: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct ImportFileCheckResult {
    pub accepted: Vec<String>,
    pub rejected: Vec<ImportFileRejection>,
    pub max_size: u64,
}

#[derive(Debug, Serialize)]
pub struct ImportFileRejection {
    pub path: String,
    pub file_name: String,
    pub size: Option<u64>,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownImportDocument {
    pub file_name: String,
    pub content: String,
    pub size: u64,
}

/// Route a file to the correct gitmemo directory based on its type.
/// All imports land under `imports/` — file type only affects processing, not destination.
fn route_file(_filename: &str, ext: &str) -> (&'static str, FileCategory) {
    match ext.to_lowercase().as_str() {
        "md" | "markdown" | "mdx" => ("imports", FileCategory::Markdown),
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico" | "avif" => {
            ("imports", FileCategory::Image)
        }
        "pdf" | "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx" | "csv" | "tsv" | "rtf"
        | "odt" | "ods" | "odp" => ("imports", FileCategory::Document),
        "rs" | "py" | "js" | "ts" | "tsx" | "jsx" | "go" | "java" | "kt" | "swift" | "c"
        | "cpp" | "h" | "hpp" | "rb" | "php" | "sh" | "bash" | "zsh" | "fish" | "sql" | "yaml"
        | "yml" | "toml" | "json" | "xml" | "html" | "css" | "scss" | "sass" | "less" | "vue"
        | "svelte" => ("imports", FileCategory::Code),
        "txt" | "log" | "text" | "conf" | "cfg" | "ini" | "env" => {
            ("imports", FileCategory::Markdown)
        }
        _ => ("imports", FileCategory::Other),
    }
}

fn should_skip_directory_entry(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    name.starts_with('.') || SKIP_DIRECTORY_NAMES.contains(&name)
}

fn is_supported_directory_import_file(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase();

    matches!(
        ext.as_str(),
        "md" | "markdown"
            | "mdx"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "svg"
            | "webp"
            | "bmp"
            | "ico"
            | "avif"
            | "pdf"
            | "doc"
            | "docx"
            | "ppt"
            | "pptx"
            | "xls"
            | "xlsx"
            | "csv"
            | "tsv"
            | "rtf"
            | "odt"
            | "ods"
            | "odp"
            | "rs"
            | "py"
            | "js"
            | "ts"
            | "tsx"
            | "jsx"
            | "go"
            | "java"
            | "kt"
            | "swift"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "rb"
            | "php"
            | "sh"
            | "bash"
            | "zsh"
            | "fish"
            | "sql"
            | "yaml"
            | "yml"
            | "toml"
            | "json"
            | "xml"
            | "html"
            | "css"
            | "scss"
            | "sass"
            | "less"
            | "vue"
            | "svelte"
            | "txt"
            | "log"
            | "text"
            | "conf"
            | "cfg"
            | "ini"
            | "env"
    )
}

fn is_markdown_import_file(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase();

    is_markdown_import_extension(&ext)
}

fn is_markdown_import_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "md" | "markdown" | "mdx")
}

fn safe_file_name(file_name: &str) -> String {
    let normalized = file_name.replace('\\', "/");
    let candidate = normalized
        .split('/')
        .next_back()
        .unwrap_or("")
        .trim()
        .to_string();

    if candidate.is_empty() {
        "untitled.md".to_string()
    } else {
        candidate
    }
}

fn file_extension_from_name(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn file_stem_from_name(file_name: &str) -> String {
    Path::new(file_name)
        .file_stem()
        .and_then(|x| x.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .unwrap_or("untitled")
        .to_string()
}

fn first_markdown_heading(content: &str) -> Option<String> {
    markdown_body(content)
        .lines()
        .find_map(|line| line.trim_start().strip_prefix("# ").map(str::trim))
        .filter(|heading| !heading.is_empty())
        .map(|heading| heading.trim_end_matches('#').trim().to_string())
        .filter(|heading| !heading.is_empty())
}

fn import_title_from_markdown(content: &str) -> Option<String> {
    frontmatter_value(content, "title")
        .map(ToString::to_string)
        .or_else(|| first_markdown_heading(content))
}

fn sanitize_import_stem(stem: &str) -> String {
    let mut sanitized = String::new();
    let mut previous_was_space = false;
    for c in stem.chars() {
        let next = if c.is_control()
            || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        {
            ' '
        } else if c.is_whitespace() {
            ' '
        } else {
            c
        };

        if next == ' ' {
            if !previous_was_space {
                sanitized.push(' ');
                previous_was_space = true;
            }
        } else {
            sanitized.push(next);
            previous_was_space = false;
        }
    }
    let sanitized = sanitized
        .trim_matches(|c| c == ' ' || c == '_' || c == '-' || c == '.')
        .to_string();
    if sanitized.is_empty() {
        "untitled".to_string()
    } else {
        sanitized
            .chars()
            .take(80)
            .collect::<String>()
            .trim_matches(|c| c == ' ' || c == '_' || c == '-' || c == '.')
            .to_string()
    }
}

fn import_stem_for_markdown(file_name: &str, content: &str) -> String {
    import_title_from_markdown(content)
        .map(|title| sanitize_import_stem(&title))
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| sanitize_import_stem(&file_stem_from_name(file_name)))
}

fn unique_import_destination(sync_dir: &Path, base_dir: &str, stem: &str, ext: &str) -> String {
    let clean_stem = sanitize_import_stem(stem);
    let clean_ext = ext.trim_start_matches('.').trim();
    let mut counter = 0usize;

    loop {
        let suffix = if counter == 0 {
            String::new()
        } else {
            format!("-{}", counter)
        };
        let rel = format!("{}/{}{}.{}", base_dir, clean_stem, suffix, clean_ext);
        if !sync_dir.join(&rel).exists() {
            return rel;
        }
        counter += 1;
    }
}

fn markdown_destination(sync_dir: &Path, base_dir: &str, file_name: &str, content: &str) -> String {
    let stem = import_stem_for_markdown(file_name, content);
    unique_import_destination(sync_dir, base_dir, &stem, "md")
}

fn markdown_import_content(
    file_name: &str,
    content: &str,
    now: &chrono::DateTime<chrono::Local>,
) -> String {
    if content.starts_with("---") {
        return content.to_string();
    }

    let title = file_stem_from_name(file_name);
    format!(
        "---\ntitle: {}\ndate: {}\nsource: import\noriginal: {}\n---\n\n{}\n",
        title,
        local_timestamp(now),
        file_name,
        content
    )
}

fn read_text_lossy(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_sync_dir() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "gitmemo-import-test-{}-{}",
            std::process::id(),
            nonce
        ));
        std::fs::create_dir_all(dir.join("imports")).unwrap();
        dir
    }

    #[test]
    fn markdown_destination_uses_available_name_for_duplicates() {
        let sync_dir = temp_sync_dir();
        std::fs::write(sync_dir.join("imports/My Note.md"), "first").unwrap();
        std::fs::write(sync_dir.join("imports/My Note-1.md"), "second").unwrap();

        let dest = markdown_destination(&sync_dir, "imports", "note.md", "# My Note\n\nbody");

        assert_eq!(dest, "imports/My Note-2.md");
        let _ = std::fs::remove_dir_all(sync_dir);
    }

    #[test]
    fn markdown_destination_keeps_original_name_when_available() {
        let sync_dir = temp_sync_dir();

        let dest = markdown_destination(&sync_dir, "imports", "note.md", "body");

        assert_eq!(dest, "imports/note.md");
        let _ = std::fs::remove_dir_all(sync_dir);
    }

    #[test]
    fn markdown_destination_prefers_frontmatter_title() {
        let sync_dir = temp_sync_dir();

        let dest = markdown_destination(
            &sync_dir,
            "imports",
            "note.md",
            "---\ntitle: \"Frontmatter Title\"\n---\n\n# Heading Title\n",
        );

        assert_eq!(dest, "imports/Frontmatter Title.md");
        let _ = std::fs::remove_dir_all(sync_dir);
    }

    #[test]
    fn markdown_destination_uses_first_heading_when_title_missing() {
        let sync_dir = temp_sync_dir();

        let dest = markdown_destination(
            &sync_dir,
            "imports",
            "note.md",
            "intro\n\n# Heading / With: Symbols?\n\nbody",
        );

        assert_eq!(dest, "imports/Heading With Symbols.md");
        let _ = std::fs::remove_dir_all(sync_dir);
    }
}

/// Process a single dropped file: copy to correct location, optionally wrap in markdown
fn import_single_file(sync_dir: &Path, source_path: &str) -> Result<ImportedFile, String> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(format!("File not found: {}", source_path));
    }

    let filename = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = source
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let file_size = source.metadata().map(|m| m.len()).unwrap_or(0);

    let max_import_file_size = settings::import_file_size_limit_bytes();
    if file_size > max_import_file_size {
        return Err(format!(
            "File too large: {} bytes (max {} bytes)",
            file_size, max_import_file_size,
        ));
    }

    let (base_dir, category) = route_file(&filename, &ext);
    let now = chrono::Local::now();

    // Build destination path — all types use {date}-{filename} under imports/
    let prefix = now.format("%Y%m%d").to_string();
    let dest_rel = match &category {
        FileCategory::Markdown => {
            format!("{}/{}", base_dir, filename)
        }
        _ => {
            format!("{}/{}-{}", base_dir, prefix, filename)
        }
    };

    let dest_full = sync_dir.join(&dest_rel);
    if let Some(parent) = dest_full.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    match &category {
        FileCategory::Markdown => {
            // Read text content and wrap with frontmatter
            let content = read_text_lossy(source)?;
            let md = markdown_import_content(&filename, &content, &now);
            let md_rel = markdown_destination(sync_dir, base_dir, &filename, &content);
            let md_full = sync_dir.join(&md_rel);
            if let Some(parent) = md_full.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            }
            std::fs::write(&md_full, &md).map_err(|e| format!("Failed to write: {}", e))?;
            return Ok(ImportedFile {
                original_name: filename,
                dest_path: md_rel,
                category: format!("{:?}", category),
                size: file_size,
            });
        }
        FileCategory::Code => {
            // Code files → wrap in markdown with code fence
            let content =
                read_text_lossy(source).unwrap_or_else(|_| "[binary or unreadable]".to_string());

            let lang = &ext;
            let title = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let md_filename = format!("{}.md", dest_rel.trim_end_matches(&format!(".{}", ext)));
            let md_full = sync_dir.join(&md_filename);

            if let Some(parent) = md_full.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            }

            let md = format!(
                "---\ntitle: {}\ndate: {}\nsource: import\nlanguage: {}\noriginal: {}\n---\n\n# {}\n\n```{}\n{}\n```\n",
                title,
                local_timestamp(&now),
                lang,
                filename,
                title,
                lang,
                content
            );
            std::fs::write(&md_full, &md).map_err(|e| format!("Failed to write: {}", e))?;

            return Ok(ImportedFile {
                original_name: filename,
                dest_path: md_filename,
                category: format!("{:?}", category),
                size: file_size,
            });
        }
        _ => {
            // Binary files (images, PDFs, etc.) → copy directly
            std::fs::copy(source, &dest_full).map_err(|e| format!("Failed to copy file: {}", e))?;

            // Create a companion .md so list_files can discover this import
            let md_path = format!("{}.md", dest_rel);
            let md_full = sync_dir.join(&md_path);
            let type_label = match &category {
                FileCategory::Image => "image",
                FileCategory::Document => "document",
                _ => "file",
            };
            let actual_name = dest_full
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let md = if matches!(&category, FileCategory::Image) {
                format!(
                    "---\ndate: {}\nsource: import\ntype: {}\noriginal: {}\n---\n\n![{}]({})\n",
                    local_timestamp(&now),
                    type_label,
                    filename,
                    filename,
                    actual_name
                )
            } else {
                format!(
                    "---\ntitle: {}\ndate: {}\nsource: import\ntype: {}\noriginal: {}\n---\n\n[{}]({})\n",
                    filename, local_timestamp(&now), type_label, filename, filename, actual_name
                )
            };
            let _ = std::fs::write(&md_full, &md);
        }
    }

    Ok(ImportedFile {
        original_name: filename,
        dest_path: dest_rel,
        category: format!("{:?}", category),
        size: file_size,
    })
}

pub fn import_paths(paths: Vec<String>) -> Result<ImportResult, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);

        if path.is_dir() {
            // Recursively import user-authored files. Skip generated/dependency trees so
            // dropping a project folder does not import build artifacts into GitMemo.
            for entry in walkdir::WalkDir::new(path)
                .into_iter()
                .filter_entry(|e| {
                    if e.depth() == 0 {
                        return true;
                    }
                    !e.file_type().is_dir() || !should_skip_directory_entry(e.path())
                })
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .filter(|e| is_supported_directory_import_file(e.path()))
                // Skip hidden files in non-skipped directory trees too.
                .filter(|e| {
                    !e.path()
                        .components()
                        .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
                })
            {
                match import_single_file(&sync_dir, &entry.path().to_string_lossy()) {
                    Ok(f) => imported.push(f),
                    Err(e) => errors.push(e),
                }
            }
        } else {
            match import_single_file(&sync_dir, path_str) {
                Ok(f) => imported.push(f),
                Err(e) => errors.push(e),
            }
        }
    }

    commit_imports_in_background(&sync_dir, &imported);

    Ok(ImportResult {
        success: errors.is_empty(),
        imported,
        errors,
    })
}

fn import_markdown_document(
    sync_dir: &Path,
    document: MarkdownImportDocument,
) -> Result<ImportedFile, String> {
    let filename = safe_file_name(&document.file_name);
    let ext = file_extension_from_name(&filename);
    if !is_markdown_import_extension(&ext) {
        return Err(format!("Unsupported Markdown file type: {}", filename));
    }

    let effective_size = document.size.max(document.content.as_bytes().len() as u64);
    let max_import_file_size = settings::import_file_size_limit_bytes();
    if effective_size > max_import_file_size {
        return Err(format!(
            "File too large: {} bytes (max {} bytes)",
            effective_size, max_import_file_size,
        ));
    }

    let (base_dir, category) = route_file(&filename, &ext);
    let now = chrono::Local::now();
    let dest_rel = markdown_destination(sync_dir, base_dir, &filename, &document.content);
    let dest_full = sync_dir.join(&dest_rel);

    if let Some(parent) = dest_full.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let md = markdown_import_content(&filename, &document.content, &now);
    std::fs::write(&dest_full, &md).map_err(|e| format!("Failed to write: {}", e))?;

    Ok(ImportedFile {
        original_name: filename,
        dest_path: dest_rel,
        category: format!("{:?}", category),
        size: effective_size,
    })
}

pub fn import_markdown_documents_sync(
    documents: Vec<MarkdownImportDocument>,
) -> Result<ImportResult, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo not initialized".into());
    }

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    for document in documents {
        match import_markdown_document(&sync_dir, document) {
            Ok(file) => imported.push(file),
            Err(e) => errors.push(e),
        }
    }

    commit_imports_in_background(&sync_dir, &imported);

    Ok(ImportResult {
        success: errors.is_empty(),
        imported,
        errors,
    })
}

fn commit_imports_in_background(sync_dir: &Path, imported: &[ImportedFile]) {
    if imported.is_empty() {
        return;
    }

    let msg = if imported.len() == 1 {
        format!("import: {}", imported[0].original_name)
    } else {
        format!("import: {} files", imported.len())
    };
    let dir = sync_dir.to_path_buf();
    std::thread::spawn(move || {
        let _ = git::commit_and_push(&dir, &msg);
    });
}

fn file_name_for_rejection(path: &Path, fallback: &str) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(fallback)
        .to_string()
}

fn check_import_files_sync(paths: Vec<String>) -> ImportFileCheckResult {
    let max_size = settings::import_file_size_limit_bytes();
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();

    for path_str in paths {
        let path = Path::new(&path_str);
        let file_name = file_name_for_rejection(path, &path_str);

        if !path.exists() {
            rejected.push(ImportFileRejection {
                path: path_str,
                file_name,
                size: None,
                reason: "missing".into(),
            });
            continue;
        }

        if !path.is_file() {
            rejected.push(ImportFileRejection {
                path: path_str,
                file_name,
                size: None,
                reason: "not_file".into(),
            });
            continue;
        }

        if !is_markdown_import_file(path) {
            let size = path.metadata().ok().map(|meta| meta.len());
            rejected.push(ImportFileRejection {
                path: path_str,
                file_name,
                size,
                reason: "unsupported_type".into(),
            });
            continue;
        }

        match path.metadata() {
            Ok(meta) if meta.len() > max_size => rejected.push(ImportFileRejection {
                path: path_str,
                file_name,
                size: Some(meta.len()),
                reason: "too_large".into(),
            }),
            Ok(_) => accepted.push(path_str),
            Err(e) => rejected.push(ImportFileRejection {
                path: path_str,
                file_name,
                size: None,
                reason: format!("metadata_error: {e}"),
            }),
        }
    }

    ImportFileCheckResult {
        accepted,
        rejected,
        max_size,
    }
}

#[tauri::command]
pub async fn check_import_files(paths: Vec<String>) -> Result<ImportFileCheckResult, String> {
    tokio::task::spawn_blocking(move || check_import_files_sync(paths))
        .await
        .map_err(|e| format!("Task join error: {e}"))
}

#[tauri::command]
pub async fn import_files(paths: Vec<String>) -> Result<ImportResult, String> {
    tokio::task::spawn_blocking(move || import_paths(paths))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn import_markdown_documents(
    documents: Vec<MarkdownImportDocument>,
) -> Result<ImportResult, String> {
    tokio::task::spawn_blocking(move || import_markdown_documents_sync(documents))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
