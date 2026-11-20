# Windows application architecture

One Tauri 2 process hosts Rust services and a WebView2 interface. There is no production Node/Bun server. Bun manages frontend packages and development commands; Vite serves only development previews.

`apps/desktop/src/bridge.ts` isolates data and native IPC from presentation. `state.ts` publishes local changes; `packages/shared/model.ts` validates TypeScript inputs using Zod. Rust independently validates IPC. UUIDs and explicit timestamps are portable.

The authoritative SQLite database is `%APPDATA%/com.jarvis.personal/jarvis.db`, resolved through Tauri's application-data API. It enables WAL, foreign keys, busy timeouts, indexed record kinds and transactional versioned migrations. Native-only credentials and folder grants are separate tables. The browser preview uses its own IndexedDB development store and cannot control Windows.

Rust runs expensive network/system operations through background tasks. One bounded native scheduler delivers reminders and briefings and manages daily backups while the application is running, including in the tray. No reminder can execute when the PC is powered off. Quiet hours defer overdue reminders until the next eligible tick.

Windows DPAPI protects stored provider/OAuth credentials and encrypted `.jbackup` files. Records in the operational SQLite database are not encrypted: Windows account access controls and full-disk encryption remain important. Exports are plaintext and explicitly user initiated. A restore validates integrity, schema and records and preserves a pre-restore backup before replacing the current database.

Project folder access starts read-only and is explicitly granted through a native folder picker. Canonical-path containment, symlink restrictions, sensitive-file exclusions and size/traversal bounds limit source access. A proposed Code Assistant edit shows a bounded diff and file hash, preserves an encrypted recovery copy, and writes only after a native approval. AI context contains only bounded recent messages and relevant approved memories. Screen capture and selected source text require confirmation; online inference also requires an explicit preference. AI output is rendered as text and never becomes a shell command.

Every assistant-requested state change passes through an expiring, single-use, argument-scoped Rust approval broker and an explicit Windows OK/Cancel dialog; Cancel is the default. Append-only operational logs remain automatic but cannot overwrite personal records. Windows controls use fixed allowlists. Power operations and email sends require native dialogs. Optional ChatGPT inference uses the official Codex CLI in an isolated, read-only configuration with tools and MCP disabled. CSP excludes remote scripts, frames, and frontend networking; integrations run in Rust with explicit endpoints and timeouts. Protection states remain unknown when Windows providers cannot supply a reading.

Optional whisper.cpp speech is downloaded only after native confirmation to the local application-data directory. The runtime and model hashes are pinned, extraction is staged, and no audio leaves the device. Windows.Media.Ocr handles local PDF/image/screen text extraction; extracted text is reviewed before any AI sharing. The optional speech runtime/model is not part of the installer.
