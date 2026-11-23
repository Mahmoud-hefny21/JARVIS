// Shared vocabulary: turns Egyptian Arabic and Franco (Arabic in Latin letters, 2=ء 3=ع 5=خ 7=ح 8=غ)
// into the English phrasing the command parser already understands. Only command and time words are
// rewritten; everything else (task titles, names) is left exactly as the user said it.

const AR_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

// Number words for 1–12, Arabic and Franco spellings. Longer spellings first so "sab3a" wins over "sab3".
const NUMBER_WORDS: [string, number][] = [
  ['واحدة', 1], ['واحد', 1], ['wa7da', 1], ['wa7ed', 1], ['wahda', 1], ['wahed', 1],
  ['اتنين', 2], ['إتنين', 2], ['اثنين', 2], ['etnen', 2], ['etneen', 2], ['itnen', 2], ['itnein', 2], ['2tnen', 2],
  ['تلاتة', 3], ['ثلاثة', 3], ['تلات', 3], ['talata', 3], ['tlata', 3], ['talat', 3], ['tlat', 3],
  ['أربعة', 4], ['اربعة', 4], ['اربع', 4], ['arba3a', 4], ['arb3a', 4], ['arba3', 4],
  ['خمسة', 5], ['خمس', 5], ['5amsa', 5], ['khamsa', 5], ['5ams', 5],
  ['ستة', 6], ['setta', 6], ['sitta', 6],
  ['سبعة', 7], ['سبع', 7], ['sab3a', 7], ['sab3', 7], ['saba3a', 7],
  ['تمانية', 8], ['ثمانية', 8], ['تمن', 8], ['tamanya', 8], ['tmanya', 8], ['taman', 8],
  ['تسعة', 9], ['تسع', 9], ['tes3a', 9], ['tis3a', 9], ['tes3', 9],
  ['عشرة', 10], ['عشر', 10], ['3ashara', 10], ['3ashra', 10], ['3ashr', 10],
  ['حداشر', 11], ['احداشر', 11], ['7edashar', 11], ['hedashar', 11], ['7dashar', 11],
  ['اتناشر', 12], ['اثناشر', 12], ['etnashar', 12], ['itnashar', 12], ['2tnashar', 12],
  ['خمستاشر', 15], ['5amastashar', 15], ['عشرين', 20], ['3eshreen', 20], ['3eshrin', 20], ['تلاتين', 30], ['talateen', 30], ['اربعين', 40], ['khamseen', 50], ['خمسين', 50], ['5amseen', 50],
];
const NUM = `(\\d{1,3}|${NUMBER_WORDS.map(([w]) => w).join('|')})`;
const numberOf = (word: string) => /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS.find(([w]) => w === word.toLowerCase())?.[1] ?? NaN;

const MINUTES = '(?:دقايق|دقائق|دقيقة|دقيقه|da2aye2|d2aye2|da2ay2|da2ayeq|daqayeq|de2i2a|d2i2a|de2a2|da2i2a|minutes?|mins?)';
const HOURS = '(?:ساعات|ساعة|ساعه|sa3at|sa3a|hours?)';
const AFTER = '(?:بعد|ba3d|b3d|ba3ed)';
const CLOCK = '(?:الساعة|الساعه|el\\s*sa3a|elsa3a|sa3a|il\\s*sa3a)';
const MORNING = '(?:الصبح|صباحا|صباحاً|el\\s*sob7|sob7|el\\s*sba7|sba7|el\\s*so[b]?[h7])';
const EVENING = '(?:بالليل|بليل|مساء|مساءً|بالليل|bel\\s*leil|bel\\s*lel|bellel|belel|bel\\s*lail|bil\\s*leil|el\\s*leil|العصر|el\\s*3asr|المغرب|el\\s*maghrib|el\\s*ma8rb|العشا|el\\s*3esha)';
const NOON = '(?:الضهر|الظهر|el\\s*dohr|el\\s*zohr|dohr)';

