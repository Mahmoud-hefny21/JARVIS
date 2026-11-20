# Manual verification - direct-execution release

Use scratch records, a disposable authorized project and a test Chrome window. Installation is not performed by the automated checks.

1. Enable voice deliberately and say **JARVIS** alone. Check one wake-up, audible TTS, command recognition, interruption and recovery after sleep or microphone changes. Synthetic WAV tests do not establish microphone/audio quality.
2. Say ?Show me Chrome?, ?Put it on monitor two?, ?Move it to monitor one?, ?Minimize it? and ?Restore it?. Routine explicit commands should not prompt. Check the actual window, taskbar clearance and text sizing. Repeat in both directions, then test unplug/reconnect and single/three-monitor hardware if available.
3. Select a disposable authorized source file; say ?Show me that file?, then ?Copy this file to test-copy.ts?. Verify the new bytes. An existing destination, excluded path or revoked grant must be rejected. Test contextual corrections with two scratch tasks and confirm the selected item.
4. Create a scratch task/memory and toggle completion or low-power mode: no repeated approval dialogs. Attempt a scratch content replacement or deletion and cancel its readable confirmation; verify unchanged data. Check that independent suggestions do not execute without review. Do not test with valuable files or real sensitive sends.
5. Test your preferred spoken English. Egyptian Arabic speech requires a configured supporting engine; this machine currently has en-US SAPI only. Live Google/model accounts require your authentication and consent.
6. Confirm fullscreen/Escape, tray Open and startup positioning on each display. Actual tray clicks, live wake, display reconnect and installer lifecycle need human testing. No Windows startup setting or monitoring was enabled automatically.

Automated source suites: JavaScript 28 passed; Rust 26 passed plus one deliberately ignored benchmark; UI nine passed with clean teardown. Exact release-native results and installer hash are in FINAL_VERIFICATION_REPORT.md and PROJECT_PROGRESS.md.

Installer: D:\JARVIS\artifacts\JARVIS_0.1.0_x64-setup.exe. Compare its SHA-256 against artifacts/SHA256SUMS.txt before distribution.

Final installer: 2,753,305 bytes; SHA-256 6b4ee90a41c4ed55f4f4fb18440eacf9d6375dc40983786a155ec583fc754d6f. Unsigned; not installed by these tests.
