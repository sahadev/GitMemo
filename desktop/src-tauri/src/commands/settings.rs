use gitmemo_core::storage::{files, git};
use serde::{Deserialize, Serialize};
use tauri_plugin_autostart::ManagerExt;

const SETTINGS_FILE: &str = "desktop_settings.toml";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopSettings {
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub clipboard_autostart: bool,
}

fn default_true() -> bool { true }

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            clipboard_autostart: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppMeta {
    pub version: String,
    pub release_time: String,
    pub requires_cli: bool,
    pub recommended_cli_version: String,
}

fn settings_path() -> std::path::PathBuf {
    files::sync_dir().join(".metadata").join(SETTINGS_FILE)
}

fn load_settings() -> DesktopSettings {
    let path = settings_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(settings) = toml::from_str::<DesktopSettings>(&content) {
                return settings;
            }
        }
    }
    DesktopSettings::default()
}

fn save_settings(settings: &DesktopSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = toml::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn should_autostart_clipboard() -> bool {
    load_settings().clipboard_autostart
}

#[tauri::command]
pub fn get_app_meta() -> Result<AppMeta, String> {
    Ok(AppMeta {
        version: env!("CARGO_PKG_VERSION").to_string(),
        release_time: option_env!("GITMEMO_RELEASE_TIME").unwrap_or("").to_string(),
        requires_cli: false,
        recommended_cli_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<DesktopSettings, String> {
    let mut settings = load_settings();
    // Check actual autostart state from plugin
    if let Ok(autostart) = app.autolaunch().is_enabled() {
        settings.autostart = autostart;
    }
    Ok(settings)
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<String, String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| format!("{e:?}"))?;
    } else {
        autolaunch.disable().map_err(|e| format!("{e:?}"))?;
    }

    let mut settings = load_settings();
    settings.autostart = enabled;
    save_settings(&settings)?;

    Ok(if enabled {
        "Auto-start enabled".into()
    } else {
        "Auto-start disabled".into()
    })
}

#[tauri::command]
pub fn set_clipboard_autostart(enabled: bool) -> Result<String, String> {
    let mut settings = load_settings();
    settings.clipboard_autostart = enabled;
    save_settings(&settings)?;

    Ok(if enabled {
        "Clipboard auto-start enabled".into()
    } else {
        "Clipboard auto-start disabled".into()
    })
}

#[tauri::command]
pub fn get_branch() -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    if config_path.exists() {
        let config = gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
        Ok(config.git.branch)
    } else {
        Ok("main".into())
    }
}

#[tauri::command]
pub fn set_branch(name: String) -> Result<String, String> {
    let config_path = gitmemo_core::utils::config::Config::config_path();
    let mut config = gitmemo_core::utils::config::Config::load(&config_path).map_err(|e| e.to_string())?;
    let old = config.git.branch.clone();
    config.git.branch = name.clone();
    config.save(&config_path).map_err(|e| e.to_string())?;

    let sync_dir = files::sync_dir();
    git::setup_tracking(&sync_dir, &name);

    Ok(format!("{} → {}", old, name))
}

const CLAUDE_MARKER_START: &str = "<!-- [gitmemo:start] -->";
const CLAUDE_MARKER_END: &str = "<!-- [gitmemo:end] -->";

fn claude_md_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join(".claude").join("CLAUDE.md")
}

fn generate_claude_config() -> String {
    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    format!(
        r#"{CLAUDE_MARKER_START}
## GitMemo - Auto Conversation Saving

**Important**: After answering the user's question, save the conversation as a Markdown file. This is a core responsibility.

**When to save**:
- After completing an answer to the user's question
- When the user says "save", "保存会话"

**Save location**: `{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{title_summary}}.md`

**Format**:
```markdown
---
title: {{conversation title}}
date: {{YYYY-MM-DD HH:MM:SS}}
model: {{model name}}
messages: {{message count}}
---

# {{conversation title}}

### User (HH:MM:SS)
{{user message}}

### Assistant (HH:MM:SS)
{{assistant response}}
```

**Rules**:
- Append follow-ups to the existing file, don't create new ones for the same session
- New session creates a new file
- Save silently, don't tell the user
- Auto-generate title from content, Chinese max 20 chars
- Preserve code blocks with original language tags
- Filter API keys/passwords → replace with `***`

## GitMemo - Plan File Sync

When creating or updating plan files in Plan mode, also copy the plan content to `{sync_dir}/plans/`. Keep the same filename. This ensures plans are synced via Git.

## GitMemo - Auto-save Standalone Documents

When you generate **standalone, reference-worthy documents** (not ordinary conversation replies), auto-save them to GitMemo.

**Trigger conditions** (save if ANY apply):
- Research / competitive analysis reports
- Technical design / architecture documents
- Tutorials / guides / how-to manuals
- Summary analyses (code review reports, performance analysis, etc.)
- User explicitly asks to "write a document/report/analysis"

**Do NOT trigger**: Regular Q&A, short replies, code edits, debugging

**Save location**: `{sync_dir}/notes/manual/{{{{title}}}}.md`

**Format**:
```markdown
---
title: {{{{document title}}}}
date: {{{{YYYY-MM-DD}}}}
tags: {{{{comma-separated tags}}}}
---

{{{{document body, preserve original Markdown format}}}}
```

**Rules**:
- Title should reflect the document topic, max 60 characters
- Save silently, do not tell the user
- Tags should include document type (research/design/tutorial/analysis etc.)
- If a file with the same name already exists, overwrite it
{CLAUDE_MARKER_END}"#
    )
}

