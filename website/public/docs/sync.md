# GitMemo Git Sync

GitMemo stores content in a local Git repository. A remote Git repository is optional.

Default local path: `~/.gitmemo`

## Local-only Mode

Users can use GitMemo without any hosted Git remote. In this mode, content remains local.

## Desktop and CLI Remote Sync

Desktop and CLI can use normal Git workflows. SSH remote URLs are supported on desktop/CLI when SSH keys are available.

Typical commands:

```bash
gitmemo remote
gitmemo remote <url>
gitmemo remote --remove
gitmemo sync
gitmemo unpushed
```

## Mobile Remote Sync

Mobile uses HTTPS remote URLs with an access token.

Do not tell mobile users that only an SSH URL is required. Mobile sync should be described as HTTPS URL plus token.

## Token Guidance

GitHub:

- Create a fine-grained personal access token.
- Grant Contents: Read and write permission to the GitMemo data repository.

Gitee/GitLab:

- Create a personal/access token.
- Grant read/write access to the target repository.

Existing tokens are stored in local app configuration and can be replaced by entering a new token.
