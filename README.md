# J.A.R.V.I.S.

A Windows-only, local-first personal assistant built with Tauri 2, Rust, vanilla TypeScript/CSS/SVG and SQLite. Core local workflows and the Windows build are verified; credential-dependent integrations and human voice testing remain. See [verification results](FINAL_VERIFICATION_REPORT.md) and [progress](PROJECT_PROGRESS.md). No production backend, mobile application, cloud database or synchronization service is included.

## Windows build

The unsigned per-user installer is copied to `artifacts/JARVIS_0.1.0_x64-setup.exe`; checksums are in `artifacts/SHA256SUMS.txt`. The executable and dependency notices are also copied there. WebView2 must be available (the NSIS installer may offer to obtain it). Installation, upgrade and uninstall have not been exercised automatically. No code-signing certificate is configured.

Validate the final release with `node scripts/verify-artifacts.mjs`. It checks PE structure, the NSIS archive length/CRC, exact build-output equality, all five artifact hashes and the verification-report table without executing the installer. After a new build and copying the final outputs, `node scripts/verify-artifacts.mjs --write` regenerates matching checksums, report table and integrity evidence; it first rejects mismatched or structurally invalid copies. The same version/filename may have been used for earlier development builds, so verify the exact uploaded/downloaded file's SHA-256.

## Development

Requires Bun 1.3.14+, Node.js 24.13+ for the current test/build tooling, Rust stable MSVC, Visual C++ Desktop Build Tools, and WebView2. Node/Bun are development tools; the installed app does not require a separate server.

```powershell
bun install --frozen-lockfile
bun run dev
bun run test
bun run test:ui
bun run test:native
bun run build
bun run build:windows
```

`dev` launches the real Tauri app with Vite. `dev:ui` is an isolated browser preview with IndexedDB development storage; Windows actions explicitly require the native app. `build` checks TypeScript and creates frontend assets. `build:windows` builds the Windows executable and per-user NSIS installer under `.build/target/release/bundle/nsis`. If PowerShell blocks the `bun.ps1` shim, use `bun.cmd` in these commands.

On this machine, C: ran out of space during the first Rust build. The task-installed toolchain/cache were moved to `.build/rustup` and `.build/cargo` on D:. The launcher detects that local configuration, keeps target/temp files under `.build`, and does not modify global environment variables. If you move/delete `.build`, reinstall or reconfigure Rust first. On other machines the launcher uses the normal Rust installation.

## Use

- The overview fits all eight panels in the window without scrolling. Wide, narrow and short landscape layouts adapt automatically; very small windows scale the compact overview to fit. Use the fullscreen icon immediately after Notifications to expand the overview and hide the sidebar. Press Escape or use that icon again to restore the window and sidebar. Other pages keep their normal scrolling.
- Tasks, reminders, appointments, memories, drafts and profile settings save locally. Try `remember I prefer TypeScript`, `recall TypeScript`, `add task review the release`, or `daily briefing` in the command bar. JARVIS reads by default; changes requested through the assistant require a native Windows approval dialog.
- Authorize project folders using the native picker. Reading/search is the default. A Code Assistant source edit shows a bounded diff, checks the file revision, preserves an encrypted recovery copy, and waits for native approval before writing. Sensitive/generated files and path escapes are excluded. Progress is derived from linked tasks, never invented percentages.
- System and security panels show native measurements or explicit unknown/unavailable states. Power operations require native confirmation.
- Configure optional AI, Google desktop OAuth and weather in Settings. An online AI endpoint requires an explicit data-sharing preference. Source upload requires confirmation. Email sending requires native review/confirmation. Credentials use Windows DPAPI.
- Wake-word detection uses the installed Windows recognizer and accepts `JARVIS` alone. An optional offline Whisper engine can be downloaded from Settings after a native confirmation (about 68.6 MB; checksums and MIT notices are included). It transcribes a bounded on-demand recording locally; SAPI remains the fallback. No speech model is bundled in the installer and no actor-voice clone is included. Microphone/language availability and quality require verification on your PC.
- Reminders and automatic backups need Windows and JARVIS running; closing the window keeps the app in its tray by default. Use the tray's Quit action to exit. Nothing runs when the PC is fully off.

SQLite lives in Tauri's Windows application-data directory, normally `%APPDATA%/com.jarvis.personal/`. Backups are DPAPI-encrypted for the same Windows account. The operational SQLite records themselves rely on Windows filesystem/account protections; use full-disk encryption for stronger at-rest protection. JSON exports contain personal data in plaintext. Restore preserves the current state in a pre-restore backup.

See [architecture](docs/ARCHITECTURE.md), [component evaluation](docs/COMPONENTS.md), [test plan](docs/TEST_PLAN.md), and [future mobile boundaries](docs/FUTURE_MOBILE.md). No credentials, private repositories, real mail sends, or disruptive power actions are used in unattended tests.

## Additional verification

`node scripts/native-smoke.mjs` exercises a previously built debug app with an isolated database. `node scripts/windows-benchmark.mjs` measures the previously built release app and single-instance behavior. `bun run benchmark` measures assets and synthetic SQLite operations. The PowerShell speech probes in `scripts/` compile the production bridge and recognize generated audio without opening the microphone. These are development checks, not production services.

`node scripts/overview-smoke.mjs` verifies actual native fullscreen, Escape/button exits, sidebar restoration and no-scroll overview panels in a previously built release, using a separate UUID profile. Close any normal JARVIS instance first so the single-instance guard can open that test profile.

Native QA scripts set process-local `JARVIS_ENABLE_TEST_PROFILE=1` and `JARVIS_QA_DATA_DIR` to a UUID directory beneath `.build/qa`; release builds require the explicit enable flag to honor this override. Keep these variables unset for normal use. Do not point a test profile at your real application-data directory.