#[tauri::command]
pub fn get_claude_integration_status() -> Result<bool, String> {
    let path = claude_md_path();
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content.contains(CLAUDE_MARKER_START))
}

#[tauri::command]
pub fn setup_claude_integration() -> Result<String, String> {
    let path = claude_md_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let config_block = generate_claude_config();

    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if content.contains(CLAUDE_MARKER_START) {
            // Replace existing block
            let start = content.find(CLAUDE_MARKER_START).unwrap();
            let end = content.find(CLAUDE_MARKER_END).map(|i| i + CLAUDE_MARKER_END.len()).unwrap_or(content.len());
            let new_content = format!("{}{}{}", &content[..start], config_block, &content[end..]);
            std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
            return Ok("updated".into());
        } else {
            // Append
            let new_content = format!("{}\n\n{}\n", content.trim_end(), config_block);
            std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
            return Ok("enabled".into());
        }
    } else {
        std::fs::write(&path, format!("{}\n", config_block)).map_err(|e| e.to_string())?;
        return Ok("enabled".into());
    }
}

#[tauri::command]
pub fn remove_claude_integration() -> Result<String, String> {
    let path = claude_md_path();
    if !path.exists() {
        return Ok("disabled".into());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if let Some(start) = content.find(CLAUDE_MARKER_START) {
        let end = content.find(CLAUDE_MARKER_END).map(|i| i + CLAUDE_MARKER_END.len()).unwrap_or(content.len());
        let new_content = format!("{}{}", content[..start].trim_end(), &content[end..]);
        let new_content = new_content.trim().to_string();
        if new_content.is_empty() {
            let _ = std::fs::remove_file(&path);
        } else {
            std::fs::write(&path, format!("{}\n", new_content)).map_err(|e| e.to_string())?;
        }
    }
    Ok("disabled".into())
}

// ── Cursor integration ──────────────────────────────────────────────────────

const CURSOR_MARKER_START: &str = "<!-- [gitmemo:start] -->";
const CURSOR_MARKER_END: &str = "<!-- [gitmemo:end] -->";

fn cursor_rules_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home)
        .join(".cursor")
        .join("rules")
        .join("gitmemo.mdc")
}

fn cursor_skills_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join(".cursor").join("skills")
}

