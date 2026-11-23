// Real sentences Mahmoud would say, in English, Egyptian Arabic and Franco, with the command JARVIS must run.
// [sentence, expected action, expected text (substring, optional)]. Reminders are checked separately for times.
export const COMMANDS = [
  // Open apps and sites
  ['open youtube', 'site', 'youtube.com'], ['eftah youtube', 'site', 'youtube.com'], ['eftahly youtube', 'site', 'youtube.com'], ['افتح يوتيوب', 'site', 'youtube.com'],
  ['افتحلي اليوتيوب', 'site', 'youtube.com'], ['jarvis eftah facebook', 'site', 'facebook.com'], ['open whatsapp web', 'site', 'whatsapp.com'], ['eftah whatsapp web', 'site', 'whatsapp.com'],
  ['open github', 'site', 'github.com'], ['eftah github', 'site', 'github.com'], ['open gmail', 'site', 'mail.google.com'], ['eftah el gmail', 'site', 'mail.google.com'],
  ['open chatgpt', 'site', 'chatgpt.com'], ['eftah netflix', 'site', 'netflix.com'], ['افتح نتفليكس', 'site', 'netflix.com'], ['open google maps', 'site', 'google.com'],
  ['open linkedin', 'site', 'linkedin.com'], ['eftah instagram', 'site', 'instagram.com'], ['open spotify', 'site', 'spotify.com'], ['sha8al spotify', 'site', 'spotify.com'],
  ['open canva', 'site', 'canva.com'], ['eftah canva', 'site', 'canva.com'], ['open google drive', 'site', 'drive.google.com'], ['open vercel', 'site', 'vercel.com'],
  ['eftahly el youtube', 'site', 'youtube.com'], ['efta7 youtube', 'site', 'youtube.com'], ['eftah tiktok', 'site', 'tiktok.com'], ['open reddit', 'site', 'reddit.com'],
  // Show things on screen
  ['show me my tasks', 'pod', 'tasks'], ['e3rdli el tasks', 'show'], ['warini el tasks', 'show'], ['وريني المهام', 'show'],
  ['show me the eiffel tower', 'show', 'eiffel tower'], ['e3rdli el ahram', 'show', 'ahram'], ['وريني برج خليفة', 'show', 'برج خليفة'], ['display the solar system', 'show', 'solar system'],
  ['pull up my notes', 'show', 'notes'], ['e3rdli el weather', 'show'], ['show me my schedule', 'pod', 'next'], ['e3redly el tasks', 'show'],
  ['warini el gaw', 'show'], ['اعرضلي الطقس', 'show'], ['show me my emails', 'pod', 'comms'], ['e3rdli el emails', 'show'],
  ['show me cairo tower', 'show', 'cairo tower'], ['e3rdli python', 'show', 'python'], ['let me see my projects', 'show', 'projects'], ['wareeni el system', 'show'],
  // Right tool for a goal
  ['3ayz a3mel poster', 'site', 'canva.com'], ['i want to design a poster', 'site', 'canva.com'], ['عايز اعمل بوستر', 'site', 'canva.com'], ['i want to convert pdf to word', 'site', 'ilovepdf.com'],
  ['3ayz a7awel pdf l word', 'site', 'ilovepdf.com'], ['i need to remove the background from a photo', 'site', 'remove.bg'], ['عايز اشيل الخلفية من صورة', 'site', 'remove.bg'], ['i want to compress image', 'site', 'tinypng.com'],
  ['i want to send a big file', 'site', 'wetransfer.com'], ['3ayz a3mel order akl', 'site', 'talabat.com'], ['عايز اطلب اكل', 'site', 'talabat.com'], ['i want to book a doctor', 'site', 'vezeeta.com'],
  ['3ayz adfa3 fatoora', 'site', 'fawry.com'], ['محتاج احول فلوس', 'site', 'ipn.eg'], ['i want to solve equation', 'site', 'wolframalpha.com'], ['i want to edit a video', 'site', 'capcut.com'],
  ['i need to paraphrase this paragraph', 'site', 'quillbot.com'], ['i want to find a job', 'site', 'wuzzuf.net'], ['i want to check grammar', 'site', 'grammarly.com'], ['3ayz a3mel cv', 'site', 'canva.com'],
  // Egyptian services and Arabic site names
  ['eftah fawry', 'site', 'fawry.com'], ['افتح فوري', 'site', 'fawry.com'], ['open instapay', 'site', 'ipn.eg'], ['افتح انستاباي', 'site', 'ipn.eg'], ['eftah vodafone', 'site', 'vodafone.com.eg'],
  ['افتح فودافون', 'site', 'vodafone.com.eg'], ['open talabat', 'site', 'talabat.com'], ['افتح طلبات', 'site', 'talabat.com'], ['eftah el gam3a', 'site', 'miuegypt.edu.eg'], ['open miu website', 'site', 'miuegypt.edu.eg'],
  ['افتح البنك الاهلي', 'site', 'nbe.com.eg'], ['eftah filgoal', 'site', 'filgoal.com'], ['افتح القرآن', 'site', 'quran.com'], ['open quran', 'site', 'quran.com'], ['افتح انستجرام', 'site', 'instagram.com'],
  ['افتح واتساب', 'site', 'whatsapp.com'], ['eftah amazon', 'site', 'amazon.eg'], ['open jumia', 'site', 'jumia.com.eg'], ['افتح جوميا', 'site', 'jumia.com.eg'], ['eftah wuzzuf', 'site', 'wuzzuf.net'],
  // Spelling slips in Franco verbs
  ['eftaah youtube', 'site', 'youtube.com'], ['e3rdly el tasks', 'show'], ['wariny el tasks', 'show'],
  // Prayer, Qibla, Hijri date
  ['prayer times', 'prayer'], ['mawa3eed el salah', 'prayer'], ['مواعيد الصلاة', 'prayer'], ['when is the next prayer', 'prayer'], ['الصلاة الجاية امتى', 'prayer'], ['el sala el gaya emta', 'prayer'],
  ['qibla', 'qibla'], ['el qebla fen', 'qibla'], ['القبلة فين', 'qibla'], ['where is the qibla', 'qibla'],
  ['hijri date', 'hijri'], ['التاريخ الهجري', 'hijri'], ['el tarikh el hegry', 'hijri'],
  // Rates, gold, zakat, Quran, Egypt national team
  ['dollar rate', 'rates', 'fx'], ['el dollar b kam', 'rates', 'fx'], ['الدولار بكام', 'rates', 'fx'], ['سعر الدولار', 'rates', 'fx'], ['exchange rates', 'rates', 'fx'],
  ['gold price', 'rates', 'gold'], ['el dahab b kam', 'rates', 'gold'], ['الدهب بكام', 'rates', 'gold'], ['سعر الذهب', 'rates', 'gold'],
  ['zakat', 'zakat'], ['zakat 200000', 'zakat', '200000'], ['zakat on 150,000 pounds', 'zakat', '150000'], ['زكاة ٢٠٠٠٠٠', 'zakat', '200000'],
  ['quran 94:5', 'quran', '94:5'], ['ayah 2 255', 'quran', '2:255'], ['ayat el kursi', 'quran', '2:255'], ['آية الكرسي', 'quran', '2:255'],
  ['egypt match', 'football'], ['match masr emta', 'football'], ['ماتش مصر امتى', 'football'], ['el montakhab kam kam', 'football'], ['when is egypt next match', 'football'],
  ['holidays', 'occasions'], ['ramadan emta', 'occasions'], ['رمضان امتى', 'occasions'], ['el 3eed emta', 'occasions'], ['العيد امتى', 'occasions'], ['when is eid al adha', 'occasions'], ['الاجازات', 'occasions'], ['شم النسيم امتى', 'occasions'],
  // Daily life: timers, alarms, media, volume, notes, shopping list, routines
  ['pasta timer 10 minutes', 'timer', '600'], ['e3mel timer 5 da2aye2', 'timer', '300'], ['اعمل تايمر ١٠ دقايق', 'timer', '600'], ['set a timer for 30 seconds', 'timer', '30'],
  ['sa7eeny 7', 'alarm', '7'], ['صحيني الساعة سبعة الصبح', 'alarm', 'سبعة'], ['wake me up at 6:30', 'alarm', '6:30'], ['cancel the timer', 'timer-cancel'], ['الغي المنبه', 'timer-cancel'],
  ['pause', 'media', 'playpause'], ['wa22af el aghnya', 'media', 'playpause'], ['next song', 'media', 'next'], ['اللي بعده', 'media', 'next'], ['previous song', 'media', 'previous'],
  ['volume 30', 'volume', '30'], ['وطي الصوت', 'volume', 'down'], ['3ally el sot', 'volume', 'up'], ['mute the pc', 'volume', 'mute'],
  ['sagel en el locker code 42', 'remember', 'locker code 42'], ['note that the wifi password is on the router', 'remember', 'wifi password'], ['اكتب ان الاجتماع اتأجل', 'remember', 'الاجتماع'],
  ['zawed beyd 3al list', 'shopping-add', 'beyd'], ['add milk to my shopping list', 'shopping-add', 'milk'], ['ضيف عيش للمشتريات', 'shopping-add', 'عيش'], ['show my shopping list', 'shopping-show'], ['clear shopping list', 'shopping-clear'],
  ['good night', 'goodnight'], ['tesba7 3ala 5eer', 'goodnight'], ['تصبح على خير', 'goodnight'], ['study time', 'focus', '45'], ['focus 25 minutes', 'focus', '25'], ['stop focus', 'focus-end'],
  // Study
  ['summarize this pdf', 'study-summary'], ['lakhas el pdf', 'study-summary'], ['لخص الملف', 'study-summary'], ['لخصلي المحاضرة', 'study-summary'],
  ['quiz me', 'study-quiz'], ['quiz me on recursion', 'study-quiz', 'recursion'], ['امتحني', 'study-quiz'], ['flashcards on networking', 'study-cards', 'networking'], ['make flashcards', 'study-cards'],
  ['what does ubiquitous mean', 'define', 'ubiquitous'], ['ya3ni eh algorithm', 'define', 'algorithm'], ['يعني ايه خوارزمية', 'define', 'خوارزمية'], ['define entropy', 'define', 'entropy'],
  ['gpa A 3, B+ 3, A- 2', 'gpa', 'A 3'], ['calculate my gpa A 3 B 4', 'gpa', 'A 3'],
  ['my math exam is on January 10', 'exam', 'math'], ['networks final is on next sunday', 'exam', 'networks'], ['امتحان الفيزيا يوم الخميس', 'exam', 'الفيزيا'],
  // Privacy and memory
  ['go private', 'private-on'], ['وضع خاص', 'private-on'], ['private off', 'private-off'], ['forget that', 'forget-last'], ['ensa da', 'forget-last'], ['انسى ده', 'forget-last'],
  ['what do you know about me', 'about-me'], ['انت تعرف عني ايه', 'about-me'], ['enta 3aref eh 3anny', 'about-me'],
  // People, translation, git
  ['save ahmed number 01001234567', 'contact-save', '01001234567'], ['sagel raqam ahmed 01001234567', 'contact-save', 'ahmed'], ['سجل رقم احمد ٠١٠٠١٢٣٤٥٦٧', 'contact-save', '01001234567'],
  ['what is ahmed number', 'contact-find', 'ahmed'], ['raqam ahmed eh', 'contact-find', 'ahmed'], ['رقم احمد ايه', 'contact-find', 'احمد'],
  ['send ahmed I am on my way', 'whatsapp', 'on my way'], ['ab3at le ahmed en ana gay', 'whatsapp', 'ana gay'], ['ابعت لاحمد اني جاي', 'whatsapp', 'أنا جاي'], ['text mom: running late', 'whatsapp', 'running late'],
  ["ahmed's birthday is march 5", 'birthday', 'march 5'], ['3eed milad ahmed 5 march', 'birthday', 'ahmed'], ['عيد ميلاد احمد ٥ مارس', 'birthday', 'احمد'],
  ['translate how are you to arabic', 'translate', 'how are you'], ['targem el gomla di l english', 'translate', 'english'], ['ترجم صباح الخير', 'translate', 'صباح الخير'],
  ['git status', 'git'], ['what changed today in jarvis', 'git', 'jarvis'], ['i am iron man', 'easter-egg'],
  // Close the card
  ['Remove your day from the screen.', 'show-close'], ['clear the screen', 'show-close'], ['shil da', 'show-close'], ['شيل ده', 'show-close'], ['e2felo', 'show-close'], ['take that off the screen', 'show-close'],
  ['close the display', 'show-close'], ['e2fel el screen', 'show-close'], ['hide it', 'show-close'], ['اقفل الشاشة', 'show-close'],
  // Tasks
  ['add task buy bread', 'task', 'buy bread'], ['7ot task ashtry 3esh', 'task', 'ashtry 3esh'], ['zawed task call ahmed', 'task', 'call ahmed'], ['ضيف مهمة اذاكر', 'task', 'اذاكر'],
  ['اعمل تاسك اكلم احمد', 'task', 'اكلم احمد'], ['e3mel task study networks', 'task', 'study networks'], ['remind me to drink water', 'task', 'drink water'], ['fakkarny ashrab maya', 'task', 'ashrab maya'],
  ['fakarny en ashrab maya', 'task', 'ashrab maya'], ['فكرني اشرب مية', 'task', 'اشرب مية'], ['ذكرني اكلم ماما', 'task', 'اكلم ماما'], ['fakrny b el gym', 'task', 'gym'],
  ['I finished buy bread', 'task-done', 'buy bread'], ['5alast buy bread', 'task-done', 'buy bread'], ['خلصت اذاكر', 'task-done', 'اذاكر'], ['delete task buy bread', 'task-delete', 'buy bread'],
  ['emsa7 task buy bread', 'task-delete', 'buy bread'], ['امسح مهمة اذاكر', 'task-delete', 'اذاكر'],
  // Memory
  ['remember my locker code is 42', 'remember', 'locker code is 42'], ['recall locker', 'recall', 'locker'],
  // Mute and voice
  ['mute', 'mute'], ['be quiet', 'mute'], ['eskot', 'mute'], ['اسكت', 'mute'], ['unmute', 'unmute'], ['etkalem', 'unmute'], ['اتكلم', 'unmute'],
  // Wake
  ['jarvis', 'wake', 'instant'], ['wake up jarvis', 'wake'], ['good morning jarvis', 'wake'],
  // Briefing and status
  ['daily briefing', 'briefing'], ['briefing', 'briefing'],
  // Working on
  ['what am i working on', 'working-on'], ['ana ba3mel eh', 'working-on'], ['كنت بعمل ايه', 'working-on'],
  // Research
  ['research best laptops for students', 'research', 'best laptops'], ['look up egypt population', 'research', 'egypt population'],
];

