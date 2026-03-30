use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;

const SOURCE_TAG: &str = "gitmemo";

/// Generate the PostToolUse hook entry
fn generate_hook(sync_dir: &str) -> Value {
    // Read branch from config.toml, default to main
    let branch_detect = format!(
        r#"BRANCH=$(python3 -c "
import sys
try:
    import tomllib as t
except ImportError:
    try:
        import tomli as t
    except ImportError:
        import toml as t
with open('{sync_dir}/.metadata/config.toml','rb') as f:
    print(t.load(f).get('git',{{}}).get('branch','main'))
" 2>/dev/null || echo main); "#,
        sync_dir = sync_dir
    );

    serde_json::json!({
        "_source": SOURCE_TAG,
        "matcher": "Write|Edit",
        "hooks": [{
            "type": "command",
            "async": true,
            "command": format!(
                r#"FILE=$(cat /dev/stdin | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{{}}).get('file_path',''))" 2>/dev/null); SYNC_DIR="{sync_dir}"; if echo "$FILE" | grep -q "^$SYNC_DIR/"; then cd "$SYNC_DIR" && {branch_detect}git add -A && git diff --cached --quiet || git commit -m "auto: save $(basename "$FILE")" && git push origin "$BRANCH" 2>/dev/null; fi"#,
                sync_dir = sync_dir,
                branch_detect = branch_detect,
            )
        }]
    })
}

/// Inject PostToolUse hook into settings.json
pub fn inject(settings_path: &Path, sync_dir: &str) -> Result<()> {
    let mut settings: Value = if settings_path.exists() {
        let content = std::fs::read_to_string(settings_path)
            .context("Failed to read settings.json")?;
        serde_json::from_str(&content).context("Failed to parse settings.json")?
    } else {
        serde_json::json!({})
    };

    // Ensure hooks.PostToolUse array exists
    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));
    let post_tool_use = hooks
        .as_object_mut()
        .unwrap()
        .entry("PostToolUse")
        .or_insert_with(|| serde_json::json!([]));

    let arr = post_tool_use.as_array_mut().unwrap();

    // Remove existing gitmemo hook if present
    arr.retain(|entry| {
        entry
            .get("_source")
            .and_then(|s| s.as_str())
            .map(|s| s != SOURCE_TAG)
            .unwrap_or(true)
    });

    // Add new hook
    arr.push(generate_hook(sync_dir));

    // Write back
    let output = serde_json::to_string_pretty(&settings)?;
    std::fs::write(settings_path, output)?;
    Ok(())
}

/// Remove injected hook from settings.json
pub fn remove(settings_path: &Path) -> Result<()> {
    if !settings_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(settings_path)?;
    let mut settings: Value = serde_json::from_str(&content)?;

    if let Some(arr) = settings
        .pointer_mut("/hooks/PostToolUse")
        .and_then(|v| v.as_array_mut())
    {
        arr.retain(|entry| {
            entry
                .get("_source")
                .and_then(|s| s.as_str())
                .map(|s| s != SOURCE_TAG)
                .unwrap_or(true)
        });
    }

    let output = serde_json::to_string_pretty(&settings)?;
    std::fs::write(settings_path, output)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_inject_into_empty() {
        let file = NamedTempFile::new().unwrap();
        std::fs::write(file.path(), "{}").unwrap();

        inject(file.path(), "/home/user/.gitmemo").unwrap();

        let content: Value =
            serde_json::from_str(&std::fs::read_to_string(file.path()).unwrap()).unwrap();
        let hooks = content["hooks"]["PostToolUse"].as_array().unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0]["_source"], "gitmemo");
    }

    #[test]
    fn test_inject_preserves_existing_hooks() {
        let file = NamedTempFile::new().unwrap();
        let existing = serde_json::json!({
            "hooks": {
                "PostToolUse": [{
                    "matcher": "Write|Edit",
                    "hooks": [{"type": "command", "command": "echo existing"}]
                }]
            }
        });
        std::fs::write(file.path(), serde_json::to_string(&existing).unwrap()).unwrap();

        inject(file.path(), "/home/user/.gitmemo").unwrap();

        let content: Value =
            serde_json::from_str(&std::fs::read_to_string(file.path()).unwrap()).unwrap();
        let hooks = content["hooks"]["PostToolUse"].as_array().unwrap();
        assert_eq!(hooks.len(), 2); // existing + ours
    }
}
