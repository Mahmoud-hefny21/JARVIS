// What JARVIS checks before answering: whether a question needs the live web, real calculation or a second
// opinion, a safe calculator (no eval), and what a correction or preference from the owner looks like.

/** Facts that change over time: news, prices, scores, releases, "today". English, Franco and Arabic. */
export function needsWeb(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(?:latest|news|today'?s|this (?:week|month|year)|right now|currently|current|recent(?:ly)?|price|prices|cost|how much is|exchange rate|score|result|who won|won the|winner|standings|release[sd]?|launch(?:ed)?|version|update|stock|bitcoin|crypto|election|president of|ceo of|20(?:2[4-9]|3\d)|search (?:for|the web)|look (?:it )?up|google)\b/.test(t)
    || /(?:اخبار|أخبار|خبر|سعر|اسعار|أسعار|بكام|النهارده|النهاردة|دلوقتي|نتيجة|مين كسب|كسب|آخر|اخر|احدث|أحدث|ابحث|دور على)/u.test(t)
    || /\b(?:akhbar|a5bar|se3r|s3r|as3ar|bkam|be kam|enharda|elnaharda|dlw2ty|delwa2ty|natiga|meen kesb|a5er|ab7as|dawar 3la)\b/.test(t);
}

/** A question whose answer depends on arithmetic. */
export function needsMath(text: string): boolean {
  const t = text.toLowerCase();
  const digits = (t.match(/\d/g) ?? []).length;
  return (digits >= 2 && /[+\-*/^=×÷%]|\b(?:times|divided|plus|minus|percent|squared|cubed|root|average|mean|total|interest|gpa|speed|velocity|area|volume|probability)\b/.test(t))
    || /\b(?:calculate|compute|solve|how many|how much|a7seb|e7seb)\b|احسب|حل المسألة|كام في|يساوي كام/u.test(t) && digits >= 1;
}

/** Hard enough to deserve a second opinion. */
export function needsReview(text: string): boolean {
  return needsMath(text) || /\b(?:solve|prove|derive|explain why|why does|why is|what is the difference|compare|which is better|should i|diagnos|dose|symptom)\b|اشرح ليه|ليه بيحصل|الفرق بين|احسن ولا|اعمل ايه/u.test(text.toLowerCase());
}

/** The owner correcting JARVIS or stating a lasting preference, worth remembering without "remember". */
export function lastingPreference(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/^jarvis[, ]+/, '');
  return /^(?:i (?:really )?(?:like|love|prefer|hate|enjoy|don'?t like|usually|always|never)\b|my favou?rite\b|call me\b|i'?m allergic\b|don'?t (?:ever )?(?:call|say|tell|open|do|use|speak|talk|reply|answer)\b|stop (?:calling|saying|doing|using|telling)\b|never (?:call|say|do|use|open)\b|from now on\b|next time\b|(?:please )?always\b|remember that i\b|i'?m (?:a|an) (?:student|engineer|developer)\b|i study\b|my (?:major|university|college|exam|exams|birthday|name) (?:is|are)\b)/.test(t)
    || /^(?:(?:انا )?(?:بحب|بكره|مبحبش|بفضل)|متقوليش|ماتقوليش|متقولش|ماتقولش|متعملش|ماتعملش|بطل|بعد كده|من هنا ورايح|من النهارده|دايما|على طول|انا بدرس|انا طالب)/u.test(t)
    || /^(?:ana ba7eb|ana bakrah|mab7ebsh|mat2olish|mat2olsh|mate3melsh|ma3mlsh|batal|ba3d keda|ba3d kda|men hena w rayeh|dayman|ana bdrs|ana bados|ana taleb)\b/.test(t);
}

// ---------- Safe calculator: numbers, + - * / ^ %, parentheses and common functions. No eval. ----------
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, floor: Math.floor, ceil: Math.ceil, round: Math.round,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(expr: string): number {
  const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^').replace(/,(?=\d{3}\b)/g, '').toLowerCase();
  let i = 0;
  const peek = () => { while (src[i] === ' ') i++; return src[i]; };
  const eat = (c: string) => { if (peek() === c) { i++; return true; } return false; };
  function primary(): number {
    if (eat('(')) { const v = sum(); if (!eat(')')) throw new Error('Missing )'); return v; }
    if (eat('-')) return -power();
    if (eat('+')) return power();
    const num = /^\d*\.?\d+(?:e[+-]?\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const word = /^[a-z][a-z0-9]*/.exec(src.slice(i));
    if (word) {
      i += word[0].length;
      if (word[0] in FUNCS) { if (!eat('(')) throw new Error('Expected ('); const v = sum(); if (!eat(')')) throw new Error('Missing )'); return FUNCS[word[0]](v); }
      if (word[0] in CONSTS) return CONSTS[word[0]];
    }
    throw new Error('Unexpected input');
  }
  function postfix(): number { let v = primary(); while (peek() === '%' || peek() === '!') { if (eat('%')) v /= 100; else { eat('!'); if (v < 0 || v > 170 || !Number.isInteger(v)) throw new Error('Bad factorial'); let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f; } } return v; }
  function power(): number { const b = postfix(); return eat('^') ? Math.pow(b, unary()) : b; }
  function unary(): number { if (eat('-')) return -unary(); return power(); }
  function product(): number { let v = unary(); for (;;) { if (eat('*')) v *= unary(); else if (eat('/')) v /= unary(); else return v; } }
  function sum(): number { let v = product(); for (;;) { if (eat('+')) v += product(); else if (eat('-')) v -= product(); else return v; } }
  const v = sum();
  if (peek() !== undefined) throw new Error('Unexpected input');
  if (!Number.isFinite(v)) throw new Error('Not a finite number');
  return v;
}
export const formatNumber = (v: number) => Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10)));
