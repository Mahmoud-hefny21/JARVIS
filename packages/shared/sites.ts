// JARVIS's built-in directory of websites and tools: names in English, Egyptian Arabic and Franco,
// plus what each one is for, so "3ayz a3mel poster" can open Canva. Small on purpose (a few KB).
export type Site = { url: string; names: string[]; uses?: string[] };

export const DIRECTORY: Site[] = [
  // Google and everyday
  { url: 'https://www.google.com', names: ['google', 'جوجل'] },
  { url: 'https://mail.google.com', names: ['gmail', 'g mail', 'my email', 'my inbox', 'جيميل', 'الجيميل', 'الايميل'] },
  { url: 'https://www.youtube.com', names: ['youtube', 'you tube', 'يوتيوب', 'اليوتيوب', 'yotube'] },
  { url: 'https://music.youtube.com', names: ['youtube music', 'يوتيوب ميوزك'] },
  { url: 'https://drive.google.com', names: ['google drive', 'drive', 'درايف'] },
  { url: 'https://docs.google.com', names: ['google docs', 'docs', 'جوجل دوكس'], uses: ['write a document', 'document', 'essay', 'report'] },
  { url: 'https://sheets.google.com', names: ['google sheets', 'sheets', 'جوجل شيتس'], uses: ['spreadsheet', 'sheet', 'table'] },
  { url: 'https://slides.google.com', names: ['google slides', 'slides'], uses: ['presentation', 'slides', 'برزنتيشن', 'بريزنتيشن'] },
  { url: 'https://calendar.google.com', names: ['google calendar', 'calendar', 'التقويم'] },
  { url: 'https://meet.google.com', names: ['google meet', 'meet', 'جوجل ميت'], uses: ['video call', 'meeting link'] },
  { url: 'https://maps.google.com', names: ['google maps', 'maps', 'خرايط جوجل', 'الخريطة'], uses: ['directions', 'route', 'location', 'map'] },
  { url: 'https://translate.google.com', names: ['google translate', 'translate', 'ترجمة جوجل', 'المترجم'], uses: ['translate', 'translation', 'ترجمة', 'targama'] },
  { url: 'https://keep.google.com', names: ['google keep', 'keep'] },
  { url: 'https://photos.google.com', names: ['google photos', 'photos'] },
  { url: 'https://scholar.google.com', names: ['google scholar', 'scholar'], uses: ['research papers', 'papers', 'citations'] },
  { url: 'https://www.google.com/travel/flights', names: ['google flights', 'flights'], uses: ['flight', 'flights', 'plane ticket', 'tayara'] },
  { url: 'https://www.google.com/finance', names: ['google finance'] },
  // AI assistants
  { url: 'https://chatgpt.com', names: ['chatgpt', 'chat gpt', 'شات جي بي تي'] },
  { url: 'https://claude.ai', names: ['claude', 'claude ai', 'كلود'] },
  { url: 'https://gemini.google.com', names: ['gemini', 'جيميناي'] },
  { url: 'https://www.perplexity.ai', names: ['perplexity'] },
  { url: 'https://copilot.microsoft.com', names: ['copilot', 'microsoft copilot'] },
  // Social and messaging
  { url: 'https://web.whatsapp.com', names: ['whatsapp', 'whatsapp web', 'whats app', 'واتساب', 'واتس', 'الواتس'] },
  { url: 'https://www.facebook.com', names: ['facebook', 'face book', 'فيسبوك', 'الفيس', 'el face'] },
  { url: 'https://www.messenger.com', names: ['messenger', 'ماسنجر'] },
  { url: 'https://www.instagram.com', names: ['instagram', 'insta', 'انستجرام', 'انستا'] },
  { url: 'https://x.com', names: ['twitter', 'x', 'تويتر'] },
  { url: 'https://www.linkedin.com', names: ['linkedin', 'linked in', 'لينكدان'] },
  { url: 'https://www.tiktok.com', names: ['tiktok', 'tik tok', 'تيك توك'] },
  { url: 'https://www.reddit.com', names: ['reddit', 'ريديت'] },
  { url: 'https://www.pinterest.com', names: ['pinterest', 'بنترست'] },
  { url: 'https://web.telegram.org', names: ['telegram', 'telegram web', 'تليجرام'] },
  { url: 'https://discord.com/app', names: ['discord', 'discord web', 'ديسكورد'] },
  { url: 'https://web.snapchat.com', names: ['snapchat', 'سناب'] },
  { url: 'https://www.quora.com', names: ['quora'] },
  // Entertainment
  { url: 'https://www.netflix.com', names: ['netflix', 'نتفليكس', 'نتفلكس'] },
  { url: 'https://open.spotify.com', names: ['spotify', 'spotify web', 'سبوتيفاي'], uses: ['music', 'songs', 'playlist', 'aghany', 'اغاني'] },
  { url: 'https://www.anghami.com', names: ['anghami', 'انغامي', 'أنغامي'] },
  { url: 'https://soundcloud.com', names: ['soundcloud', 'ساوند كلاود'] },
  { url: 'https://shahid.mbc.net', names: ['shahid', 'شاهد'] },
  { url: 'https://www.watchit.com', names: ['watch it', 'watchit', 'واتش ات'] },
  { url: 'https://www.twitch.tv', names: ['twitch'] },
  { url: 'https://www.imdb.com', names: ['imdb'], uses: ['movie rating', 'film rating'] },
  { url: 'https://www.goodreads.com', names: ['goodreads'], uses: ['books to read', 'book reviews'] },
  // Football (Egypt national team only)
  { url: 'https://www.filgoal.com', names: ['filgoal', 'fil goal', 'في الجول', 'فالجول'], uses: ['egypt match', 'match score', 'el montakhab', 'المنتخب'] },
  { url: 'https://www.yallakora.com', names: ['yallakora', 'yalla kora', 'يلا كورة'] },
  // Study and learning
  { url: 'https://www.miuegypt.edu.eg', names: ['miu', 'miu website', 'el gam3a', 'الجامعة', 'جامعة مصر الدولية'] },
  { url: 'https://www.coursera.org', names: ['coursera', 'كورسيرا'], uses: ['online course', 'certificate'] },
  { url: 'https://www.udemy.com', names: ['udemy', 'يوديمي'] },
  { url: 'https://www.edx.org', names: ['edx'] },
  { url: 'https://www.khanacademy.org', names: ['khan academy', 'خان اكاديمي'] },
  { url: 'https://www.duolingo.com', names: ['duolingo', 'دولينجو'], uses: ['learn a language', 'learn english', 'learn french', 'learn german'] },
  { url: 'https://www.w3schools.com', names: ['w3schools', 'w3 schools'], uses: ['learn html', 'learn css', 'learn javascript', 'learn sql'] },
  { url: 'https://www.freecodecamp.org', names: ['freecodecamp', 'free code camp'], uses: ['learn programming', 'learn to code', 'at3alem programming'] },
  { url: 'https://www.geeksforgeeks.org', names: ['geeksforgeeks', 'geeks for geeks'], uses: ['data structures', 'algorithms'] },
  { url: 'https://developer.mozilla.org', names: ['mdn', 'mdn docs'] },
  { url: 'https://www.wolframalpha.com', names: ['wolfram alpha', 'wolframalpha', 'wolfram'], uses: ['solve equation', 'solve math', 'integral', 'derivative', 'math problem', 'a7el mas2ala'] },
  { url: 'https://www.desmos.com/calculator', names: ['desmos', 'ديزموس'], uses: ['graph', 'plot a function', 'graph a function'] },
  { url: 'https://www.overleaf.com', names: ['overleaf', 'latex'], uses: ['latex', 'write a paper', 'research paper', 'cv in latex'] },
  { url: 'https://www.grammarly.com', names: ['grammarly', 'جرامرلي'], uses: ['check grammar', 'grammar', 'spelling'] },
  { url: 'https://quillbot.com', names: ['quillbot', 'كويل بوت'], uses: ['paraphrase', 'rephrase', 'reword', 'summarize text'] },
  { url: 'https://www.wikipedia.org', names: ['wikipedia', 'wiki', 'ويكيبيديا'] },
  { url: 'https://archive.org', names: ['internet archive', 'archive.org'] },
  { url: 'https://www.researchgate.net', names: ['researchgate', 'research gate'] },
  // Programming and developer tools
  { url: 'https://github.com', names: ['github', 'git hub', 'جيت هاب'] },
  { url: 'https://gitlab.com', names: ['gitlab'] },
  { url: 'https://stackoverflow.com', names: ['stackoverflow', 'stack overflow', 'ستاك اوفرفلو'], uses: ['coding error', 'code question'] },
  { url: 'https://leetcode.com', names: ['leetcode', 'leet code', 'ليت كود'], uses: ['coding practice', 'interview practice', 'problem solving'] },
  { url: 'https://www.hackerrank.com', names: ['hackerrank', 'hacker rank'] },
  { url: 'https://codeforces.com', names: ['codeforces', 'code forces'], uses: ['competitive programming'] },
  { url: 'https://replit.com', names: ['replit'], uses: ['run code online', 'online compiler'] },
  { url: 'https://codepen.io', names: ['codepen'] },
  { url: 'https://regex101.com', names: ['regex101', 'regex'], uses: ['test regex', 'regular expression'] },
  { url: 'https://colab.research.google.com', names: ['colab', 'google colab', 'كولاب'], uses: ['jupyter', 'notebook', 'train a model'] },
  { url: 'https://www.kaggle.com', names: ['kaggle', 'كاجل'], uses: ['dataset', 'datasets'] },
  { url: 'https://huggingface.co', names: ['hugging face', 'huggingface'] },
  { url: 'https://www.npmjs.com', names: ['npm', 'npmjs'] },
  { url: 'https://pypi.org', names: ['pypi'] },
  { url: 'https://hub.docker.com', names: ['docker hub'] },
  { url: 'https://vercel.com/dashboard', names: ['vercel', 'فيرسل'] },
  { url: 'https://app.netlify.com', names: ['netlify'] },
  { url: 'https://dash.cloudflare.com', names: ['cloudflare'] },
  { url: 'https://console.firebase.google.com', names: ['firebase', 'فايربيز'] },
  { url: 'https://supabase.com/dashboard', names: ['supabase'] },
  { url: 'https://console.groq.com', names: ['groq', 'groq console'] },
  { url: 'https://login.tailscale.com/admin', names: ['tailscale', 'tailscale admin'] },
  { url: 'https://dev.to', names: ['dev.to', 'dev to'] },
  { url: 'https://medium.com', names: ['medium', 'ميديم'] },
  // Design and media
  { url: 'https://www.canva.com', names: ['canva', 'كانفا'], uses: ['poster', 'design a poster', 'design', 'flyer', 'logo', 'cv', 'resume', 'invitation', 'thumbnail', 'instagram post', 'بوستر', 'تصميم', 'لوجو'] },
  { url: 'https://www.figma.com', names: ['figma', 'فيجما'], uses: ['ui design', 'app design', 'website design', 'wireframe', 'prototype'] },
  { url: 'https://www.photopea.com', names: ['photopea'], uses: ['edit photo', 'edit a photo', 'photoshop online', 'edit image', 'a3adel sora'] },
  { url: 'https://www.remove.bg', names: ['remove bg', 'remove.bg'], uses: ['remove background', 'remove the background', 'cut out', 'شيل الخلفية', 'ashil el khalfeya'] },
  { url: 'https://tinypng.com', names: ['tinypng', 'tiny png'], uses: ['compress image', 'compress photo', 'smaller image', 'reduce image size'] },
  { url: 'https://miro.com', names: ['miro'], uses: ['whiteboard', 'brainstorm', 'mind map'] },
  { url: 'https://excalidraw.com', names: ['excalidraw'], uses: ['diagram', 'draw a diagram', 'sketch', 'flowchart'] },
  { url: 'https://coolors.co', names: ['coolors'], uses: ['color palette', 'colour palette', 'colors'] },
  { url: 'https://fonts.google.com', names: ['google fonts', 'fonts'], uses: ['font', 'fonts'] },
  { url: 'https://unsplash.com', names: ['unsplash'], uses: ['free photos', 'stock photos', 'wallpaper'] },
  { url: 'https://www.pexels.com', names: ['pexels'], uses: ['free videos', 'stock video'] },
  { url: 'https://www.flaticon.com', names: ['flaticon'], uses: ['icons', 'icon'] },
  { url: 'https://dribbble.com', names: ['dribbble'] },
  { url: 'https://www.behance.net', names: ['behance', 'بيهانس'] },
  { url: 'https://www.capcut.com', names: ['capcut', 'كاب كات'], uses: ['edit video', 'edit a video', 'video editing', 'montage', 'مونتاج'] },
  // Files and PDFs
  { url: 'https://www.ilovepdf.com', names: ['ilovepdf', 'i love pdf'], uses: ['pdf', 'convert pdf', 'pdf to word', 'word to pdf', 'merge pdf', 'compress pdf', 'split pdf', 'a7awel pdf', 'حول pdf'] },
  { url: 'https://smallpdf.com', names: ['smallpdf', 'small pdf'], uses: ['sign pdf', 'edit pdf'] },
  { url: 'https://wetransfer.com', names: ['wetransfer', 'we transfer'], uses: ['send a big file', 'send large file', 'share big file'] },
  { url: 'https://www.dropbox.com', names: ['dropbox', 'دروب بوكس'] },
  { url: 'https://onedrive.live.com', names: ['onedrive', 'one drive', 'ون درايف'] },
  { url: 'https://www.office.com', names: ['office', 'office online', 'microsoft 365'] },
  { url: 'https://outlook.live.com', names: ['outlook', 'hotmail', 'اوتلوك'] },
  { url: 'https://teams.microsoft.com', names: ['teams', 'microsoft teams', 'تيمز'] },
  { url: 'https://zoom.us', names: ['zoom', 'زوم'] },
  { url: 'https://www.notion.so', names: ['notion', 'نوشن'], uses: ['notes app', 'organize notes', 'wiki'] },
  { url: 'https://trello.com', names: ['trello', 'تريلو'], uses: ['kanban', 'project board'] },
  { url: 'https://slack.com', names: ['slack', 'سلاك'] },
  // Utilities
  { url: 'https://fast.com', names: ['fast.com', 'speed test', 'speedtest', 'internet speed', 'سرعة النت'], uses: ['speed test', 'internet speed', 'is the internet slow', 'el net ba6e2', 'النت بطيء'] },
  { url: 'https://www.xe.com', names: ['xe', 'xe currency'], uses: ['currency converter', 'convert currency', 'exchange rate'] },
  { url: 'https://www.timeanddate.com', names: ['timeanddate', 'time and date'], uses: ['time zone', 'world clock'] },
  { url: 'https://www.windy.com', names: ['windy'], uses: ['weather map', 'wind'] },
  { url: 'https://www.tradingview.com', names: ['tradingview', 'trading view'], uses: ['stock chart', 'stocks'] },
  { url: 'https://coinmarketcap.com', names: ['coinmarketcap', 'coin market cap'], uses: ['crypto prices', 'bitcoin price'] },
  { url: 'https://www.binance.com', names: ['binance', 'بينانس'] },
  // Shopping and travel
  { url: 'https://www.amazon.eg', names: ['amazon', 'amazon egypt', 'امازون'], uses: ['buy online', 'shopping', 'ashtry online'] },
  { url: 'https://www.noon.com/egypt-en', names: ['noon', 'نون'] },
  { url: 'https://www.jumia.com.eg', names: ['jumia', 'جوميا'] },
  { url: 'https://www.aliexpress.com', names: ['aliexpress', 'ali express', 'علي اكسبريس'] },
  { url: 'https://www.olx.com.eg', names: ['olx', 'اوليكس'] },
  { url: 'https://www.dubizzle.com.eg', names: ['dubizzle', 'دوبيزل'], uses: ['used car', 'apartment for rent'] },
  { url: 'https://www.booking.com', names: ['booking', 'booking.com', 'بوكينج'], uses: ['hotel', 'book a hotel', 'فندق'] },
  { url: 'https://www.airbnb.com', names: ['airbnb', 'اير بي ان بي'] },
  { url: 'https://www.skyscanner.net', names: ['skyscanner', 'sky scanner'] },
  // Egypt: services, banks, telecom, food, transport, health, jobs, news, government
  { url: 'https://www.fawry.com', names: ['fawry', 'فوري'], uses: ['pay bills', 'pay a bill', 'bill payment', 'adfa3 fatoora', 'ادفع فاتورة'] },
  { url: 'https://ipn.eg', names: ['instapay', 'insta pay', 'انستاباي', 'انستا باي'], uses: ['transfer money', 'send money', 'a7awel flous', 'حول فلوس'] },
  { url: 'https://www.cibeg.com', names: ['cib', 'cib bank', 'البنك التجاري الدولي'] },
  { url: 'https://www.nbe.com.eg', names: ['nbe', 'national bank of egypt', 'البنك الاهلي', 'البنك الأهلي', 'el ahly bank'] },
  { url: 'https://www.banquemisr.com', names: ['banque misr', 'bank masr', 'بنك مصر'] },
  { url: 'https://www.qnb.com.eg', names: ['qnb', 'qnb egypt'] },
  { url: 'https://web.vodafone.com.eg', names: ['vodafone', 'vodafone egypt', 'فودافون'], uses: ['recharge vodafone', 'vodafone bill'] },
  { url: 'https://www.orange.eg', names: ['orange', 'orange egypt', 'اورنج'] },
  { url: 'https://www.eand.com.eg', names: ['etisalat', 'e&', 'eand', 'اتصالات'] },
  { url: 'https://te.eg', names: ['we', 'we internet', 'telecom egypt', 'وي', 'المصرية للاتصالات'], uses: ['home internet', 'internet bill', 'fatoorat el net', 'فاتورة النت'] },
  { url: 'https://www.talabat.com/egypt', names: ['talabat', 'طلبات'], uses: ['order food', 'food delivery', 'a3mel order akl', 'اطلب اكل', 'akl'] },
  { url: 'https://www.elmenus.com', names: ['elmenus', 'el menus', 'المنيو'], uses: ['restaurant menu', 'restaurants'] },
  { url: 'https://breadfast.com', names: ['breadfast', 'بريدفاست'], uses: ['groceries', 'grocery', 'بقالة'] },
  { url: 'https://www.uber.com/eg/en', names: ['uber', 'اوبر'], uses: ['ride', 'taxi', 'car ride', 'تاكسي'] },
  { url: 'https://www.careem.com', names: ['careem', 'كريم'] },
  { url: 'https://www.swvl.com', names: ['swvl', 'سويفل'] },
  { url: 'https://www.vezeeta.com', names: ['vezeeta', 'فيزيتا'], uses: ['book a doctor', 'doctor appointment', 'doctor', 'دكتور', 'كشف'] },
  { url: 'https://wuzzuf.net', names: ['wuzzuf', 'وظف'], uses: ['jobs', 'find a job', 'internship', 'shoghl', 'شغل', 'تدريب'] },
  { url: 'https://forasna.com', names: ['forasna', 'فرصنا'] },
  { url: 'https://www.bayt.com', names: ['bayt', 'بيت.كوم'] },
  { url: 'https://digital.gov.eg', names: ['digital egypt', 'مصر الرقمية'], uses: ['government services', 'birth certificate', 'خدمات حكومية'] },
  { url: 'https://egyptpost.gov.eg', names: ['egypt post', 'البريد المصري'] },
  { url: 'https://www.ahram.org.eg', names: ['al ahram', 'el ahram newspaper', 'الاهرام', 'الأهرام'] },
  { url: 'https://www.youm7.com', names: ['youm7', 'el youm el sabe3', 'اليوم السابع'] },
  { url: 'https://www.masrawy.com', names: ['masrawy', 'مصراوي'] },
  { url: 'https://www.shorouknews.com', names: ['el shorouk', 'shorouk', 'الشروق'] },
  { url: 'https://www.bbc.com/arabic', names: ['bbc arabic', 'بي بي سي عربي'] },
  { url: 'https://www.bbc.com/news', names: ['bbc', 'bbc news'] },
  // Faith
  { url: 'https://quran.com', names: ['quran', 'quran.com', 'القرآن', 'القران', 'el quran'], uses: ['read quran', 'tafsir', 'surah', 'سورة', 'تفسير'] },
  { url: 'https://sunnah.com', names: ['sunnah', 'sunnah.com', 'السنة'], uses: ['hadith', 'حديث'] },
  { url: 'https://dorar.net', names: ['dorar', 'الدرر السنية'] },
  { url: 'https://www.islamweb.net', names: ['islamweb', 'islam web', 'اسلام ويب'], uses: ['fatwa', 'فتوى'] },
];