/** Rewrites Arabic/Franco day and time expressions to English ("bokra el sa3a 7 el sob7" → "tomorrow at 7 am"). */
export function timeToEnglish(input: string): string {
  let t = input.replace(/[٠-٩]/g, d => AR_DIGITS[d]);
  const flags = 'giu';
  // Relative times: "ba3d 10 da2aye2", "بعد ساعتين", "ba3d nos sa3a".
  t = t.replace(new RegExp(`${AFTER}\\s+(?:نص|nos|nus|noss)\\s+${HOURS}`, flags), 'in 30 minutes')
    .replace(new RegExp(`${AFTER}\\s+(?:ربع|rob3|ro3b)\\s+${HOURS}`, flags), 'in 15 minutes')
    .replace(new RegExp(`${AFTER}\\s+(?:ساعتين|sa3teen|sa3tein|sa3ten)`, flags), 'in 2 hours')
    .replace(new RegExp(`${AFTER}\\s+${NUM}\\s+${MINUTES}`, flags), (_, n) => `in ${numberOf(n)} minutes`)
    .replace(new RegExp(`${AFTER}\\s+${NUM}\\s+${HOURS}`, flags), (_, n) => `in ${numberOf(n)} hours`)
    .replace(new RegExp(`${AFTER}\\s+(?:دقيقة|دقيقه|de2i2a|d2i2a)\\b`, flags), 'in 1 minutes')
    .replace(new RegExp(`${AFTER}\\s+${HOURS}(?=$|\\s|[.,!؟?])`, flags), 'in 1 hours');
  // Clock times: "الساعة سبعة الصبح", "el sa3a 8 w nos bel leil", "sa3a 5".
  t = t.replace(new RegExp(`${CLOCK}\\s+${NUM}(?:\\s+(?:و|w|we)\\s*(نص|ربع|nos|nus|rob3))?(?:\\s+(?:${MORNING}|(${EVENING})|(${NOON})))?`, flags),
    (whole, n, half, evening, noon) => {
      const hour = numberOf(n);
      if (!Number.isFinite(hour)) return whole;
      const minutes = half ? (/ربع|rob3/i.test(half) ? ':15' : ':30') : '';
      const morning = new RegExp(MORNING, 'iu').test(whole);
      const suffix = morning ? ' am' : evening ? ' pm' : noon ? (hour <= 5 || hour === 12 ? ' pm' : ' am') : '';
      return `at ${hour}${minutes}${suffix}`;
    });
  // Days.
  t = t.replace(/(?:بعد\s+بكر[ةه]|ba3d\s+bokra|ba3d\s+bukra)/giu, 'the day after tomorrow')
    .replace(/(?:^|\s)(?:بكر[ةه]|bokra|bukra|bokrah)(?=$|\s|[.,!؟?])/giu, ' tomorrow')
    .replace(/(?:^|\s)(?:النهارد[ةه]|enharda|ennaharda|naharda|el\s*naharda)(?=$|\s|[.,!؟?])/giu, ' today')
    .replace(/(?:^|\s)(?:today|tomorrow)?\s*(?:بالليل|bel\s*leil|bel\s*lel|belel)(?=$|\s|[.,!؟?])/giu, m => /tomorrow/i.test(m) ? ' tomorrow at 8 pm' : ' tonight');
  t = t.replace(/(?:^|\s)(?:kol\s+yo+m|kol\s+yum|كل\s+يوم)(?=$|\s|[.,!؟?])/giu, ' every day')
    .replace(/(?:^|\s)(?:kol\s+esbo3|kol\s+osbo3|كل\s+(?:اسبوع|أسبوع))(?=$|\s|[.,!؟?])/giu, ' every week')
    .replace(/(?:^|\s)(?:kol\s+shahr|كل\s+شهر)(?=$|\s|[.,!؟?])/giu, ' every month')
    .replace(/(?:^|\s)(?:kol|كل)\s+(?=(?:يوم\s+)?(?:السبت|الحد|الأحد|الاحد|الاتنين|التلات|الاربع|الخميس|الجمعة|el\s*sabt|el\s*7ad|el\s*etnen|el\s*talat|el\s*arba3|el\s*5amis|el\s*gom3a))/giu, ' every ');
  const days: [RegExp, string][] = [
    [/(?:يوم\s+)?(?:السبت|el\s*sabt|yom\s+el\s*sabt)/giu, 'saturday'], [/(?:يوم\s+)?(?:الحد|الأحد|الاحد|el\s*7ad|yom\s+el\s*7ad)/giu, 'sunday'],
    [/(?:يوم\s+)(?:الاتنين|الإثنين|الاثنين)|yom\s+el\s*etnen|(?:^|\s)الاتنين(?=$|\s)/giu, ' monday'], [/(?:يوم\s+)?(?:التلات|الثلاثاء|el\s*talat)/giu, 'tuesday'],
    [/(?:يوم\s+)?(?:الاربع|الأربعاء|الاربعاء|el\s*arba3)/giu, 'wednesday'], [/(?:يوم\s+)?(?:الخميس|el\s*5amis|el\s*khamis)/giu, 'thursday'],
    [/(?:يوم\s+)?(?:الجمعة|الجمعه|el\s*gom3a|el\s*goma3)/giu, 'friday'],
  ];
  for (const [re, day] of days) t = t.replace(re, ` ${day}`);
  return t.replace(/\s+/g, ' ').trim();
}

// Franco command verbs, for typo-tolerant matching of the first word.
const VERB_LEXICON = ['eftah', 'eftahly', 'e3rdli', 'e3redli', 'warini', 'wareeni', 'fakkarny', 'fakarny', '2fel', 'e2fel', 'emsa7', 'dawar', 'sha8al', 'shaghal'];
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Fixes a misspelled Franco verb at the start ("e3redly el tasks" → "e3rdli el tasks"). */
export function fixFrancoVerb(input: string): string {
  const m = input.match(/^\s*(?:(?:ya |hey )?jarvis[,.!\s]+)?([a-z0-9]+)/i);
  if (!m) return input;
  const word = m[1].toLowerCase();
  if (VERB_LEXICON.includes(word) || word.length < 4) return input;
  let best = '', score = 9;
  for (const verb of VERB_LEXICON) { const d = distance(word, verb); if (d < score) { score = d; best = verb; } }
  const allowed = word.length >= 7 ? 2 : 1;
  return score <= allowed ? input.replace(m[1], best) : input;
}

/** Arabic/Franco phrasings of commands, rewritten to English commands. Applied after the verb table. */
export const PHRASES: [RegExp, string][] = [
  // Add a task: "7ot task …", "zawed task …", "ضيف مهمة …", "اعمل تاسك …".
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:7ot|hot|7ott|zawed|zawwed|zwd|e3mel|a3mel|e3ml|ضيف|زود|حط|اعمل|اعملي)\s+(?:li\s+|ly\s+|لي\s+)?(?:task|tasks|taskk|تاسك|مهمة|مهمه)\s+/iu, 'add task '],
  // Time first, then the verb: "كل يوم الساعة ٨ فكرني اشرب مية" → "remind me to اشرب مية كل يوم الساعة ٨".
  [/^(?!remind me)(.{3,60}?)\s+(?:فكرني|فكّرني|ذكرني|fakkarny|fakarny|fakkarni|remind me to)\s+(.{2,200})$/iu, 'remind me to $2 $1'],
  // Finished: "5alast …", "خلصت …".
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:5alast|khalast|5lst|5alas|خلصت|انا خلصت)\s+/iu, 'I finished '],
];
