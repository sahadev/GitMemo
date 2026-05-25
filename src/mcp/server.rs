use anyhow::Result;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

use crate::services::sync::StartupMode;
use crate::storage::files;
use crate::utils::i18n;

/// Run the MCP server (stdio JSON-RPC)
pub fn run() -> Result<()> {
    // Initialize i18n from config for MCP server
    i18n::init_from_config();

    // Pull latest from remote on startup
    let sync_dir = files::sync_dir();
    if sync_dir.exists() {
        let _ = crate::services::startup::run_startup(&sync_dir, StartupMode::Mcp);
    }

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let response = handle_request(&request);

        let output = serde_json::to_string(&response)?;
        writeln!(stdout, "{}", output)?;
        stdout.flush()?;
    }

    Ok(())
}

fn handle_request(request: &Value) -> Value {
    let id = request.get("id").cloned().unwrap_or(json!(null));
    let method = request.get("method").and_then(|m| m.as_str()).unwrap_or("");

    match method {
        "initialize" => json_rpc_result(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "gitmemo",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        ),

        "tools/list" => json_rpc_result(
            id,
            json!({
                "tools": get_tool_definitions()
            }),
        ),

        "tools/call" => {
            let params = request.get("params").cloned().unwrap_or(json!({}));
            let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));

            match call_tool(tool_name, &args) {
                Ok(result) => json_rpc_result(
                    id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": result
                        }]
                    }),
                ),
                Err(e) => json_rpc_result(
                    id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": format!("Error: {}", e)
                        }],
                        "isError": true
                    }),
                ),
            }
        }

        "notifications/initialized" => {
            // No response needed for notifications
            json!(null)
        }

        _ => json_rpc_error(id, -32601, &format!("Method not found: {}", method)),
    }
}

fn json_rpc_result(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn json_rpc_error(id: Value, code: i32, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}

fn get_tool_definitions() -> Vec<Value> {
    let t = i18n::get();
    vec![
        json!({
            "name": "cds_search",
            "description": t.mcp_search_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": t.mcp_search_query_desc() },
                    "type": { "type": "string", "enum": ["all", "conversation", "note"], "description": t.mcp_search_type_desc() },
                    "limit": { "type": "number", "description": t.mcp_search_limit_desc() }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "cds_recent",
            "description": t.mcp_recent_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": { "type": "number", "description": t.mcp_recent_limit_desc() },
                    "days": { "type": "number", "description": t.mcp_recent_days_desc() }
                }
            }
        }),
        json!({
            "name": "cds_read",
            "description": t.mcp_read_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": t.mcp_read_path_desc() }
                },
                "required": ["file_path"]
            }
        }),
        json!({
            "name": "cds_note",
            "description": t.mcp_note_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": t.mcp_note_content_desc() }
                },
                "required": ["content"]
            }
        }),
        json!({
            "name": "cds_manual",
            "description": t.mcp_manual_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": t.mcp_manual_title_desc() },
                    "content": { "type": "string", "description": t.mcp_manual_content_desc() },
                    "append": { "type": "boolean", "description": t.mcp_manual_append_desc() }
                },
                "required": ["title", "content"]
            }
        }),
        json!({
            "name": "cds_stats",
            "description": t.mcp_stats_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "cds_sync",
            "description": t.mcp_sync_desc(),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "message": { "type": "string", "description": t.mcp_sync_message_desc() }
                }
            }
        }),
    ]
}

fn call_tool(name: &str, args: &Value) -> Result<String> {
    let t = i18n::get();
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        anyhow::bail!(t.not_init_error_mcp());
    }

    match name {
        "cds_search" => {
            let query = args["query"].as_str().unwrap_or("");
            let type_filter = args["type"].as_str().unwrap_or("all");
            if !["all", "conversation", "note"].contains(&type_filter) {
                anyhow::bail!("Invalid type filter: {}", type_filter);
            }
            let limit = args["limit"].as_u64().unwrap_or(10) as usize;

            let results = crate::services::search::search(&sync_dir, query, type_filter, limit)?;
            let output: Vec<Value> = results
                .iter()
                .map(|r| {
                    json!({
                        "type": r.source_type,
                        "title": r.title,
                        "date": r.date,
                        "file_path": r.file_path,
                        "snippet": r.snippet
                    })
                })
                .collect();

            Ok(serde_json::to_string_pretty(&json!({
                "total": output.len(),
                "results": output
            }))?)
        }

        "cds_recent" => {
            let limit = args["limit"].as_u64().unwrap_or(10) as usize;
            let days = args["days"].as_u64().unwrap_or(7) as u32;

            let results = crate::services::search::recent(&sync_dir, limit, days)?;
            let output: Vec<Value> = results
                .iter()
                .map(|r| {
                    json!({
                        "title": r.title,
                        "date": r.date,
                        "file_path": r.file_path
                    })
                })
                .collect();

            Ok(serde_json::to_string_pretty(&json!({
                "total": output.len(),
                "results": output
            }))?)
        }

        "cds_read" => {
            let file_path = args["file_path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("file_path required"))?;
            let full_path = sync_dir.join(file_path);
            let content = std::fs::read_to_string(&full_path)?;
            Ok(content)
        }

        "cds_note" => {
            let content = args["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("content required"))?;
            let result = crate::services::notes::create_scratch(&sync_dir, content)?;
            Ok(t.mcp_note_created(&result.rel_path))
        }

        "cds_manual" => {
            let title = args["title"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("title required"))?;
            let content = args["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("content required"))?;
            let append = args["append"].as_bool().unwrap_or(false);
            let result = crate::services::notes::write_manual(&sync_dir, title, content, append)?;
            Ok(t.mcp_manual_saved(&result.rel_path))
        }

        "cds_stats" => {
            let stats = crate::services::search::stats(&sync_dir)?;
            Ok(serde_json::to_string_pretty(&json!({
                "conversations": stats.conversation_count,
                "notes": {
                    "manual": stats.note_manual_count,
                    "scratch": stats.note_scratch_count
                }
            }))?)
        }

        "cds_sync" => {
            let message = args["message"]
                .as_str()
                .unwrap_or("auto: sync conversations");
            let result = crate::services::sync::commit_and_push(&sync_dir, message)?;
            if result.committed && result.pushed {
                Ok(t.mcp_sync_done().to_string())
            } else if result.committed {
                Ok(t.mcp_committed_push_failed(&result.push_error.unwrap_or_default()))
            } else {
                // No new commit, try push unpushed
                let unpushed = crate::storage::git::unpushed_count(&sync_dir)?;
                if unpushed > 0 {
                    let push_result = crate::storage::git::push(&sync_dir)?;
                    if push_result.pushed {
                        Ok(t.mcp_pushed_commits(unpushed))
                    } else {
                        Ok(t.mcp_push_failed(&push_result.push_error.unwrap_or_default()))
                    }
                } else {
                    Ok(t.mcp_all_synced().to_string())
                }
            }
        }

        _ => anyhow::bail!("Unknown tool: {}", name),
    }
}
