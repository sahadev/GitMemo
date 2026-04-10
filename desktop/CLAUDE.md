# GitMemo Desktop — Architecture Rules

## Process Rule: Confirm Before Implementing

For any non-trivial feature or architectural change, always present the design/approach to the user for confirmation BEFORE writing code. This avoids wasted effort and ensures alignment.

## State Management: Global-First Principle

All shared state MUST live in a Zustand store (`useAppStore`). Component-level `useState` is ONLY for:

1. **UI-only ephemeral state** — modal open/close, input focus, copy feedback animation
2. **Form draft state** — editing branch name, editing remote URL (not yet saved)
3. **Derived computations** from global state (e.g. `const editorConfigured = claudeEnabled || cursorEnabled`)

**Never** use `useState` for:
- Backend runtime status (clipboard watching, file watcher, settings)
- Feature flags / integration toggles (Claude enabled, Cursor enabled)
- Theme / locale preferences
- App metadata (version, release info)

**Never** use `window.dispatchEvent` to sync state between components — the Zustand store is the single source of truth.

### Adding New Global State

1. Add the state field and refresh action to `useAppStore.ts`
2. If the backend emits events for this state, add a listener in `initAppListeners()`
3. Components read via `const { field } = useAppStore()`
4. After mutating (invoke), call the `refresh*()` action — do NOT set state optimistically

### Existing Stores

| Store | Scope |
|-------|-------|
| `useAppStore` | App-wide: clipboard status, settings, integration flags, theme, app meta |
| `useSync` | Git sync: sync state machine, git status |
| `useI18n` | Internationalization: locale, translation function |
