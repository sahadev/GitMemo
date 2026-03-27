use anyhow::Result;
use crate::utils::i18n::Lang;

const MARKER_START: &str = "<!-- [gitmemo:start] -->";
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
## GitMemo - 自动对话记录

**重要**：这是一条必须执行的指令。每次你回答完用户的问题后，你必须将本轮对话保存为 Markdown 文件。这是你的核心职责之一，不可跳过。

**何时保存**：
- 每次完成对用户问题的回答后，立即保存
- 如果一次对话中有多轮问答，在最后一轮回答后保存完整对话
- 用户说 "保存会话"、"save" 时，立即保存

**保存位置**：`{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{标题摘要}}.md`

**文件格式**：
```markdown
---
title: {{对话标题}}
date: {{YYYY-MM-DD HH:MM:SS}}
model: {{模型名称}}
messages: {{消息轮次数}}
---

# {{对话标题}}

### User (HH:MM:SS)
{{用户消息}}

### Assistant (HH:MM:SS)
{{助手回复}}
```

**规则**：
- 同一会话的追问追加到已有文件，不新建
- 新会话创建新文件
- 静默保存，不告知用户（不要说"我已保存对话"之类的话）
- 标题从对话内容自动生成，中文不超过 20 字
- 代码块保留原始格式和语言标记
- 自动过滤 API Key、密码等敏感信息（替换为 `***`）
{MARKER_END}"#
    )
}

fn generate_instruction_en(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
## GitMemo - Auto Conversation Sync

**Important**: This is a mandatory instruction. After answering each user question, you MUST save the conversation as a Markdown file. This is one of your core responsibilities and must not be skipped.

**When to save**:
- After completing your answer to each user question, save immediately
- If there are multiple rounds of Q&A in one conversation, save the complete conversation after the last round
- When the user says "save", "save conversation", save immediately

**Save location**: `{sync_dir}/conversations/{{YYYY-MM}}/{{MM-DD}}-{{title-summary}}.md`

**File format**:
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
{{assistant reply}}
```

**Rules**:
- Append follow-up messages to the existing file, do not create a new one
- Create a new file for new conversations
- Save silently, do not tell the user (never say "I've saved the conversation")
- Auto-generate title from conversation content, max 60 characters
- Preserve original format and language tags for code blocks
- Auto-filter API Keys, passwords and other sensitive info (replace with `***`)
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
        assert!(instruction.contains("自动对话记录"));
    }

    #[test]
    fn test_inject_en() {
        let instruction = generate_instruction("~/.gitmemo", Lang::En);
        assert!(instruction.contains(MARKER_START));
        assert!(instruction.contains(MARKER_END));
        assert!(instruction.contains("Auto Conversation Sync"));
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