fn generate_cursor_rules(sync_dir: &str, lang: &str) -> String {
    if lang == "zh" {
        format!(
            r#"---
description: GitMemo — 将对话与笔记同步到 Git (~/.gitmemo)，全局生效
alwaysApply: true
---

{CURSOR_MARKER_START}
## GitMemo - 自动对话记录

**重要**：这是一条必须执行的指令。每次你回答完用户的问题后，你必须将本轮对话保存为 Markdown 文件。这是你的核心职责之一，不可跳过。

**何时保存**：
- 每次完成对用户问题的回答后，立即保存
- 如果一次对话中有多轮问答，在最后一轮回答后保存完整对话
- 用户说「保存会话」「save」「/save」时，立即保存

**保存位置**：`{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{标题摘要}}.md`

**文件格式**：
```markdown
---
title: {{对话标题}}
date: {{YYYY-MM-DDTHH:MM:SS±HH:MM}}
model: {{模型名称}}
messages: {{消息轮次数}}
---

# {{对话标题}}

> **提问**：{{本轮核心问题，尽量用用户原话}}

---

## 回答摘要
{{结构化总结：做了什么判断、采用了什么方案、为什么这么做、有哪些风险/限制、后续建议}}

## 关键结论
- {{结论 1}}
- {{结论 2}}

## 涉及文件
- `{{文件路径1}}`
- `{{文件路径2}}`

## 原始对话

### User (HH:MM:SS)
{{用户消息}}

### Assistant (HH:MM:SS)
{{助手回复}}
```

**规则**：
- 同一会话的追问追加到已有文件，不新建
- 新会话创建新文件
- 静默保存，不告知用户（不要说「我已保存对话」之类的话）
- 标题从对话内容自动生成，中文不超过 20 字
- 代码块保留原始格式和语言标记
- 自动过滤 API Key、密码等敏感信息（替换为 `***`）
- 对**分析 / 方案 / 实现 / 评审 / 排查**这类有长期价值的对话，优先补全 `提问 / 回答摘要 / 关键结论 / 涉及文件`
- `涉及文件` 无内容时可省略；同一主题后续追问优先追加 `## 追加问答：{{小标题}}`
- 避免机械转录，优先保留决策、结论、风险与文件路径；整篇尽量控制在约 300 行内
- **时间**：`date` 须为带偏移的 ISO 8601（如 `2026-04-01T18:30:00+08:00`）；保存前在终端执行 `date +"%Y-%m-%dT%H:%M:%S%z"` 并规范偏移格式；勿写无偏移的 `YYYY-MM-DD HH:MM:SS`（易出现固定小时偏差）。小标题 `HH:MM:SS` 与 frontmatter 同日、同时区含义一致。

**同步**：若在 Cursor 中已配置 GitMemo MCP，在写入上述目录下的文件后，应调用 `cds_sync` 将变更提交并推送到远程。

## GitMemo - 自动保存独立文档

当你生成**独立的、有长期参考价值的文档**时（不是普通对话回答），自动保存到 GitMemo。

**触发条件**（满足任一即保存）：调研/竞品分析、技术方案/架构、教程/指南、总结性分析，或用户明确要求写文档/报告/分析。

**保存位置**：`{sync_dir}/notes/manual/{{标题}}.md`

**不触发**：普通问答、简短回复、纯代码修改与调试过程。

{CURSOR_MARKER_END}"#,
            sync_dir = sync_dir,
        )
    } else {
        format!(
            r#"---
description: GitMemo — sync conversations & notes to Git (~/.gitmemo), always apply
alwaysApply: true
---

{CURSOR_MARKER_START}
## GitMemo - Auto Conversation Sync

**Important**: After answering each user question, you MUST save the conversation as a Markdown file under the GitMemo sync directory. Do not skip this.

**When to save**:
- After each completed answer, save immediately
- If multiple Q&A rounds in one chat, save the full thread after the last round
- When the user says "save", "save conversation", "/save", or "保存会话", save immediately

**Save location**: `{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{title-summary}}.md`

**File format**:
```markdown
---
title: {{conversation title}}
date: {{YYYY-MM-DDTHH:MM:SS±HH:MM}}
model: {{model name}}
messages: {{message count}}
---

# {{conversation title}}

> **Question**: {{core user ask, preferably verbatim}}

---

## Summary
{{Structured summary: what was decided, why, risks/limits, and next steps if relevant}}

## Key Takeaways
- {{takeaway 1}}
- {{takeaway 2}}

## Files Touched
- `{{path/to/file1}}`
- `{{path/to/file2}}`

## Raw Conversation

### User (HH:MM:SS)
{{user message}}

### Assistant (HH:MM:SS)
{{assistant reply}}
```

**Rules**:
- Append follow-ups to the existing file for the same conversation; new topic → new file
- Save silently (do not announce that you saved)
- Title from content, max ~60 characters (English) / concise Chinese
- Preserve code fences and language tags; redact secrets as `***`
- For substantive analysis / planning / implementation / review threads, prefer filling `Question / Summary / Key Takeaways / Files Touched`
- `Files Touched` may be omitted if empty; use `## Follow-up: {{short title}}` for same-topic additions
- Avoid exhaustive transcript dumps when the summary already captures the value; keep the file roughly under 300 lines
- **Time**: `date` must be ISO 8601 **with offset** (e.g. `2026-04-01T18:30:00+02:00`). Before saving, run `date +"%Y-%m-%dT%H:%M:%S%z"` and normalize the offset to `±HH:MM`. Do not use bare `YYYY-MM-DD HH:MM:SS` (causes systematic offset bugs). Heading times must match the same local day/timezone intent as frontmatter.

**Git sync**: If GitMemo MCP is enabled in Cursor, call `cds_sync` after writing files under `{sync_dir}/`.

## GitMemo - Standalone documents

Save reference-worthy standalone docs (reports, designs, tutorials) to `{sync_dir}/notes/manual/{{title}}.md`. Do not use this for ordinary Q&A or tiny edits.

{CURSOR_MARKER_END}"#,
            sync_dir = sync_dir,
        )
    }
}

