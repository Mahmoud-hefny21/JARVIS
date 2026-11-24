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
| Owner's film wake-up sound (5.784 s trim of the supplied MP3) | ✅ | Live: sound starts 0.42 s after "wake up", greeting 1.32 s after the sound; kept on this PC only; Cinematic / Instant / Silent modes |
| Wake word comes back after every conversation (watchdog) | ✅ | Live-tested after the 60 s attention window |
| "Wake up, JARVIS" spoken as one phrase from cold | 🟡 | The Windows recognizer often hears only "JARVIS"; "JARVIS… wake up" works reliably |
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

## Ideas backlog (reorganised 2026-11-22, nothing started)

Mahmoud picks what gets built. Free tools only. Numbers are the original idea numbers, kept for reference; 153 was dropped (JARVIS always says "sir"). Where two ideas were the same, they are merged on one line.
Detailed write-up for 53–152: https://claude.ai/artifact/DsrEcJDwdhoAqpD8SRU86s

**Suggested first batches:** Workshop: 253, 258, 259, 261 · Prayer: 278, 279, 281, 283 · Quick wins: 60, 61, 114, 123, 149

### 1. Voice and conversation
- 2 Better Egyptian Arabic and Franco recognition (local Whisper)
- 19 Wake-word reliability · 165 ignore other people's voices · 41 voice lock for sensitive commands
- 50 Follow-up listening after an answer · 51 interrupt by saying "JARVIS"
- 53 Several commands in one sentence · 54 corrections ("no, I meant…") · 55 understands "it/that"
- 59 Mixed English/Franco/Arabic in one sentence · 58 Egyptian Arabic voice replies · 308 natural Masri everywhere
- 60 "Repeat that" · 61 "say it shorter" · 62 spelling mode
- 56 Whisper mode at night · 167 quieter at night · 57 + 252 voice speed and pitch
- 163 Noise suppression · 164 choose microphone · 166 start/stop listening tones · 52 optional webcam gestures

### 2. Workshop screen
- Core: 253 state label · 254 live spoken words · 255 speaking ring from real voice · 256 gold approval state · 257 dim when idle · 158 colour by state
- Pods: 258 click to expand · 259 choose your 6 pods · 260 drag to rearrange · 261 glow only when needed · 262 CPU/RAM sparklines · 193 add widgets by voice · 194 rearrange by voice
- Layouts: 263 focus · 264 night · 265 wide-screen · 266 compact · 267 split across two monitors · 195 morning/study/evening screens · 29 mini floating orb
- Bars: 268 status strip (time, Hijri, weather, battery, net) · 269 next prayer/event countdown · 270 command hints · 271 last 3 replies · 272 quick buttons · 160 clock/date
- Feel: 3 calm mode · 273 pods slide in once · 161 calm skippable startup · 274 optional UI sounds · 275 hover details
- Look: 28 + 277 themes with live preview · 159 custom background · 162 + 276 Arabic interface with proper RTL
- Progress: 196 goal progress bars · 197 today timeline

### 3. Display card ("show me…")
- 1 AI opens it by itself when seeing beats hearing · 5 + 71 pin cards / sticky notes
- 63 Two cards side by side · 64 card history · 65 zoom/fullscreen · 66 send to another monitor · 67 save as image/PDF
- 68 Charts · 69 maps (OpenStreetMap) · 70 countdown cards · 72 read the card aloud · 140 sources on cards · 139 answer confidence

### 4. Personality
- 18 Varied daily greetings · 154 notices mood from tone · 155 polite small talk · 156 celebrates wins
- 39 + 157 occasional dry wit (original, toggleable) · 247 easter egg · 40 voice games and trivia

### 5. Productivity and planning
- 7 Morning briefing card · 74 plan my day · 75 end-of-day review · 76 weekly goals · 38 "what did I miss?"
- 10 Spoken reminders · 77 priorities · 78 recurring tasks by voice · 79 deadline warnings
- 11 Quick voice notes · 81 meeting notes by dictation · 82 clipboard history
- 16 + 73 focus mode / Pomodoro with stats · 80 time per project · 22 routines ("good night", "study time")

### 6. Study and learning
- 15 Lecture PDF helper · 87 lecture recording + summary · 91 quiz from notes · 83 flashcards · 84 exam study plan
- 85 Explain it simply · 89 dictionary · 88 citations · 86 GPA calculator · 92 deadlines from university emails · 181 course progress
- 178 Daily language lessons · 90 pronunciation practice · 179 word of the day · 180 daily fact · 182 coding challenges

### 7. Programming
- 95 Open project by name · 97 dev servers · 93 run tests · 98 free a stuck port
- 94 Git by voice · 219 commit messages · 220 pre-push review · 102 "what changed today"
- 17 + 96 explain error on screen · 218 explain selected code · 201 write code into VS Code
- 101 Code search · 99 snippets · 221 local bug list · 222 library docs by voice · 100 GitHub notifications

### 8. Windows and PC control
- 13 Media control · 106 brightness · 107 dark/light mode · 108 Bluetooth/Wi-Fi
- 103 Window layouts · 104 screenshot + annotate · 105 screen recording · 112 close frozen app
- 14 File finder · 203 sort Downloads · 204 duplicates · 205 smart renaming · 206 tidy desktop · 207 archive old files
- 109 Empty recycle bin · 110 clean temp files · 44 weekly PC health · 111 app usage stats
- 45 Battery coach · 46 internet speed check

