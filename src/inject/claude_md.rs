use crate::utils::i18n::Lang;
use anyhow::Result;

pub const MARKER_START: &str = "<!-- [gitmemo:start] -->";
const MARKER_END: &str = "<!-- [gitmemo:end] -->";

/// Generate the CLAUDE.md instruction block (language-aware)
pub fn generate_instruction(sync_dir: &str, lang: Lang) -> String {
    match lang {
        Lang::Zh => generate_instruction_zh(sync_dir),
        Lang::En => generate_instruction_en(sync_dir),
    }
}

fn generate_instruction_zh(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
## GitMemo

对话会由 GitMemo 自动捕获（通过 `gitmemo capture`），无需手动保存。

当你输出**大段、可独立阅读、对后续有复用价值**的内容时，必须将其转存为 Markdown 文档并保存到 GitMemo，而不是只留在聊天里。典型场景包括：调研报告、分析报告、技术方案、架构设计、教程指南、总结性长文，或用户明确要求写文档/报告。

保存位置：`{sync_dir}/notes/manual/{{标题}}.md`

这条规则的核心是：**大段内容要落盘，简单问答不要落盘。**

触发：
- 调研 / 竞品 / 技术分析形成了成篇结论
- 输出了较长的方案、设计、教程、复盘、分析
- 用户要求“写文档 / 报告 / 分析 / 方案”

不触发：
- 普通问答
- 简短确认
- 纯代码修改 / 调试过程中的零碎交流

保存格式示例：

```markdown
---
title: {{文档标题}}
date: {{YYYY-MM-DDTHH:MM:SS±HH:MM}}
tags: {{逗号分隔的标签}}
---

{{文档正文}}
```

规则：标题不超过 30 字，静默保存，同名文件覆盖；`date` 必须是带时区偏移的 ISO 8601 完整时间，例如 `2026-05-24T20:33:22+08:00`，保存前可执行 `date +"%Y-%m-%dT%H:%M:%S%z"` 并把偏移格式规范为 `±HH:MM`，不要只写 `YYYY-MM-DD`；正文尽量完整，不要只在对话里说“见上文”；保存后应继续按 GitMemo 规则同步。普通问答、代码修改、调试不触发。
{MARKER_END}"#
    )
}

fn generate_instruction_en(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
## GitMemo

Conversations are auto-captured by GitMemo (via `gitmemo capture`). No manual saving needed.

When your answer contains **long-form, self-contained, reusable content**, you MUST convert it into a Markdown document and save it to GitMemo instead of leaving it only in chat. Typical cases: research reports, analysis reports, technical proposals, architecture docs, tutorials, long-form summaries, or whenever the user explicitly asks for a document/report.

Save location: `{sync_dir}/notes/manual/{{title}}.md`

Core rule: **long-form content should be saved as Markdown; simple Q&A should not.**

Trigger:
- Research / analysis with a substantial conclusion
- A long proposal, design note, tutorial, postmortem, or report-like answer
- The user asks to write a document / report / analysis / proposal

Do not trigger:
- Regular Q&A
- Brief confirmations
- Fragmented discussion during code edits / debugging

Example format:

```markdown
---
title: {{document title}}
date: {{YYYY-MM-DDTHH:MM:SS±HH:MM}}
tags: {{comma-separated tags}}
---

{{document body}}
```

Rules: title max 60 chars, save silently, overwrite same-name files; `date` must be full ISO 8601 with timezone offset, e.g. `2026-05-24T20:33:22+08:00`. Before saving, run `date +"%Y-%m-%dT%H:%M:%S%z"` if needed and normalize the offset to `±HH:MM`; do not write date-only `YYYY-MM-DD`. Capture the full substance in the document instead of only referencing the chat; after saving, continue following GitMemo sync rules. Do not trigger for regular Q&A, code edits, or debugging.
{MARKER_END}"#
    )
}

/// Inject instruction into ~/.claude/CLAUDE.md
pub fn inject(claude_md_path: &std::path::Path, sync_dir: &str, lang: Lang) -> Result<()> {
    let content = if claude_md_path.exists() {
        std::fs::read_to_string(claude_md_path)?
    } else {
        String::new()
    };

    // Remove old injection if exists
    let cleaned = remove_block(&content);

    // Append new instruction
    let instruction = generate_instruction(sync_dir, lang);
    let new_content = if cleaned.is_empty() {
        instruction
    } else {
        format!("{}\n\n{}", cleaned.trim_end(), instruction)
    };

    if let Some(parent) = claude_md_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(claude_md_path, new_content)?;
    Ok(())
}

/// Remove injected block from content
pub fn remove(claude_md_path: &std::path::Path) -> Result<()> {
    if !claude_md_path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(claude_md_path)?;
    let cleaned = remove_block(&content);
    std::fs::write(claude_md_path, cleaned)?;
    Ok(())
}

fn remove_block(content: &str) -> String {
    if let (Some(start), Some(end)) = (content.find(MARKER_START), content.find(MARKER_END)) {
        let before = &content[..start];
        let after = &content[end + MARKER_END.len()..];
        format!("{}{}", before.trim_end(), after.trim_start())
    } else {
        content.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inject_zh() {
        let instruction = generate_instruction("~/.gitmemo", Lang::Zh);
        assert!(instruction.contains(MARKER_START));
        assert!(instruction.contains(MARKER_END));
        assert!(instruction.contains("GitMemo"));
        assert!(instruction.contains("自动捕获"));
        assert!(instruction.contains("YYYY-MM-DDTHH:MM:SS"));
        assert!(!instruction.contains("date: {{YYYY-MM-DD}}"));
    }

    #[test]
    fn test_inject_en() {
        let instruction = generate_instruction("~/.gitmemo", Lang::En);
        assert!(instruction.contains(MARKER_START));
        assert!(instruction.contains(MARKER_END));
        assert!(instruction.contains("GitMemo"));
        assert!(instruction.contains("auto-captured"));
        assert!(instruction.contains("YYYY-MM-DDTHH:MM:SS"));
        assert!(!instruction.contains("date: {{YYYY-MM-DD}}"));
    }

    #[test]
    fn test_inject_and_remove() {
        let instruction = generate_instruction("~/.gitmemo", Lang::En);
        let original = "# My CLAUDE.md\n\nSome existing content.\n";
        let injected = format!("{}\n\n{}", original.trim(), &instruction);
        let cleaned = remove_block(&injected);
        assert_eq!(cleaned.trim(), original.trim());
    }
}
