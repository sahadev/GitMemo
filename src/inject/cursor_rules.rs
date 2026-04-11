use anyhow::Result;
use crate::utils::i18n::Lang;

const MARKER_START: &str = "<!-- [gitmemo:start] -->";
const MARKER_END: &str = "<!-- [gitmemo:end] -->";

fn frontmatter(lang: Lang) -> &'static str {
    match lang {
        Lang::Zh => {
            r#"---
description: GitMemo — 将对话与笔记同步到 Git（~/.gitmemo），全局生效
alwaysApply: true
---

"#
        }
        Lang::En => {
            r#"---
description: GitMemo — sync conversations & notes to Git (~/.gitmemo), always apply
alwaysApply: true

---

"#
        }
    }
}

fn body_zh(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
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

### Proactive save（无需用户说「保存」）

当本轮回答中输出了**成篇、可独立阅读**的内容时，**在同一轮回答内**主动落盘到 `notes/manual/`，**不要**等用户说 save / 保存会话 / `/save`。触发示例（满足其一即可考虑落盘；若多条合并为一篇更清晰则合并）：

- 产品规划 / 商业与功能规划、路线图、PRD 级说明
- 技术方案 / 架构设计 / 数据流与安全设计说明
- 教程、Runbook、故障排查指南（多步骤、可复用）
- 长篇调研结论（超出「会话摘要」即可单独成文的价值）

**文件要求**：

- 路径：`{sync_dir}/notes/manual/{{标题}}.md`（`title` 简洁、文件名友好，可用英文 kebab-case 或简短中文主题）
- 正文应**尽量完整**收录本轮交付的规划/方案要点（不要只在 `conversations/` 里写「详见聊天」而省略 `manual` 正文）
- 仍按上文执行：`conversations/` 的会话同步、`date` ISO 带偏移、保存后静默（不必向用户强调「已保存」）；若启用 GitMemo MCP 则对 `{sync_dir}/` 下变更调用 `cds_sync`

**例外**：用户明确只要聊天里看看、不要写盘；或内容极短/纯确认句 — 不写 `notes/manual`。

{MARKER_END}"#,
        sync_dir = sync_dir
    )
}

fn body_en(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
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

### Proactive save (without the user saying "save")

When this turn's answer includes **substantial, self-contained** content, **in the same assistant turn** write it to `notes/manual/` proactively. **Do not** wait for the user to say "save", "save conversation", "/save", or "保存会话". Triggers (if any apply, save; merge into one document when clearer):

- Product planning / business & feature planning, roadmaps, PRD-level writeups
- Technical solution / architecture / data-flow & security design notes
- Tutorials, runbooks, troubleshooting guides (multi-step, reusable)
- Long-form research conclusions (worth more than a chat summary alone)

**File requirements**:

- Path: `{sync_dir}/notes/manual/{{title}}.md` (`title` short and filesystem-friendly; English kebab-case or a brief Chinese topic is fine)
- The body should **fully** capture the planning / spec delivered this turn (do not only add "see chat" in `conversations/` and skip the full `manual` text)
- Still follow the rules above: conversation sync to `conversations/`, ISO `date` with timezone offset, save silently (no need to announce "saved"); if GitMemo MCP is enabled, call `cds_sync` after writes under `{sync_dir}/`

**Exceptions**: The user explicitly wants chat only, no disk writes; or the reply is very short / confirmation-only — skip `notes/manual`.

{MARKER_END}"#,
        sync_dir = sync_dir
    )
}

/// Full contents of `~/.cursor/rules/gitmemo.mdc` (YAML frontmatter + marked block).
pub fn generate_instruction(sync_dir: &str, lang: Lang) -> String {
    let fm = frontmatter(lang).trim_end();
    let body = match lang {
        Lang::Zh => body_zh(sync_dir),
        Lang::En => body_en(sync_dir),
    };
    format!("{}\n\n{}", fm, body)
}

/// Write global Cursor rule to `~/.cursor/rules/gitmemo.mdc` (overwrites GitMemo-managed file).
pub fn inject(rules_path: &std::path::Path, sync_dir: &str, lang: Lang) -> Result<()> {
    let content = generate_instruction(sync_dir, lang);
    if let Some(parent) = rules_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(rules_path, content)?;
    Ok(())
}

/// Remove GitMemo Cursor rule file (created by `init`).
pub fn remove(rules_path: &std::path::Path) -> Result<()> {
    if rules_path.exists() {
        std::fs::remove_file(rules_path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_has_always_apply() {
        let s = generate_instruction("/home/u/.gitmemo", Lang::En);
        assert!(s.starts_with("---"));
        assert!(s.contains("alwaysApply: true"));
        assert!(s.contains(MARKER_START));
        assert!(s.contains(MARKER_END));
        assert!(s.contains("cds_sync"));
    }

    #[test]
    fn zh_lang() {
        let s = generate_instruction("~/.gitmemo", Lang::Zh);
        assert!(s.contains("保存会话"));
        assert!(s.contains("alwaysApply: true"));
        assert!(s.contains("Proactive save"));
        assert!(s.contains("无需用户说"));
        assert!(s.contains("notes/manual"));
    }

    #[test]
    fn en_proactive_save_section() {
        let s = generate_instruction("/tmp/.gitmemo", Lang::En);
        assert!(s.contains("Proactive save (without the user saying"));
        assert!(s.contains("PRD-level"));
        assert!(s.contains("/tmp/.gitmemo/notes/manual"));
    }
}
