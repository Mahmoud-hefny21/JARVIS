# JARVIS — Mahmoud's plan

Everything Mahmoud asked for and decided, in one place, with the order to build it.
Written 22 November 2026. Replaces the scattered notes from that day; the detailed backlog also lives in `docs/REQUIREMENTS_TRACKER.md`.

---

## 1. Who JARVIS is for

- **Owner:** Mahmoud (MIU student), Al-Rehab City, New Cairo, Egypt (≈ 30.06 N, 31.49 E). Muslim.
- **Talks in:** English, Egyptian Arabic, and Franco (Arabic in Latin letters with numbers: 2, 3, 5, 7, 8).
- **Devices:** Windows laptop (8 GB RAM, Intel UHD 620) where JARVIS lives; iPhone 13.
- **JARVIS always calls him "sir".**

## 2. Rules that apply to everything

| Rule | What it means |
|---|---|
| Free only | No paid AI, no paid APIs. Free tiers (Groq, Tailscale) and local tools only. Never add a payment card. |
| One screen | No extra dashboards or pages. One screen with the core; things he asks for appear on it, then go away. |
| Core look is locked | The core in `docs/design/core-reference.png` keeps its exact shape and animations: tick ring, segmented arcs, rotating text "J.A.R.V.I.S. · ALL SYSTEMS ONLINE · PERSONAL INTELLIGENCE · VOICE LINK ACTIVE · LOCAL CORE", glowing centre with "J.A.R.V.I.S.". Design work must not change it. |
| Smart, not robotic | No robot clichés (code rain, circuit lines, flashing, "SYSTEM ONLINE" spam). It looks smart by showing the right thing at the right time. |
| Calm | No busy or fast animation while he talks. No sparks. |
| Three languages | Every feature understands English, Arabic and Franco, with tests of real sentences. |
| Fast | Commands answer in under 0.1 s; JARVIS starts speaking in under 1 s. |
| Asks before risk | Sending, deleting, shutting down or paying always needs his confirmation. |
| Tested live | Every change is built, installed, launched and checked on the real app before it's called done. |
| Saved | Each finished step is committed to git. |
| Don't build without a go | When he says "save it", save it only. |
| 2 GB maximum | JARVIS and everything it stores (app, data, models, library, caches, backups) stay under 2 GB in total. |

## 3. Decisions he made

**The screen**
- One screen only; the core stays exactly as his screenshot.
- **Gold while working:** the gold fades in smoothly, the rings stay calm (no fast spinning), and one short line under the core says what JARVIS is doing ("Opening Chrome…", "Searching…"), then fades out.
- **Showing things:** a card slides in beside the core; the core moves aside and returns to the centre when the card closes.
- **Icon:** the core as a circle with no square around it (Windows). On iPhone it sits on near-black, because Apple always masks icons to a rounded square.

**The phone**
- iPhone; his **own JARVIS app**, not Telegram, not KDE Connect.
- Home-screen web app served by the laptop, reachable **only through Tailscale** (free, private, only his devices).
- Address: `https://desktop-i3p8ngr.tail2df69e.ts.net` (Tailscale HTTPS on; owner locked to his Tailscale login).
- It updates itself from the laptop; it never needs reinstalling (only the home-screen icon needs re-adding once, after an icon change).
- Same JARVIS as the laptop: he opens it, taps the core once (an iPhone rule), and just talks; it answers in JARVIS's voice and keeps listening.
- Same features as the laptop. Commands that act on apps ("open YouTube", "open VS Code") run on the laptop, where JARVIS lives.

**The brain**
- Groq free tier for fast answers and speech recognition, ChatGPT (Codex) as backup.
- Goal: smart in everything, always learning, under one second. "Learning" means JARVIS learns from him on his laptop (his phrasing in Franco and Arabic, corrections, preferences, routines); it does not mean training a new AI model, which needs huge hardware and money.
- Groq key: Windows Credential Manager `JARVIS-Groq`, imported into JARVIS's encrypted store. It was pasted in chat once; regenerate it at console.groq.com if the chat is ever shared.

**Content**
- Football: **Egypt national team only**. Match-day alert, live score kept with him, a goal card on screen. Nothing else about sports.
- Prayer times for Al-Rehab with the Egyptian General Authority of Survey method.

## 4. Where JARVIS is now (22 Nov 2026)

**Done and installed today (not committed yet):**
- Fixed: JARVIS not opening from the tray, and the startup crash ("Window bounds did not match").
- New round core icon; build now always re-embeds the icon.
- Removed the jagged "sparks"; calmer listening and speaking animation.
- "Show me…" display card (local data, Wikipedia with images, AI breakdowns), in all three languages.
- iPhone app over Tailscale: text, voice conversation, JARVIS's voice, cards, auto-update, owner-only.
- Groq key imported; conversation now runs on Groq.

