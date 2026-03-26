use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;

const MCP_KEY: &str = "gitmemo";

/// Register MCP server in ~/.cursor/mcp.json
pub fn register(cursor_mcp_path: &Path, binary_path: &str) -> Result<()> {
    let mut config: Value = if cursor_mcp_path.exists() {
        let content = std::fs::read_to_string(cursor_mcp_path)
            .context("Failed to read cursor mcp.json")?;
        serde_json::from_str(&content).context("Failed to parse cursor mcp.json")?
    } else {
        serde_json::json!({})
    };

    let servers = config
        .as_object_mut()
        .unwrap()
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    servers.as_object_mut().unwrap().insert(
        MCP_KEY.to_string(),
        serde_json::json!({
            "command": binary_path,
            "args": ["mcp-serve"]
        }),
    );

    if let Some(parent) = cursor_mcp_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let output = serde_json::to_string_pretty(&config)?;
    std::fs::write(cursor_mcp_path, output)?;
    Ok(())
}

/// Remove MCP server registration from Cursor config
pub fn unregister(cursor_mcp_path: &Path) -> Result<()> {
    if !cursor_mcp_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(cursor_mcp_path)?;
    let mut config: Value = serde_json::from_str(&content)?;

    if let Some(servers) = config
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
    {
        servers.remove(MCP_KEY);
    }

    let output = serde_json::to_string_pretty(&config)?;
    std::fs::write(cursor_mcp_path, output)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_register_into_empty() {
        let file = NamedTempFile::new().unwrap();
        std::fs::write(file.path(), "{}").unwrap();

        register(file.path(), "/usr/local/bin/gitmemo").unwrap();

        let content: Value =
            serde_json::from_str(&std::fs::read_to_string(file.path()).unwrap()).unwrap();
        let servers = content["mcpServers"].as_object().unwrap();
        assert!(servers.contains_key("gitmemo"));
        assert_eq!(servers["gitmemo"]["command"], "/usr/local/bin/gitmemo");
    }

    #[test]
    fn test_unregister() {
        let file = NamedTempFile::new().unwrap();
        let existing = serde_json::json!({
            "mcpServers": {
                "gitmemo": { "command": "/bin/gitmemo", "args": ["mcp-serve"] },
                "other": { "command": "/bin/other" }
            }
        });
        std::fs::write(file.path(), serde_json::to_string(&existing).unwrap()).unwrap();

        unregister(file.path()).unwrap();

        let content: Value =
            serde_json::from_str(&std::fs::read_to_string(file.path()).unwrap()).unwrap();
        let servers = content["mcpServers"].as_object().unwrap();
        assert!(!servers.contains_key("gitmemo"));
        assert!(servers.contains_key("other"));
    }
}
