use gitmemo_core::storage::{files, git};
use serde::Serialize;
use std::path::Path;

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

/// Route a file to the correct gitmemo directory based on its type
fn route_file(_filename: &str, ext: &str) -> (&'static str, FileCategory) {
    match ext.to_lowercase().as_str() {
        // Markdown → notes/imports/
        "md" | "markdown" | "mdx" => ("notes/imports", FileCategory::Markdown),
        // Images → clips/{date}/
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico" | "avif" => {
            ("clips", FileCategory::Image)
        }
        // Documents → imports/docs/
        "pdf" | "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx" | "csv" | "tsv" | "rtf"
        | "odt" | "ods" | "odp" => ("imports/docs", FileCategory::Document),
        // Code → imports/code/
        "rs" | "py" | "js" | "ts" | "tsx" | "jsx" | "go" | "java" | "kt" | "swift" | "c"
        | "cpp" | "h" | "hpp" | "rb" | "php" | "sh" | "bash" | "zsh" | "fish" | "sql"
        | "yaml" | "yml" | "toml" | "json" | "xml" | "html" | "css" | "scss" | "sass"
        | "less" | "vue" | "svelte" => ("imports/code", FileCategory::Code),
        // Text files → notes/imports/
        "txt" | "log" | "text" | "conf" | "cfg" | "ini" | "env" => {
            ("notes/imports", FileCategory::Markdown)
        }
        // Everything else → imports/other/
        _ => ("imports/other", FileCategory::Other),
    }
}

/// Process a single dropped file: copy to correct location, optionally wrap in markdown
fn import_single_file(
    sync_dir: &Path,
    source_path: &str,
) -> Result<ImportedFile, String> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(format!("文件不存在: {}", source_path));
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

    let file_size = source
        .metadata()
        .map(|m| m.len())
        .unwrap_or(0);

    let (base_dir, category) = route_file(&filename, &ext);
    let now = chrono::Local::now();

    // Build destination path
    let dest_rel = match &category {
        FileCategory::Image => {
            // Images go to clips/{date}/{filename}
            let date_dir = now.format("%Y-%m-%d").to_string();
            format!("{}/{}/{}", base_dir, date_dir, filename)
        }
        FileCategory::Markdown => {
            // Markdown/text files → wrap content or copy directly
            format!("{}/{}", base_dir, filename)
        }
        _ => {
            // Other files: {base_dir}/{date}-{filename}
            let prefix = now.format("%Y%m%d").to_string();
            format!("{}/{}-{}", base_dir, prefix, filename)
        }
    };

    let dest_full = sync_dir.join(&dest_rel);
    if let Some(parent) = dest_full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    match &category {
        FileCategory::Markdown => {
            // Read text content and wrap with frontmatter
            let content = std::fs::read_to_string(source)
                .map_err(|e| format!("读取文件失败: {}", e))?;

            let title = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // If already has frontmatter, keep as-is
            if content.starts_with("---") {
                std::fs::write(&dest_full, &content)
                    .map_err(|e| format!("写入失败: {}", e))?;
            } else {
                let md = format!(
                    "---\ntitle: {}\ndate: {}\nsource: import\noriginal: {}\n---\n\n{}\n",
                    title,
                    now.format("%Y-%m-%d %H:%M:%S"),
                    filename,
                    content
                );
                // Ensure .md extension
                if !dest_rel.ends_with(".md") {
                    let new_rel = format!("{}.md", dest_rel.trim_end_matches(&format!(".{}", ext)));
                    let new_full = sync_dir.join(&new_rel);
                    std::fs::write(&new_full, &md)
                        .map_err(|e| format!("写入失败: {}", e))?;
                    return Ok(ImportedFile {
                        original_name: filename,
                        dest_path: new_rel,
                        category: format!("{:?}", category),
                        size: file_size,
                    });
                } else {
                    std::fs::write(&dest_full, &md)
                        .map_err(|e| format!("写入失败: {}", e))?;
                    dest_rel.clone()
                };
            }
        }
        FileCategory::Code => {
            // Code files → wrap in markdown with code fence
            let content = std::fs::read_to_string(source)
                .unwrap_or_else(|_| "[binary or unreadable]".to_string());

            let lang = &ext;
            let title = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let md_filename = format!("{}.md", dest_rel.trim_end_matches(&format!(".{}", ext)));
            let md_full = sync_dir.join(&md_filename);

            if let Some(parent) = md_full.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }

            let md = format!(
                "---\ntitle: {}\ndate: {}\nsource: import\nlanguage: {}\noriginal: {}\n---\n\n# {}\n\n```{}\n{}\n```\n",
                title,
                now.format("%Y-%m-%d %H:%M:%S"),
                lang,
                filename,
                title,
                lang,
                content
            );
            std::fs::write(&md_full, &md)
                .map_err(|e| format!("写入失败: {}", e))?;

            return Ok(ImportedFile {
                original_name: filename,
                dest_path: md_filename,
                category: format!("{:?}", category),
                size: file_size,
            });
        }
        _ => {
            // Binary files (images, PDFs, etc.) → copy directly
            std::fs::copy(source, &dest_full)
                .map_err(|e| format!("复制文件失败: {}", e))?;

            // For images, also create a markdown reference
            if matches!(&category, FileCategory::Image) {
                let md_path = format!("{}.md", dest_rel);
                let md_full = sync_dir.join(&md_path);
                let md = format!(
                    "---\ndate: {}\nsource: import\ntype: image\n---\n\n![{}]({})\n",
                    now.format("%Y-%m-%d %H:%M:%S"),
                    filename,
                    filename
                );
                let _ = std::fs::write(&md_full, &md);
            }
        }
    }

    Ok(ImportedFile {
        original_name: filename,
        dest_path: dest_rel,
        category: format!("{:?}", category),
        size: file_size,
    })
}

#[tauri::command]
pub fn import_files(paths: Vec<String>) -> Result<ImportResult, String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        return Err("GitMemo 未初始化".into());
    }

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);

        if path.is_dir() {
            // Recursively import directory
            for entry in walkdir::WalkDir::new(path)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                // Skip hidden files
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

    // Git sync
    if !imported.is_empty() {
        let msg = if imported.len() == 1 {
            format!("import: {}", imported[0].original_name)
        } else {
            format!("import: {} files", imported.len())
        };
        let dir = sync_dir.clone();
        std::thread::spawn(move || {
            let _ = git::commit_and_push(&dir, &msg);
        });
    }

    Ok(ImportResult {
        success: errors.is_empty(),
        imported,
        errors,
    })
}