**Measured speed:**

| What | Now | Target |
|---|---|---|
| Local commands | ~0.1 s | < 0.1 s |
| Conversation answer (Groq) | 1.5–1.7 s | starts speaking < 1 s |
| Fast Groq model (tested) | 0.4 s | used for simple chat |
| JARVIS voice on the phone | 4.1 s | ~1 s |
| Speech recognition (phone clip) | 2.3 s | ~1 s |

**Known problems:**
- A Franco question got an English answer (should be Masri).
- An AI reply was saved as a task title ("New print todayACTION: add task New print").
- `jarvis-reference.png` shows as deleted in git (not deleted by Claude); restore it if it wasn't meant to go.
- Phone notifications don't exist yet.

## 5. The plan

Each step: build → tests (including the sentence list) → install → try on laptop and iPhone → tell Mahmoud what to try → commit. Steps 0–3 are the foundation; after that the order can change whenever he wants.

### Step 0 — Make it safe (≈ 1 session)
- Commit all of the 22 November work.
- Startup self-test: a new build must launch and stay running before it replaces the old one; otherwise the old JARVIS stays.
- Restart automatically after a crash; simple error log.
- Fix the "ACTION:" text being saved as task titles, and clean the bad task.

**Done when:** everything is in git, and a broken test build is refused while JARVIS keeps running.

### Step 1 — Fast and speaks his language (≈ 2 sessions)
- Keep JARVIS's voice loaded all the time (phone voice 4.1 s → ~1 s).
- Speak the first sentence while the answer is still arriving, on laptop and phone.
- Fast Groq model for simple chat, the bigger one for hard questions.
- Reply in his language: Arabic or Franco → Masri in Arabic letters; English → English. Always "sir".
- His profile sent with every question (name, MIU, Al-Rehab, habits, likes).
- Smaller phone recordings before speech recognition.

**Done when:** a spoken question on the iPhone starts being answered in under 1 second, and a Franco question gets a Masri answer.

### Step 2 — Understands him every time, and learns (≈ 3–4 sessions)
- One shared dictionary for English, Arabic and Franco ("show / e3rdli / warini / وريني", "open / eftah / افتح", "I want / 3ayz / عايز").
- Clean-up before matching: Franco digits, Arabic letter variants, filler words.
- Tolerates spelling and speech mistakes.
- Learns from him: rephrasings and AI-resolved meanings are saved and answered instantly next time.
- Several commands in one sentence; corrections ("la2, ana a2sod…"); "it/that"; "repeat that"; "say it shorter"; follow-up questions.
- The AI can run JARVIS commands itself.
- A test list of at least 150 of his real sentences, run before every build.

**Done when:** all 150 sentences reach the right command in tests, and spoken Franco commands work on laptop and phone.

### Step 2b — JARVIS's own knowledge: Wikipedia, sites and apps (≈ 3 sessions)
Mahmoud wants JARVIS itself to be knowledgeable, not to look things up each time.
- **Its brain already knows a lot:** the AI it uses was trained on huge amounts of text, Wikipedia included.
- **Size limit: JARVIS in total stays under 2 GB.** Measured 22 Nov 2026: 195 MB (app 10 MB, data 95 MB incl. 77 MB offline speech model, display cache 91 MB).
- **Its own library (≈ 500 MB budget):** the summary sections of the most important Wikipedia articles (≈ 100,000 English + Arabic), compressed with JARVIS's own search index, so it answers instantly and offline with the source shown. Not the full Wikipedia (far over the limit).
- **Full article live from Wikipedia** when more detail is needed (no disk space used).
- **Space guard:** JARVIS tracks its own size, trims caches and old backups automatically, and never passes 2 GB.
- **Built-in catalogue of apps and sites** inside JARVIS: every installed app by name in English, Arabic and Franco; a large site directory by category (study, programming, Egyptian services like Fawry, banks, Vodafone/Orange/Etisalat/WE, MIU portal, government services, shopping, entertainment).
- **Keeps learning:** new apps and sites he uses are added to its own knowledge (with his OK), plus everything it learns about him.
- **Picks the right tool:** "I want to design a poster" or "convert a PDF to Word" → it knows which app or site does it and opens it.

**Done when:** offline, JARVIS answers factual questions from its own library with the source shown, and a list of requests in three languages each opens the right app or site.

### Step 3 — The one screen, finished (≈ 2 sessions)
- Gold "what I'm doing" line under the core.
- Cards beside the core, on laptop and phone.
- Card opens by itself when an answer is better seen than heard.
- Game mode and low-resource mode; mute and close-card quick actions.
- Compare against `docs/design/core-reference.png` before and after: the core must look and move the same.

**Done when:** the screen matches the reference, with the two agreed additions only.