// Questions and chat must NOT become commands (they go to the brain).
export const CHAT = [
  'ezayak ya jarvis', 'إزيك يا جارفيس', 'what is the capital of japan', 'a3mel eh 3ashan azaker ahsan?', 'ana 3andy eh bokra?', 'how do i open a file in python',
  'why is the sky blue', 'tell me a joke', 'el gaw 3amel eh enharda?', 'explain recursion', 'ازاي اذاكر احسن', 'what should i focus on today',
  'ana 3ayz azaker ahsan', 'i want to sleep early today', 'عايز اعرف الساعة كام', 'i need to focus', 'i want to be better at math', '3ayz a3raf el gaw 3amel eh',
  'send an email to ahmed', 'close chrome', 'remove the background from this photo please', 'how are you', 'can you help me with my essay', 'ma3lesh ana ta3ban', 'thank you jarvis', 'shokran', 'شكرا يا جارفيس',
];

// Reminders: [sentence, title substring, [days from now, hour, minute] or ['+min', minutes]].
export const REMINDERS = [
  ['fakkarny ashrab maya ba3d 10 da2aye2', 'ashrab maya', ['+min', 10]],
  ['remind me to drink water in 10 minutes', 'drink water', ['+min', 10]],
  ['فكرني اشرب مية بعد ربع ساعة', 'اشرب مية', ['+min', 15]],
  ['fakkarny akalem ahmed ba3d nos sa3a', 'akalem ahmed', ['+min', 30]],
  ['فكرني اكلم احمد بعد ساعتين', 'اكلم احمد', ['+min', 120]],
  ['فكرني أروح الجيم بكرة الساعة سبعة الصبح', 'أروح الجيم', [1, 7, 0]],
  ['fakkarny el gym bokra el sa3a 7 el sob7', 'gym', [1, 7, 0]],
  ['remind me to call mom tomorrow at 5pm', 'call mom', [1, 17, 0]],
  ['7ot task study bokra el sa3a 8 bel leil', 'study', [1, 20, 0]],
  ['فكرني اذاكر بكرة الساعة تمانية بالليل', 'اذاكر', [1, 20, 0]],
  ['add task meeting tomorrow at 10 am', 'meeting', [1, 10, 0]],
  ['fakkarny el doctor ba3d bokra el sa3a 11 el sob7', 'doctor', [2, 11, 0]],
  ['فكرني بالدكتور بعد بكرة الساعة حداشر الصبح', 'الدكتور', [2, 11, 0]],
  ['fakkarny el meeting bokra el sa3a 3 el 3asr', 'meeting', [1, 15, 0]],
  ['remind me to pray at 12:30 pm tomorrow', 'pray', [1, 12, 30]],
  ['fakkarny bel lecture bokra el sa3a 9 w nos el sob7', 'lecture', [1, 9, 30]],
  ['كل يوم الساعة ٨ الصبح فكرني اشرب مية', 'اشرب مية', [1, 8, 0]],
  ['bokra el sa3a 5 fakkarny akalem ahmed', 'akalem ahmed', [1, 17, 0]],
  ['remind me to take my medicine every day at 9pm', 'medicine', [0, 21, 0]],
  ['remind me to pay rent on 1st of december', 'pay rent', [8, 9, 0]],
  ['fakkarny el doctor 15 december el sa3a 4 el 3asr', 'doctor', [22, 16, 0]],
  ['فكرني ادفع الايجار يوم ٢٠ ديسمبر', 'ادفع الايجار', [27, 9, 0]],
];
