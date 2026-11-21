# JARVIS requirements tracker

Everything Mahmoud has asked for, grouped by area, with honest status.
Sources: the "Autonomous Personal AI Operating Assistant" prompt, the "Cinematic Stark-Style" and
"Ultimate Stark-Inspired" master prompts, the "Ultimate Master Specification" (business / iPhone / 24/7),
and the chat requests in between.

Status key: ✅ done and tested · 🟡 partial · ⬜ not started · ⛔ blocked or needs Mahmoud (account, money, hardware)

Last updated: 2026-11-21 (commit after `428e7cf`).

## 1. Interface and cinematic look

| Requirement | Status | Notes |
|---|---|---|
| Workshop HUD is the default home screen | ✅ | Opens maximized; classic dashboard one click away |
| Fullscreen shows the Workshop, not the old overview | ✅ | Also wake word and "move JARVIS to monitor N" |
| Every page in the Workshop design language | ✅ | Glass pods, cut corners, brackets, lit sidebar |
| Central AI core: rings, segments, legend, radar, particles, parallax | ✅ | Original artwork, no movie assets |
| Core states: idle, listening, processing, speaking, executing, error, offline | ✅ | From real app events |
| Core states: waiting for approval, completed | ⬜ | |
| Listening waveform from real microphone levels | ✅ | |
| Speaking visual from real audio output levels | ⬜ | No output-level feed yet; speaking pulses instead |
| Six live pods: Next, System gauges, Activity, Health, Tasks, Comms | ✅ | Real data only, refreshed in place |
| Pods for memory context, automation status, running apps list | 🟡 | Running dev tools only |
| Boot animation (dial draws in, pods materialise) | ✅ | Once per session, replays on cinematic wake |
| Lighter graphics under heavy CPU load, paused when minimized | ✅ | |
| Tidy screen (less clutter around the command bar) | ✅ | |

## 2. Wake-up, sound and music

| Requirement | Status | Notes |
|---|---|---|
| Wake phrases: "JARVIS", "Wake up, JARVIS", "JARVIS, wake up", "Good morning, JARVIS", "Are you there" | ✅ | "Wake up, JARVIS" live-tested |
| Full cinematic wake (sound → core → boot → greeting → listening) on "Wake up / Good morning / Are you there, JARVIS" (plain "JARVIS" is always instant) | ✅ | Live-tested: greeting spoken, then listening |
| Instant mode when already awake | ✅ | |
| Import own MP3/WAV/OGG/M4A: activation, wake-up music, notification | ✅ | Stored locally in IndexedDB; browser-tested |
| Volumes, fade in/out, music ducks while JARVIS speaks, silent mode | 🟡 | Implemented; ducking not tested by ear |
| Original synthesized activation tone when no file is set | ✅ | No movie audio downloaded or bundled |
| Background ambience slot | ⬜ | |

## 3. Voice and conversation