const normalize = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ًٌٍَُِّْ]/g, '')
  .replace(/^(?:el|al|the)[\s-]+/, '').replace(/^ال(?=\S{3,})/, '').replace(/[.!?؟]+$/, '').replace(/\s+(?:website|site|web site|page|موقع)$/i, '').replace(/\s+/g, ' ').trim();

/** The website for a spoken name ("نتفليكس", "el youtube", "fawry"), or null. */
export function findSite(name: string): string | null {
  const n = normalize(name);
  if (!n) return null;
  for (const site of DIRECTORY) if (site.names.some(alias => normalize(alias) === n)) return site.url;
  return null;
}

/** The best tool for a goal ("design a poster" → Canva), when a use keyword clearly matches. */
export function findTool(goal: string): { url: string; name: string } | null {
  const g = ` ${normalize(goal)} `;
  let best: { url: string; name: string; score: number } | null = null;
  for (const site of DIRECTORY) for (const use of site.uses ?? []) {
    const u = normalize(use);
    if (g.includes(` ${u} `) || (u.includes(' ') && g.includes(u))) {
      const score = u.length;
      if (!best || score > best.score) best = { url: site.url, name: site.names[0], score };
    }
  }
  return best ? { url: best.url, name: best.name } : null;
}

// Windows apps by their Arabic and Franco names → the English name used to find the installed app.
export const APP_NAMES: [RegExp, string][] = [
  [/^(?:الآلة الحاسبة|الالة الحاسبة|الحاسبة|calculator|el calculator|ela2la el 7asba|el 7asba)$/iu, 'Calculator'],
  [/^(?:المفكرة|النوت باد|notepad|el notepad)$/iu, 'Notepad'],
  [/^(?:الرسام|paint|el paint|برنامج الرسم)$/iu, 'Paint'],
  [/^(?:وورد|الوورد|word|el word|microsoft word)$/iu, 'Word'],
  [/^(?:اكسل|الاكسل|excel|el excel|microsoft excel)$/iu, 'Excel'],
  [/^(?:باوربوينت|البوربوينت|powerpoint|power point|el powerpoint)$/iu, 'PowerPoint'],
  [/^(?:الاعدادات|الإعدادات|الضبط|settings|el settings|el e3dadat)$/iu, 'Settings'],
  [/^(?:مستكشف الملفات|الملفات|file explorer|explorer|el files|my files)$/iu, 'File Explorer'],
  [/^(?:كروم|جوجل كروم|chrome|google chrome|el chrome)$/iu, 'Chrome'],
  [/^(?:ايدج|edge|microsoft edge)$/iu, 'Edge'],
  [/^(?:الكاميرا|camera|el camera)$/iu, 'Camera'],
  [/^(?:الصور|photos app|el sowar)$/iu, 'Photos'],
  [/^(?:الساعة|المنبه|clock|alarms|el monabeh)$/iu, 'Clock'],
  [/^(?:التيرمنال|terminal|windows terminal|cmd|command prompt)$/iu, 'Terminal'],
  [/^(?:فيجوال ستوديو كود|في اس كود|vs code|vscode|visual studio code)$/iu, 'Visual Studio Code'],
  [/^(?:سبوتيفاي|spotify app)$/iu, 'Spotify'],
  [/^(?:ديسكورد|discord app)$/iu, 'Discord'],
  [/^(?:مدير المهام|task manager)$/iu, 'Task Manager'],
];
export function englishAppName(name: string): string | null {
  const n = name.trim().replace(/[.!?؟]+$/, '');
  for (const [re, app] of APP_NAMES) if (re.test(n)) return app;
  return null;
}
