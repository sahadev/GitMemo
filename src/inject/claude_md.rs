use anyhow::Result;
use crate::utils::i18n::Lang;

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

当你生成**独立的、��长期参考价值的文档**时（调研报告、技术方案、教程指南、总结分析，或用户明确要求写文档/报告），自动保存到 `{sync_dir}/notes/manual/{{标题}}.md`：

```markdown
---
title: {{文档标题}}
date: {{YYYY-MM-DD}}
tags: {{逗号分隔的标签}}
---

{{文档正文}}
```

规则：标题不超过 30 字，静默保存，同名文件覆盖。普通问答、代码修改、调试不触发。
{MARKER_END}"#
    )
}

fn generate_instruction_en(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
## GitMemo

Conversations are auto-captured by GitMemo (via `gitmemo capture`). No manual saving needed.

When you generate **standalone, reference-worthy documents** (research reports, design docs, tutorials, analyses, or when the user explicitly asks to write a document/report), auto-save to `{sync_dir}/notes/manual/{{title}}.md`:

```markdown
---
title: {{document title}}
date: {{YYYY-MM-DD}}
tags: {{comma-separated tags}}
---

{{document body}}
```

Rules: title max 60 chars, save silently, overwrite same-name files. Do not trigger for regular Q&A, code edits, or debugging.
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
    }

    #[test]
    fn test_inject_en() {
        let instruction = generate_instruction("~/.gitmemo", Lang::En);
        assert!(instruction.contains(MARKER_START));
        assert!(instruction.contains(MARKER_END));
        assert!(instruction.contains("GitMemo"));
        assert!(instruction.contains("auto-captured"));
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
