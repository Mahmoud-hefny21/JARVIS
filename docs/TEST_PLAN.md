# Focused verification plan

| Risk | Check | Isolation |
|---|---|---|
| Invalid records/untrusted text | Zod tests, Rust validation, UI injection-as-text check | Synthetic records |
| Data loss/restart | CRUD/reload; SQLite reopen; backup/restore/integrity | UUID temporary database |
| Permission escape | Reject traversal, sensitive paths and external symlinks | Temporary authorized folder |
| Unsafe execution | Exact deterministic intent tests; native allowlist review; confirmation dialogs | Never trigger real power actions |
| Missed/duplicate reminders | Quiet hours/recurrence tests; native scheduler restart recovery | Synthetic reminders only |
| UI regressions | All 12 pages; task/memory/profile/chat offline workflows; keyboard and responsive screenshots | Separate browser test contexts |
| Performance | Production asset size; native database timing; startup/idle process measurements when native build succeeds | Clearly distinguish measured surfaces |
| Integrations | Credential-free failure/cache behavior; live OAuth/provider/speech checks only with available setup | Never send mail during unattended tests |

Commands: `bun run test`, `bun run test:ui`, `bun run test:native`, `bun run build`, `bun run build:windows`. Tests never reset the real app-data database. Hardware, microphone quality, speech language packs, Google credentials and AI providers must be marked BLOCKED or NOT TESTED when unavailable. Browser development-store tests do not verify native SQLite or Windows IPC.