| Requirement | Status | Notes |
|---|---|---|
| Natural British voice (Ryan, neural) | ✅ | Windows natural voice |
| Sounds human: no filler sign-offs, varied openings, few "sir"s | ✅ | Persona rules |
| Address the owner as "sir" (Mahmoud's request, 2026-11-22) | ✅ | Name stored as "Sir"; AI told not to use the first name |
| Interrupt JARVIS by talking over it | 🟡 | Opt-in in Settings (headphones). On laptop speakers JARVIS interrupted itself in live tests, so it is off by default; saying "JARVIS" interrupts on speakers |
| "Sir?" when called by name with nothing after | ✅ | Live-tested |
| 60-second attention window, then idle until wake word | ✅ | |
| Egyptian Arabic understanding and replies | 🟡 | AI replies in Arabic; Arabic speech recognition depends on Whisper/Groq |
| Fast replies (Groq, pooled connection, warmed on wake) | ✅ | |
| Streaming text-to-speech | 🟡 | First sentence is spoken early |
| Recognise only Mahmoud's voice (enrollment, verification, delete) | ⬜ | Needs a local speaker-embedding model |

## 4. Intelligence and actions

| Requirement | Status | Notes |
|---|---|---|
| Never invents tasks/events or claims actions it didn't do | ✅ | Live data in context + truth rules |
| Understands loose speech and runs the matching command | ✅ | AI → `ACTION:` → command |
| Tasks by voice: add with due time, delete, complete | ✅ | Live-tested |
| Move Chrome / VS Code between monitors, focus, minimize | ✅ | Live-tested |
| "Show me tasks / next / mail / weather / system status" brings the pod forward | ✅ | |
| Open any website or installed app by name | ✅ | 25+ sites by name, any other via the AI's exact address; WhatsApp Web and YouTube live-tested; Start-menu apps by name |
| Control inside arbitrary apps (click, type) | 🟡 | Chrome page read/click/fill only |
| Franco and Arabic command words (efta7, eftahly, افتح, شغل, emsa7, fakarny…) | ✅ | Unit-tested; AI also told to read Franco |
| "Mute" silences JARVIS immediately | ✅ | Live-tested; also drops queued parts of the reply |
| Multi-step agent: plan → permissions → execute → verify → report | ⬜ | |
| "What am I working on?" / "ana kont ba3mel eh" from the active window | ✅ | Live-tested ("You were last in Chrome…"); titles kept in memory only; private windows hidden |
| Review code open in VS Code | 🟡 | Read-only code assistant on authorized projects |
| Screen awareness on demand | 🟡 | "Read this / what's on my screen" with approval |
| Persistent screen awareness with indicator and pause | ⬜ | |
| Documents and spreadsheets | ⬜ | |
| Media controls | ⬜ | |
| Autonomy levels 1–4 | ⬜ | |
| Owner Control Center in Settings | 🟡 | Sound & wake-up section added; rest pending |

## 5. Memory and personalization

| Requirement | Status | Notes |
|---|---|---|
| Remembers stated preferences automatically | ✅ | "I prefer / I love / call me" |
| Memory inspect, edit, delete | ✅ | Personal Memory page |
| Memory categories (identity, project, workflow, episodic, business) | ⬜ | |
| Semantic search | 🟡 | Keyword/FTS search today |
| Workflow suggestions from habits (ask before enabling) | ⬜ | |

## 6. Proactive assistant

| Requirement | Status | Notes |
|---|---|---|
| Spoken heads-ups before tasks/events and when due | ✅ | Live-tested |
| Own reminders still come through in quiet hours | ✅ | |
| Low battery / sustained high CPU warnings | ✅ | |
| Daily greeting with weather, next event, tasks | ✅ | |
| Morning and evening briefings with project and business data | 🟡 | Briefing exists; no business data yet |
| Owner's film wake-up sound (5.784 s trim of the supplied MP3) | ✅ | Kept on this PC only, never in the repo; Cinematic / Instant / Silent modes |
| Build-failed / website-down alerts | ⬜ | Needs project and website monitoring |

## 7. Security

| Requirement | Status | Notes |
|---|---|---|
| Approval for sensitive actions; audit history | ✅ | Existing approval broker |
| Own-task delete without popup; voice actions while another window has focus | ✅ | Scoped to mic-captured speech |
| Windows Hello for sensitive actions | ⬜ | |
| Voice match never grants privileges | ✅ | By design: no voice-based privileges exist |

## 8. iPhone, 24/7 and business (Ultimate Master Specification)

These need outside services, accounts or money, so each requires Mahmoud's decision first.

| Requirement | Status | Needs |
|---|---|---|
| Always-on remote coordinator (works when the PC is off) | ⛔ | Hosting choice and monthly cost approval |
| iPhone companion (PWA or native), pairing, push, approvals, emergency stop | ⛔ | Depends on the remote coordinator; Apple developer account for native |
| Push notifications to iPhone | ⛔ | Coordinator + Web Push / APNs |
| Urgent phone calls | ⛔ | Telephony provider (e.g. Twilio), verified number, per-call cost |
| GitHub / build / deployment / website monitoring | ⬜ | GitHub token and site list |
| Business Command Center (leads, pipeline, invoices) | ⬜ | |
| Client communication (WhatsApp, email) with approval modes | ⛔ | WhatsApp Business API account; Gmail already connected read-only |
| Negotiation engine within Mahmoud's pricing rules | ⬜ | Pricing rules from Mahmoud |
| Proposals, agreements, invoices from templates | ⬜ | Templates from Mahmoud |
| Payment and subscription tracking | ⛔ | Payment provider account |
| Operating cost estimate | ⬜ | Produced when hosting is chosen |

## Suggested order

1. Live-test the wake-up sequence and interruption on Mahmoud's PC.
2. Owner voice enrollment and verification.
3. "What am I working on?" and the multi-step agent.
4. Owner Control Center and autonomy levels.
5. Project and website monitoring (GitHub).
6. Decide hosting, then the remote coordinator and iPhone companion.
7. Business Command Center, then communication, proposals and payments.

## Standing rule

Everything must be free: no paid AI, APIs, hosting or telephony (Mahmoud, 2026-11-22). Items in section 8 that need paid services stay ⛔ unless a free option exists (e.g. WhatsApp Web instead of the WhatsApp Business API).
