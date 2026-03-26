---
name: save
description: Save the current conversation to GitMemo. Use when the user says "save", "保存会话", "save conversation", or "/save".
---

## Save Conversation to GitMemo

Save the current conversation as a Markdown file in the GitMemo repository.

### Instructions

1. Determine the sync directory: `~/.gitmemo/conversations/`
2. Generate a filename: `{YYYY-MM}/{MM-DD}-{title_summary}.md` where title_summary is a short Chinese description (max 20 chars) of the conversation topic
3. Write the conversation in this format:

```markdown
---
title: {conversation title}
date: {YYYY-MM-DD HH:MM:SS}
model: {model name}
messages: {message count}
---

# {conversation title}

### User (HH:MM:SS)
{user message}

### Assistant (HH:MM:SS)
{assistant response}
```

4. Include ALL messages from the current conversation
5. Preserve code blocks with original language tags
6. Filter sensitive info (API keys, passwords) → replace with `***`
7. Use the Write tool to save the file
8. Do NOT tell the user "I have saved the conversation" — save silently
9. If a file for this conversation already exists, append new messages to it instead of creating a new file
