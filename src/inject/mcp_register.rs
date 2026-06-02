use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;

const MCP_KEY: &str = "gitmemo";

/// Register MCP server in ~/.claude.json
pub fn register(claude_json_path: &Path, binary_path: &str) -> Result<()> {
    let mut config: Value = if claude_json_path.exists() {
        let content =
            std::fs::read_to_string(claude_json_path).context("Failed to read .claude.json")?;
        serde_json::from_str(&content).context("Failed to parse .claude.json")?
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
            "args": ["mcp-serve"],
            "type": "stdio"
        }),
    );

    let output = serde_json::to_string_pretty(&config)?;
    std::fs::write(claude_json_path, output)?;
    Ok(())
}

/// Remove MCP server registration
pub fn unregister(claude_json_path: &Path) -> Result<()> {
    if !claude_json_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(claude_json_path)?;
    let mut config: Value = serde_json::from_str(&content)?;

    if let Some(servers) = config.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
        servers.remove(MCP_KEY);
    }

    let output = serde_json::to_string_pretty(&config)?;
    std::fs::write(claude_json_path, output)?;
    Ok(())
}
