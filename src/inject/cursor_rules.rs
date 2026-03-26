use anyhow::Result;

const MARKER_START: &str = "<!-- [gitmemo:start] -->";
const MARKER_END: &str = "<!-- [gitmemo:end] -->";

/// Generate the Cursor rules instruction block
pub fn generate_instruction(sync_dir: &str) -> String {
    format!(
        r#"{MARKER_START}
## GitMemo - Auto Conversation Sync

**Important**: This is a mandatory instruction. After answering each user question, you MUST save the conversation as a Markdown file. This is one of your core responsibilities and must not be skipped.

**When to save**:
- After completing your answer to each user question, save immediately
- If there are multiple rounds of Q&A in one conversation, save the complete conversation after the last round
- When the user says "save", "保存会话", save immediately

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
- Auto-generate title from conversation content, max 20 characters
- Preserve original format and language tags for code blocks
- Auto-filter API Keys, passwords and other sensitive info (replace with `***`)

**After saving**: You MUST call the `cds_sync` MCP tool to sync changes to Git. This is required after every file write to `{sync_dir}/`.
{MARKER_END}"#
    )
}

/// Inject instruction into ~/.cursor/rules/gitmemo.mdc
pub fn inject(rules_path: &std::path::Path, sync_dir: &str) -> Result<()> {
    let content = if rules_path.exists() {
        std::fs::read_to_string(rules_path)?
    } else {
        String::new()
    };

    // Remove old injection if exists
    let cleaned = remove_block(&content);

    // Build new content
    let instruction = generate_instruction(sync_dir);
    let new_content = if cleaned.is_empty() {
        instruction
    } else {
        format!("{}\n\n{}", cleaned.trim_end(), instruction)
    };

    if let Some(parent) = rules_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(rules_path, new_content)?;
    Ok(())
}

/// Remove injected block from Cursor rules file
pub fn remove(rules_path: &std::path::Path) -> Result<()> {
    if !rules_path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(rules_path)?;
    let cleaned = remove_block(&content);
    if cleaned.trim().is_empty() {
        std::fs::remove_file(rules_path)?;
    } else {
        std::fs::write(rules_path, cleaned)?;
    }
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
    fn test_inject_and_remove() {
        let instruction = generate_instruction("~/.gitmemo");
        assert!(instruction.contains(MARKER_START));
        assert!(instruction.contains(MARKER_END));
        assert!(instruction.contains("cds_sync"));

        let original = "# My Cursor Rules\n\nSome existing content.\n";
        let injected = format!("{}\n\n{}", original.trim(), &instruction);
        let cleaned = remove_block(&injected);
        assert_eq!(cleaned.trim(), original.trim());
    }
}
