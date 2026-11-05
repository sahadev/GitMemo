//! Register the GitMemo MCP server in OpenCode's global config.
//!
//! OpenCode keeps everything in a single `opencode.json` whose schema differs from
//! Claude/Cursor: local servers are declared under `mcp.servers.<name>` with
//! `{"type": "local", "command": [binary, ...args]}` (a command array, no `args`
//! field). The same file usually holds user providers and API keys, so writes must
//! merge — never replace — the existing document.
//!
//! Older OpenCode releases accepted a flat `mcp.<name>` entry; that shape is
//! deprecated and migrated here when found.

use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const SERVER_KEY: &str = "gitmemo";
const SCHEMA_URL: &str = "https://opencode.ai/config.json";

/// `~/.config/opencode/opencode.json` (or `$XDG_CONFIG_HOME/opencode/opencode.json`).
pub fn config_path() -> PathBuf {
    crate::inject::opencode_config_dir().join("opencode.json")
}

fn load(config_path: &Path) -> Result<(Value, bool)> {
    if !config_path.exists() {
        return Ok((json!({}), true));
    }
    let content = std::fs::read_to_string(config_path)
        .with_context(|| format!("Failed to read {}", config_path.display()))?;
    if content.trim().is_empty() {
        return Ok((json!({}), true));
    }
    let config: Value = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse {} as JSON", config_path.display()))?;
    if !config.is_object() {
        anyhow::bail!("{} must contain a JSON object", config_path.display());
    }
    Ok((config, false))
}

fn save(config_path: &Path, config: &Value) -> Result<()> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut output = serde_json::to_string_pretty(config)?;
    output.push('\n');
    std::fs::write(config_path, output)?;
    Ok(())
}

fn servers_mut(config: &mut Value) -> Result<&mut serde_json::Map<String, Value>> {
    let object = config
        .as_object_mut()
        .context("OpenCode config must be a JSON object")?;

    let mcp = object.entry("mcp").or_insert_with(|| json!({}));
    let mcp = mcp
        .as_object_mut()
        .context("`mcp` in OpenCode config must be an object")?;

    // Drop the deprecated flat entry before writing the new shape.
    mcp.remove(SERVER_KEY);

    let servers = mcp.entry("servers").or_insert_with(|| json!({}));
    servers
        .as_object_mut()
        .context("`mcp.servers` in OpenCode config must be an object")
}

/// Register (or refresh) the GitMemo MCP server. Existing config keys are preserved.
pub fn register(config_path: &Path, binary_path: &str) -> Result<()> {
    let (mut config, created) = load(config_path)?;

    if created {
        config.as_object_mut().unwrap().insert(
            "$schema".to_string(),
            Value::String(SCHEMA_URL.to_string()),
        );
    }

    servers_mut(&mut config)?.insert(
        SERVER_KEY.to_string(),
        json!({
            "type": "local",
            "command": [binary_path, "mcp-serve"]
        }),
    );

    save(config_path, &config)
}

/// Remove the GitMemo MCP server, leaving every other server and setting intact.
pub fn unregister(config_path: &Path) -> Result<()> {
    if !config_path.exists() {
        return Ok(());
    }
    let (mut config, _) = load(config_path)?;

    let Some(object) = config.as_object_mut() else {
        return Ok(());
    };
    let Some(mcp) = object.get_mut("mcp").and_then(|v| v.as_object_mut()) else {
        return Ok(());
    };

    mcp.remove(SERVER_KEY);

    let servers_empty = match mcp.get_mut("servers").and_then(|v| v.as_object_mut()) {
        Some(servers) => {
            servers.remove(SERVER_KEY);
            servers.is_empty()
        }
        None => false,
    };
    if servers_empty {
        mcp.remove("servers");
    }
    if mcp.is_empty() {
        object.remove("mcp");
    }

    save(config_path, &config)
}

/// Whether GitMemo's MCP server entry exists in the config.
pub fn is_registered(config_path: &Path) -> bool {
    let Ok((config, _)) = load(config_path) else {
        return false;
    };
    config
        .pointer(&format!("/mcp/servers/{SERVER_KEY}"))
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gitmemo-opencode-mcp-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn register_creates_config_with_schema() {
        let path = temp_path("opencode-new.json");
        std::fs::remove_file(&path).ok();

        register(&path, "/usr/local/bin/gitmemo").unwrap();

        let config: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(config["$schema"], SCHEMA_URL);
        assert_eq!(config["mcp"]["servers"]["gitmemo"]["type"], "local");
        assert_eq!(
            config["mcp"]["servers"]["gitmemo"]["command"],
            json!(["/usr/local/bin/gitmemo", "mcp-serve"])
        );
        assert!(is_registered(&path));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn register_preserves_existing_user_config() {
        let path = temp_path("opencode-existing.json");
        let original = json!({
            "$schema": SCHEMA_URL,
            "provider": { "custom": { "options": { "apiKey": "secret" } } },
            "mcp": { "servers": { "other": { "type": "remote", "url": "http://x" } } }
        });
        std::fs::write(&path, serde_json::to_string_pretty(&original).unwrap()).unwrap();

        register(&path, "/bin/gitmemo").unwrap();

        let config: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(config["provider"]["custom"]["options"]["apiKey"], "secret");
        assert_eq!(config["mcp"]["servers"]["other"]["url"], "http://x");
        assert!(is_registered(&path));

        // Idempotent: a second run must not duplicate or nest anything.
        register(&path, "/bin/gitmemo").unwrap();
        let config: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(config["mcp"]["servers"].as_object().unwrap().len(), 2);
        assert_eq!(config["mcp"]["servers"]["gitmemo"]["command"][0], "/bin/gitmemo");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn register_migrates_deprecated_flat_entry() {
        let path = temp_path("opencode-flat.json");
        let original = json!({
            "mcp": { "gitmemo": { "type": "local", "command": ["old"] } }
        });
        std::fs::write(&path, serde_json::to_string_pretty(&original).unwrap()).unwrap();

        register(&path, "/bin/gitmemo").unwrap();

        let config: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(config["mcp"].get("gitmemo").is_none());
        assert_eq!(config["mcp"]["servers"]["gitmemo"]["command"][0], "/bin/gitmemo");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn unregister_removes_only_gitmemo_and_cleans_empty_containers() {
        let path = temp_path("opencode-remove.json");
        let original = json!({
            "provider": { "p": {} },
            "mcp": { "servers": { "gitmemo": { "type": "local", "command": ["/bin/gitmemo"] } } }
        });
        std::fs::write(&path, serde_json::to_string_pretty(&original).unwrap()).unwrap();

        unregister(&path).unwrap();

        let config: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(config.get("mcp").is_none());
        assert_eq!(config["provider"]["p"], json!({}));
        assert!(!is_registered(&path));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn unregister_on_missing_or_unrelated_config_is_noop() {
        let path = temp_path("opencode-missing.json");
        std::fs::remove_file(&path).ok();
        unregister(&path).unwrap();
        assert!(!path.exists());

        let path = temp_path("opencode-unrelated.json");
        std::fs::write(&path, "{\n  \"theme\": \"dark\"\n}\n").unwrap();
        unregister(&path).unwrap();
        let config: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(config["theme"], "dark");
        std::fs::remove_file(&path).ok();
    }
}
