# GitMemo Android

GitMemo Android is the mobile client for the GitMemo knowledge repository.

## Current APK

- URL: https://gitmemo.kakacut.cn/mobile/gitmemo-android-v1.0.121-arm64-v8a-release.apk
- Filename: gitmemo-android-v1.0.121-arm64-v8a-release.apk
- ABI: arm64-v8a
- Version: v1.0.121

## Mobile Capabilities

The Android client is intended for:

- Viewing existing GitMemo content.
- Creating and editing notes.
- Importing files and images into the GitMemo repository.
- Saving mobile content into the same Git-backed knowledge base.
- Syncing through an HTTPS Git remote using an access token.

## Mobile Limitations

- Android does not provide the same desktop clipboard monitoring workflow.
- AI editor integrations are desktop/CLI-side features, not mobile AI chat features.
- Mobile sync does not depend on system Git or SSH.

## Remote Sync on Android

Android uses:

- HTTPS Git remote URL.
- Access token with read/write permission for the GitMemo data repository.

For GitHub, create a fine-grained personal access token and grant Contents: Read and write permission for the target GitMemo data repository.

For Gitee or GitLab, create a personal/access token with read and write access to the target repository.
