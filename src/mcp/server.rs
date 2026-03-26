use anyhow::Result;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

use crate::storage::{database, files};

/// Run the MCP server (stdio JSON-RPC)
pub fn run() -> Result<()> {
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
    let method = request
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("");

    match method {
        "initialize" => json_rpc_result(id, json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "gitmemo",
                "version": env!("CARGO_PKG_VERSION")
            }
        })),

        "tools/list" => json_rpc_result(id, json!({
            "tools": get_tool_definitions()
        })),

        "tools/call" => {
            let params = request.get("params").cloned().unwrap_or(json!({}));
            let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));

            match call_tool(tool_name, &args) {
                Ok(result) => json_rpc_result(id, json!({
                    "content": [{
                        "type": "text",
                        "text": result
                    }]
                })),
                Err(e) => json_rpc_result(id, json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Error: {}", e)
                    }],
                    "isError": true
                })),
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
    vec![
        json!({
            "name": "cds_search",
            "description": "搜索用户的历史 AI 对话和笔记。当用户说'搜索我的对话'、'找一下之前关于 X 的讨论'时使用。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "搜索关键词" },
                    "type": { "type": "string", "enum": ["all", "conversation", "note"], "description": "搜索范围，默认 all" },
                    "limit": { "type": "number", "description": "返回结果数量，默认 10" }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "cds_recent",
            "description": "列出最近的 AI 对话记录。当用户说'最近的对话'、'看看历史'时使用。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": { "type": "number", "description": "返回数量，默认 10" },
                    "days": { "type": "number", "description": "最近几天，默认 7" }
                }
            }
        }),
        json!({
            "name": "cds_read",
            "description": "读取某条对话或笔记的完整内容。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "文件相对路径" }
                },
                "required": ["file_path"]
            }
        }),
        json!({
            "name": "cds_note",
            "description": "创建一条便签笔记。当用户说'记一下'、'保存这个想法'时使用。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "笔记内容" }
                },
                "required": ["content"]
            }
        }),
        json!({
            "name": "cds_daily",
            "description": "追加内容到今天的日记。当用户说'记到今天的日记里'时使用。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "要追加的内容" }
                },
                "required": ["content"]
            }
        }),
        json!({
            "name": "cds_manual",
            "description": "创建或追加到手册文档。当用户说'创建一篇手册'、'整理成文档'时使用。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "手册标题" },
                    "content": { "type": "string", "description": "手册内容" },
                    "append": { "type": "boolean", "description": "是否追加到已有手册" }
                },
                "required": ["title", "content"]
            }
        }),
        json!({
            "name": "cds_stats",
            "description": "获取对话和笔记的统计信息。",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "cds_sync",
            "description": "将 GitMemo 数据目录的变更同步到 Git（git add + commit + push）。在 Cursor 等没有自动 Hook 的编辑器中，保存对话文件后必须调用此工具完成同步。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "message": { "type": "string", "description": "commit message（可选，默认自动生成）" }
                }
            }
        }),
    ]
}

fn call_tool(name: &str, args: &Value) -> Result<String> {
    let sync_dir = files::sync_dir();
    if !sync_dir.exists() {
        anyhow::bail!("GitMemo 未初始化。请先运行 gitmemo init");
    }

    let db_path = sync_dir.join(".metadata").join("index.db");
    let conn = database::open_or_create(&db_path)?;
    database::build_index(&conn, &sync_dir)?;

    match name {
        "cds_search" => {
            let query = args["query"].as_str().unwrap_or("");
            let type_filter = args["type"].as_str().unwrap_or("all");
            let limit = args["limit"].as_u64().unwrap_or(10) as usize;

            let results = database::search(&conn, query, type_filter, limit)?;
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

            let results = database::recent(&conn, limit, days)?;
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
            let rel_path = files::create_scratch(&sync_dir, content)?;
            crate::storage::git::commit_and_push(
                &sync_dir,
                &format!("note: {}", &content[..content.len().min(50)]),
            )?;
            Ok(format!("便签已创建: {}", rel_path))
        }

        "cds_daily" => {
            let content = args["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("content required"))?;
            let rel_path = files::append_daily(&sync_dir, content)?;
            crate::storage::git::commit_and_push(
                &sync_dir,
                &format!("daily: {}", &content[..content.len().min(50)]),
            )?;
            Ok(format!("已追加到今日笔记: {}", rel_path))
        }

        "cds_manual" => {
            let title = args["title"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("title required"))?;
            let content = args["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("content required"))?;
            let append = args["append"].as_bool().unwrap_or(false);
            let rel_path = files::write_manual(&sync_dir, title, content, append)?;
            let action = if append { "update" } else { "create" };
            crate::storage::git::commit_and_push(
                &sync_dir,
                &format!("manual: {} {}", action, title),
            )?;
            Ok(format!("手册已保存: {}", rel_path))
        }

        "cds_stats" => {
            let stats = database::get_stats(&conn)?;
            Ok(serde_json::to_string_pretty(&json!({
                "conversations": stats.conversation_count,
                "notes": {
                    "daily": stats.note_daily_count,
                    "manual": stats.note_manual_count,
                    "scratch": stats.note_scratch_count
                }
            }))?)
        }

        "cds_sync" => {
            let message = args["message"]
                .as_str()
                .unwrap_or("auto: sync conversations");
            crate::storage::git::commit_and_push(&sync_dir, message)?;
            Ok("Git 同步完成".to_string())
        }

        _ => anyhow::bail!("Unknown tool: {}", name),
    }
}
