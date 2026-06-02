//! Agent skill `gitmemo-session-log`: substantive Q&A summaries as normal conversation markdown
//! under `conversations/{YYYY-MM}/`, same path rule as CLAUDE.md / global Cursor rule — no extra subfolders.

use crate::utils::i18n::Lang;
use anyhow::Result;

fn skill_zh(sync_dir: &str) -> String {
    format!(
        r#"---
name: gitmemo-session-log
description: 将有实质内容的问答摘要保存为 GitMemo 同步目录下的对话 Markdown，路径规则与自动保存会话完全一致（conversations/年-月/）。使用“提问 / 回答摘要 / 关键结论 / 涉及文件”的完整结构，不要写到当前项目仓库。完成分析、方案、实现、评审或讨论类回复后主动执行；简短确认可跳过。
---

# GitMemo 会话摘要（与对话同目录规则）

## 何时写入

在完成**有实质内容**的助手回复后写入。重点场景包括：

- 分析、方案设计、实现说明、代码评审、问题排查、决策讨论
- 用户明确要“总结”“列计划”“给结论”“给清单”

可跳过：

- 纯确认（如“好”“OK”）
- 只执行工具、没有实质讨论

同一话题的追问**追加**到已有文件，不要每轮都拆新文件。

## 保存路径（与 GitMemo 官方一致）

**必须**使用与 `CLAUDE.md` / Cursor 全局规则相同的格式（不要用项目工作区里的路径）：

`{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{主题摘要}}.md`

- `YYYY-MM`、`MM-DD`：以用户本地日期为准（保存前可用终端 `date` 确认）
- 主题摘要：中文约 20 字以内，文件名中非法字符改为 `_`
- 若该月目录不存在则创建

## 文件内容结构（优先使用这个更完整的摘要模板）

```markdown
---
title: {{标题}}
date: {{ISO8601 带时区偏移}}
model: {{模型名，可选}}
messages: {{消息轮次数，可选}}
---

# {{标题}}

> **提问**：{{用户原话}}

---

## 回答摘要

{{结构化总结本轮回答，覆盖：做了什么判断、为什么这样做、采取了什么方案、有哪些风险/限制、接下来怎么推进。}}

## 关键结论

- {{最重要结论 1}}
- {{最重要结论 2}}

## 涉及文件

- `{{文件路径1}}`
- `{{文件路径2}}`

## 原始对话（可选）

### User (HH:MM:SS)
{{用户消息}}

### Assistant (HH:MM:SS)
{{助手回复}}
```

说明：

- `涉及文件` 如无可省略，但有代码/配置/文档改动时应尽量列出
- 若需要兼容现有对话查看器，可保留 `### User` / `### Assistant` 原始对话段落
- 如果是同一主题的后续追问，优先在同一文件下追加 `## 追加问答：{{小标题}}`

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
}

fn skill_en(sync_dir: &str) -> String {
    format!(
        r#"---
name: gitmemo-session-log
description: Save substantive Q&A summaries as GitMemo conversation Markdown under conversations/{{YYYY-MM}}/ using a fuller structure: question, summary, key takeaways, and touched files. Not the open project repo.
---

# GitMemo session log (same path as conversations)

## When to write

Write after a **substantive** turn such as analysis, planning, implementation notes, debugging, review, or decision-making.

Skip:

- trivial confirmations
- pure tool execution with no meaningful discussion

Append follow-ups to the same file for one thread instead of creating a new file every turn.

## Path (same as official GitMemo)

`{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{title-summary}}.md`

- Use the user’s local date; create the month folder if needed
- Title slug: concise; sanitize filename characters

## Content template (preferred)

```markdown
---
title: {{title}}
date: {{ISO8601 with offset}}
model: {{model, optional}}
messages: {{message count, optional}}
---

# {{title}}

> **Question**: {{user's original ask}}

---

## Summary

{{Structured summary: what was decided, why, what changed, risks/limits, and next steps if relevant.}}

## Key Takeaways

- {{takeaway 1}}
- {{takeaway 2}}

## Files Touched

- `{{path/to/file1}}`
- `{{path/to/file2}}`

## Raw Conversation (optional)

### User (HH:MM:SS)
{{user message}}

### Assistant (HH:MM:SS)
{{assistant reply}}
```

Notes:

- Omit `Files Touched` if no files were discussed or modified
- For follow-up turns in the same thread, prefer appending `## Follow-up: {{short title}}`
- Keep `### User` / `### Assistant` if you want compatibility with existing conversation viewers

## Rules

1. Save silently
2. Write last; use **absolute** paths
3. Append same-topic follow-ups; create a new file only for clearly different topics
4. Keep files concise (roughly under 300 lines); prioritize conclusions over exhaustive transcript dumps
5. Match the user’s language unless they explicitly asked for another language
6. Call `cds_sync` after write if GitMemo MCP is enabled
7. Do **not** use extra folders like `Doc/` or `会话记录/` — only `conversations/{{YYYY-MM}}/`

## Sync root

`{sync_dir}`
"#,
        sync_dir = sync_dir,
    )
}

/// Full `SKILL.md` content (same file installed under Cursor and Claude Code skill dirs).
pub fn generate(sync_dir: &str, lang: Lang) -> String {
    match lang {
        Lang::Zh => skill_zh(sync_dir),
        Lang::En => skill_en(sync_dir),
    }
}

pub fn install(skill_dir: &std::path::Path, sync_dir: &str, lang: Lang) -> Result<()> {
    std::fs::create_dir_all(skill_dir)?;
    std::fs::write(skill_dir.join("SKILL.md"), generate(sync_dir, lang))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contains_sync_dir_and_monthly_pattern() {
        let s = generate("/home/u/.gitmemo", Lang::En);
        assert!(s.contains("/home/u/.gitmemo"));
        assert!(s.contains("conversations/{YYYY-MM}"));
        assert!(s.contains("gitmemo-session-log"));
        assert!(s.contains("cds_sync"));
    }

    #[test]
    fn zh_contains_hints() {
        let s = generate("~/.gitmemo", Lang::Zh);
        assert!(s.contains("会话摘要"));
        assert!(s.contains("禁止"));
        assert!(s.contains("关键结论"));
        assert!(s.contains("涉及文件"));
    }
}
