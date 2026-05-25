# Repository Guidelines

## Project Structure & Module Organization

GitMemo is split into three main areas. The Rust CLI/core lives at `src/`, with commands in `src/commands`, MCP support in `src/mcp`, storage and Git logic in `src/storage`, and shared services in `src/services`. The Tauri app lives in `desktop/`: React source is in `desktop/src`, native commands are in `desktop/src-tauri/src`, and generated Android artifacts are under `desktop/src-tauri/gen/android`. The website lives in `website/`, with pages and sections in `website/src`. Shared docs, deployment files, plugins, and helper scripts are in `docs/`, `deploy/`, `plugins/`, and `scripts/`.

## Build, Test, and Development Commands

- `cargo test`: runs Rust unit tests for the CLI/core and desktop command code.
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml`: checks the Tauri native crate.
- `pnpm --dir desktop dev`: starts the desktop React/Vite dev server.
- `pnpm --dir desktop build`: generates the changelog, type-checks, and builds the desktop frontend.
- `pnpm --dir desktop tauri dev`: runs the full Tauri desktop app locally.
- `pnpm --dir desktop build:android:arm64`: builds the arm64 Android APK.
- `npm run build --prefix website`: generates LLM docs, builds, and prerenders the website.
- `npm run lint --prefix website`: runs ESLint for the website.

## Coding Style & Naming Conventions

Follow existing local style. Rust uses standard `rustfmt` conventions, `snake_case` modules/functions, and `PascalCase` types. React/TypeScript files use 2-space indentation, `PascalCase` components, `use*` hook names, and colocated utilities under `desktop/src/utils` or `website/src`. Prefer existing Mantine, Zustand, Tauri command, and i18n patterns instead of introducing new abstractions.

## Testing Guidelines

Rust tests are mostly inline `#[cfg(test)]` modules next to the code they validate. Add focused tests when changing storage, sync, datetime parsing, MCP, or search behavior. For frontend changes, run the relevant build command at minimum; add manual verification notes for desktop/mobile UI behavior, especially Android navigation, clipboard, sync, and download flows.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commit prefixes such as `feat:`, `fix:`, and `chore:`; release automation may use `[skip ci]`. Keep commits scoped and imperative, for example `fix: preserve clipboard scroll position`. Pull requests should include a concise summary, validation commands run, linked issues when applicable, and screenshots or screen recordings for UI changes.

## Security & Configuration Tips

Do not commit real tokens, SSH keys, repository credentials, or local `.gitmemo` data. Treat sync URLs, GitHub tokens, and Android signing material as local configuration. Keep generated build outputs out of commits unless the release process requires them.
