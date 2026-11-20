# Implementation plan

The revised Windows-only specification supersedes the original cloud/mobile plan. Keep the initial tooling and reference asset. No app code, mobile code, cloud services, or personal data existed at revision time. Build one Tauri 2/Rust/SQLite application with a vanilla TypeScript interface. No separate production server, deployments, or commits.

1. Implement validated UUID/timestamped records, migrations, SQLite storage, backup/restore and settings.
2. Implement the reference-inspired responsive shell and real CRUD for tasks, memories, projects, events, conversations, settings and activity.
3. Implement strictly allowlisted Windows actions, genuine system measurements, project grants/read-only analysis and optional local inference/voice adapters.
4. Integrate local reminders/briefings, speech, optional inference, Google OAuth and weather with graceful offline/cache states.
5. Test boundary conditions and actual UI workflows; build the Windows installer; review the source changes and report native, credential and hardware limitations.

Acceptance: immediate local writes, no sample stats, no arbitrary shell execution, no silent data loss, no cloud requirement for local work, honest unavailable states. External integrations, voice models and native installer are verified only with the required credentials/toolchain/hardware. Future mobile boundaries are documentation only.