### Step 4 — Phone complete (≈ 2 sessions)
- Notifications on the iPhone (reminders, prayer, Egypt goals, deadlines), even when the app is closed.
- Phone shows the same states as the laptop.
- Optional: phone control panel buttons (lock PC, mute, music).

**Done when:** a reminder set on the laptop pops up on the locked iPhone on time.

### Step 5 — Faith and Egypt (≈ 3–4 sessions)
Prayer times for Al-Rehab, reminder before, his chosen adhan with music paused, quiet afterwards, Jumu'ah and Al-Kahf · Qibla, Hijri date, adhkar, daily verse or hadith, 99 Names · Quran verse with tafsir, search by meaning, recitation, reading plan · Ramadan mode (iftar countdown, suhoor alarm, taraweeh, last ten nights), Eid and Zakat Al-Fitr · zakat calculator with today's gold price · dollar and gold rates · Egyptian holidays · Egypt national team matches.

**Done when:** prayer times match the official Egyptian timetable for Al-Rehab within a minute, and the adhan plays on time with JARVIS in the tray.

### Step 6 — Daily life (≈ 3 sessions)
Spoken reminders, alarms, named timers, recurring tasks, deadline warnings · quick voice notes, shopping list · morning briefing, end-of-day review · routines ("good night", "study time") · media control · water, sleep, medicine and break reminders.

### Step 7 — Study and programming (≈ 4 sessions)
Lecture PDF summaries, quizzes, flashcards, exam plans, dictionary, GPA, deadlines from university emails · open projects, run tests, dev servers, git by voice with confirmation, explain errors and code, commit messages.

**Smarter brain, 23 Nov 2026:** live web search (DuckDuckGo), his course files (DocumentsJARVIS Courses), exact calculator, second-opinion check (Qwen3), learns corrections without "remember".

### Step 8 — PC, information and money (≈ 3 sessions)
Brightness, dark mode, Bluetooth/Wi-Fi, window layouts, screenshots, file finder, tidy Downloads, clean temp files · news digest, weather alerts, page and YouTube summaries, music, radio, podcasts · expense tracker, budget, subscriptions, savings goal.

**Built 23 Nov 2026:** brightness, dark mode, Wi-Fi/Bluetooth, screenshots, file finder (opens files, never programs), tidy Downloads and clean temp (both ask first) · news headlines (Google News, EN/AR, any topic), page summaries, music/radio/podcasts via YouTube search · expenses by category, monthly budget with warnings, subscriptions with a reminder the day before, savings goals. **Not yet:** window layouts, weather alerts, YouTube transcripts (the summary uses what the page shows).

### Step 9 — People, safety and personality (≈ 3–4 sessions)
Email by voice, WhatsApp messages prepared for him to send, translation, contacts, birthdays, promises · private mode, PIN, voice lock, auto-lock, security alerts, document vault · "forget that", memory search, knowledge base from a folder, "think with me" · mood, small talk, celebrating wins, occasional wit.

### Step 10 — Extras
Everything else in the backlog below, picked as he likes.

## 6. What Mahmoud needs to provide

| When | What | Status |
|---|---|---|
| Step 1 | Free Groq key | Done |
| Step 4 | iPhone on iOS 16.4 or newer; allow notifications for the JARVIS app | — |
| Step 2b | Free some space on C (only 2.8 GB left) — for Windows' sake; JARVIS itself stays under 2 GB | — |
| Step 5 | Adhan recording he likes (MP3), added in Settings → Sounds | — |
| Step 5 | Free live-score key, if the chosen source needs one | — |
| Step 7 | Folder with lecture PDFs; OK to scan university emails for deadlines | — |
| Step 8 | Monthly budget amount | — |
| Always | Laptop on with Tailscale on, for the phone app | — |
| Always | Trying each step by voice and saying what feels wrong | — |

## 7. Saved links

- Master plan page: https://claude.ai/artifact/Qvh6CP63srAUYgvax2hQBA
- Ideas 53–152 in detail: https://claude.ai/artifact/DsrEcJDwdhoAqpD8SRU86s
- Mockups: https://claude.ai/artifact/3EfM9unrNXfFnsuCsUXYKo · https://claude.ai/artifact/LEj9VuFjyt415Rm8NH72k8 · https://claude.ai/artifact/61CkXqtfLES8ZUGwNxmKe2 (older multi-panel designs; the one-screen rule above overrides them)
- Core reference image: `docs/design/core-reference.png`

## 8. All ideas (backlog)

Numbers are the original idea numbers. 153 was dropped (JARVIS always says "sir"). Workshop items that add panels or pages only apply if shown on the one screen.

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
_Decided: his own iPhone app over Tailscale (section 3). Telegram (171, 172) and KDE Connect (24, 176, 177) were rejected; their features move into the iPhone app where possible._
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