### 9. Info, news and media
- 4 Live info cards · 36 morning news digest · 117 weather alerts
- 113 Egypt national team only: match-day alert, live score kept with him, goal card on screen (he does not follow other football) · 114 EGP exchange rates · 115 gold · 116 crypto
- 48 Summarize a web page · 49 summarize a YouTube video · 118 movie picks
- 188 Mood music · 122 your music by voice · 121 radio · 119 podcasts · 191 ambient sounds · 192 bedtime reading
- 189 Movie night mode · 190 game suggestion

### 10. Faith (Islam)
- Prayer: 31 + 283 prayer times (Egyptian survey-authority method) · 278 adhan + pause media · 279 reminder before prayer · 281 quiet after adhan · 280 private prayer log · 282 Jumu'ah + Al-Kahf · 217 nearest mosque · 231 Qibla
- Quran: 120 recitation player · 284 verse + tafsir on screen · 288 search by meaning · 229 + 287 reading plan / khatma · 285 memorisation check · 286 revision schedule
- Ramadan and occasions: 227 + 289 Ramadan mode (imsak/iftar, suhoor alarm) · 290 taraweeh · 291 last ten nights · 292 Eid and Zakat Al-Fitr · 293 Arafah/Ashura/Mon–Thu fasting · 294 Hajj/Umrah guide
- Zakat and charity: 295 zakat calculator · 296 sadaqah reminder · 297 charity tracker
- Remembrance and knowledge: 228 adhkar · 298 du'a for the moment · 232 daily verse/hadith · 300 99 Names · 301 Seerah stories · 299 Islam Q&A with sources · 302 Islamic greetings · 230 Hijri date

### 11. Life in Egypt
- 303 Egyptian holidays · 304 Fawry/InstaPay bill reminders (no payment access) · 307 load-shedding alerts
- 213 + 305 Cairo traffic · 306 metro/microbus guide · 216 nearby places

### 12. Health and home
- 30 Break reminders · 223 eye rest · 224 posture · 225 home workouts · 226 steps/sleep from phone · 125 water · 126 sleep schedule · 127 medicine
- 32 Habit tracker · 137 mood check-in · 136 daily journal
- 123 Alarms · 124 named timers · 128 recipe mode
- 34 + 241 shopping list / groceries · 239 household tasks · 240 plant watering · 238 bill due dates · 242 + 215 document and car expiry
- 214 "Don't forget" checklist · 132 trip planner · 129 gift ideas · 35 birthdays

### 13. Money
- 33 + 237 expense tracker with weekly chart · 233 monthly budget · 234 subscription reminders · 235 savings goal · 236 bill splitting

### 14. Communication and people
- 168 Emails by voice (confirm before sending) · 47 writing helper · 169 read WhatsApp Web · 12 WhatsApp message by voice
- 209 Reply suggestions · 26 + 210 translate · 170 meeting summaries
- 208 People to reconnect with · 211 promise reminders · 212 holiday greetings · 130 contacts book

### 15. Phone and smart home
- 171 Telegram bot · 172 morning summary to Telegram · 173 phone web panel · 174 remote control from phone · 175 phone alerts
- 24 Phone link (KDE Connect) · 176 share files · 177 "where's my phone" · 23 smart home (Tuya/Home Assistant)

### 16. AI and memory
- 6 Resume-work memory · 37 learns your routine · 202 daily tip · 246 suggests new commands · 245 top-command tips
- 133 "What do you know about me" · 134 "forget that" · 135 memory search
- 25 Knowledge base from a folder · 198 Q&A over a document · 199 compare options · 200 "think with me" · 27 math/code helper
- 138 Best free model per task · 141 teach new commands · 142 plugins

### 17. Security and privacy
- 43 Private mode · 185 PIN for sensitive actions · 184 auto-lock when away · 183 optional webcam photo on intrusion
- 42 Security alerts · 187 suspicious-link warnings · 186 password-strength check · 131 encrypted document vault

### 18. Reliability and upkeep
- 8 + 145 startup health check · 21 + 151 safe auto-updates · 143 restart after crash · 144 error log · 243 "how are you, JARVIS?"
- 20 Weekly auto-backup · 146 settings backup · 147 setup wizard · 152 "what's new" card · 244 weekly "what I did for you"
- 148 + 149 game mode / lower use while gaming · 150 low-RAM mode
- 248 Larger text · 249 high contrast · 250 keyboard control · 251 spoken screen descriptions
- 9 Commit the 2026-11-22 work

## Master plan (2026-11-22)

Full plan: https://claude.ai/artifact/Qvh6CP63srAUYgvax2hQBA
0 Make it safe → 1 Understands you (English, Arabic, Franco) → 2 Fast and smart brain (Groq, ChatGPT backup) → 3 Calm, clear Workshop → 4 Faith and Egypt → 5 Daily life → 6 Study and programming → 7 PC control, info and money → 8 Phone, people and home → 9 Security, memory and personality → 10 Polish and extras.

## Speed and intelligence goal (2026-11-22)

Mahmoud's top goal: JARVIS smart, always learning from him, and answering in under one second.
Measured: Groq chat 1.5–1.7 s · fast Groq model 0.4 s · phone voice 4.1 s · phone speech recognition 2.3 s · local commands ~0.1 s. A Franco question was answered in English.
Speed: persistent voice (4.1 → ~1 s) · speak the first sentence while the answer streams · fast model for simple chat · commands never wait for the AI · smaller phone audio.
Intelligence: reply in his language (Masri for Arabic/Franco) · his profile with every question · trilingual dictionary + learning from rephrasing · AI performs actions itself · stop "ACTION:" text becoming task titles · conversation follow-ups.
Recommended first: persistent voice + Masri replies.