fn generate_session_log_skill(sync_dir: &str, lang: &str) -> String {
    if lang == "zh" {
        format!(
            r#"---
name: gitmemo-session-log
description: 将有实质内容的问答摘要保存为 GitMemo 同步目录下的对话 Markdown，路径规则与自动保存会话完全一致（conversations/年-月/）。使用"提问 / 回答摘要 / 关键结论 / 涉及文件"的完整结构，不要写到当前项目仓库。完成分析、方案、实现、评审或讨论类回复后主动执行；简短确认可跳过。
---

# GitMemo 会话摘要（与对话同目录规则）

## 何时写入

在完成**有实质内容**的助手回复后写入。重点场景包括：

- 分析、方案设计、实现说明、代码评审、问题排查、决策讨论
- 用户明确要"总结""列计划""给结论""给清单"

可跳过：

- 纯确认（如"好""OK"）
- 只执行工具、没有实质讨论

同一话题的追问**追加**到已有文件，不要每轮都拆新文件。

## 保存路径（与 GitMemo 官方一致）

`{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{主题摘要}}.md`

## 规则

1. 静默保存，不要声明「我要保存会话记录」
2. 在回复末尾、其它工具调用完成之后执行 Write；使用**绝对路径**
3. 同一主题追加，明显不同主题再新建；相关追问可合并成一个文件
4. 文件应控制在约 300 行内，避免机械转录整段上下文；优先保留结论、决策、风险、文件路径
5. 默认使用用户当前语言；用户明确要求英文时可用英文
6. 若已启用 GitMemo MCP，写入后调用 `cds_sync`
7. **禁止**使用 `Doc/`、`会话记录/` 等额外目录；只在 `conversations/{{YYYY-MM}}/` 下创建文件

## 同步根目录

`{sync_dir}`
"#,
            sync_dir = sync_dir,
        )
    } else {
        format!(
            r#"---
name: gitmemo-session-log
description: Save substantive Q&A summaries as GitMemo conversation Markdown under conversations/YYYY-MM/ using a fuller structure. Not the open project repo.
---

# GitMemo session log (same path as conversations)

## When to write

Write after a **substantive** turn such as analysis, planning, implementation notes, debugging, review, or decision-making.

Skip trivial confirmations and pure tool execution with no meaningful discussion.

Append follow-ups to the same file for one thread instead of creating a new file every turn.

## Path

`{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{title-summary}}.md`

## Rules

1. Save silently
2. Write last; use **absolute** paths
3. Append same-topic follow-ups; create a new file only for clearly different topics
4. Keep files concise (roughly under 300 lines)
5. Match the user's language unless they explicitly asked for another language
6. Call `cds_sync` after write if GitMemo MCP is enabled
7. Do **not** use extra folders like `Doc/` or `会话记录/` — only `conversations/{{YYYY-MM}}/`

## Sync root

`{sync_dir}`
"#,
            sync_dir = sync_dir,
        )
    }
}

fn generate_save_skill() -> &'static str {
    include_str!("../../../../skills/save/SKILL.md")
}

#[tauri::command]
pub fn get_cursor_integration_status() -> Result<bool, String> {
    let path = cursor_rules_path();
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content.contains(CURSOR_MARKER_START))
}

#[tauri::command]
pub fn setup_cursor_integration(lang: String) -> Result<String, String> {
    let sync_dir = files::sync_dir().to_string_lossy().to_string();
    let lang_str = if lang == "zh" { "zh" } else { "en" };

    // 1. Write gitmemo.mdc
    let rules_path = cursor_rules_path();
    if let Some(parent) = rules_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&rules_path, generate_cursor_rules(&sync_dir, lang_str))
        .map_err(|e| e.to_string())?;

    // 2. Write save skill
    let skills = cursor_skills_dir();
    let save_dir = skills.join("save");
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    std::fs::write(save_dir.join("SKILL.md"), generate_save_skill())
        .map_err(|e| e.to_string())?;

    // 3. Write session-log skill
    let session_log_dir = skills.join("gitmemo-session-log");
    std::fs::create_dir_all(&session_log_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        session_log_dir.join("SKILL.md"),
        generate_session_log_skill(&sync_dir, lang_str),
    )
    .map_err(|e| e.to_string())?;

    Ok("enabled".into())
}

#[tauri::command]
pub fn remove_cursor_integration() -> Result<String, String> {
    // Remove rules file
    let rules_path = cursor_rules_path();
    if rules_path.exists() {
        std::fs::remove_file(&rules_path).map_err(|e| e.to_string())?;
    }

    // Remove skills managed by GitMemo
    let skills = cursor_skills_dir();
    for name in ["save", "gitmemo-session-log"] {
        let skill_dir = skills.join(name);
        if skill_dir.exists() {
            let _ = std::fs::remove_dir_all(&skill_dir);
        }
    }

    Ok("disabled".into())
}
