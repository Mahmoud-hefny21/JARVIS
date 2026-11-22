// Builds JARVIS's own knowledge library: the lead summaries of Wikipedia's ~10,000 "vital" articles (Level 4)
// in English, plus the Arabic article's summary where one exists, in a small SQLite file with full-text search.
// Output: .build/knowledge/knowledge.db (tens of MB). `--install` copies it into JARVIS's data folder.
// Polite to Wikipedia: named user agent, one request at a time, maxlag, retries with back-off.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const AGENT = 'JARVIS-Personal/0.1 (https://github.com/Mahmoud-hefny21/JARVIS; personal offline knowledge library)';
let last = 0;
const out = path.resolve('.build/knowledge/knowledge.db');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function api(host, params, attempt = 0) {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  // At most about one request per second (Wikimedia API etiquette).
  const gap = 1100 - (Date.now() - last);
  if (gap > 0) await wait(gap);
  last = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': AGENT, 'Api-User-Agent': AGENT }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429) throw Object.assign(new Error('rate limited'), { retryAfter: Number(r.headers.get('retry-after')) || 60 });
    const data = await r.json();
    if (data.error?.code === 'maxlag' || r.status >= 500) throw new Error(data.error?.code ?? String(r.status));
    return data;
  } catch (error) {
    if (attempt >= 6) throw error;
    await wait(error.retryAfter ? error.retryAfter * 1000 : 3000 * 2 ** attempt);
    return api(host, params, attempt + 1);
  }
}

// 1. Titles of the Level 4 vital articles: their talk pages sit in per-topic categories.
async function members(category, type) {
  const found = [];
  let c = {};
  do {
    const d = await api('en.wikipedia.org', { action: 'query', list: 'categorymembers', cmtitle: category, cmtype: type, cmlimit: 'max', ...(type === 'page' ? { cmnamespace: '1' } : {}), ...c });
    found.push(...(d.query?.categorymembers ?? []).map(m => m.title));
    c = d.continue ?? null;
  } while (c);
  return found;
}
async function vitalTitles() {
  const titles = new Set();
  const queue = await members('Category:Wikipedia level-4 vital articles by topic', 'subcat');
  for (let i = 0; i < queue.length; i++) {
    for (const t of await members(queue[i], 'page')) titles.add(t.replace(/^Talk:/, ''));
    if (queue.length < 80) for (const sub of await members(queue[i], 'subcat')) if (!queue.includes(sub)) queue.push(sub);
    process.stdout.write(`  topic categories: ${i + 1}/${queue.length}, articles: ${titles.size}   `);
  }
  console.log();
  return [...titles];
}

// 2. Lead summaries (plain text), 20 per request, with the Arabic title when it exists.
// Progress is cached per host, so an interrupted run resumes instead of starting over.
const cacheFile = host => path.resolve(`.build/knowledge/cache-${host}.json`);
async function summaries(host, titles, withArabic) {
  mkdirSync(path.resolve('.build/knowledge'), { recursive: true });
  const cache = existsSync(cacheFile(host)) ? JSON.parse(readFileSync(cacheFile(host), 'utf8')) : { done: {}, pages: [] };
  const result = cache.pages;
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20).filter(t => !cache.done[t]);
    if (!batch.length) continue;
    let c = {}, pages = new Map();
    do {
      const params = { action: 'query', titles: batch.join('|'), prop: withArabic ? 'extracts|langlinks' : 'extracts', exintro: '1', explaintext: '1', exlimit: '20', redirects: '1', ...c };
      if (withArabic) Object.assign(params, { lllang: 'ar', lllimit: 'max' });
      const d = await api(host, params);
      for (const p of d.query?.pages ?? []) {
        const prev = pages.get(p.title) ?? { title: p.title };
        if (p.extract) prev.summary = p.extract;
        if (p.langlinks?.[0]?.title) prev.arabic = p.langlinks[0].title;
        pages.set(p.title, prev);
      }
      c = d.continue ?? null;
    } while (c);
    for (const p of pages.values()) if (p.summary && p.summary.length > 80) result.push(p);
    for (const t of batch) cache.done[t] = 1;
    if (i % 400 === 0) {
      writeFileSync(cacheFile(host), JSON.stringify(cache));
      process.stdout.write(`\r  ${host}: ${Math.min(i + 20, titles.length)}/${titles.length}   `);
    }
  }
  writeFileSync(cacheFile(host), JSON.stringify(cache));
  console.log();
  return result;
}

const trim = text => { const t = text.replace(/\s+/g, ' ').trim(); if (t.length <= 1200) return t; const cut = t.slice(0, 1200); return cut.slice(0, Math.max(cut.lastIndexOf('. '), 600) + 1); };

console.log('Reading the vital articles list…');
const titles = await vitalTitles();
console.log(`Fetching ${titles.length} English summaries…`);
const english = await summaries('en.wikipedia.org', titles, true);
const arabicTitles = english.map(p => p.arabic).filter(Boolean);
console.log(`Fetching ${arabicTitles.length} Arabic summaries…`);
const arabic = await summaries('ar.wikipedia.org', arabicTitles, false);

mkdirSync(path.dirname(out), { recursive: true });
rmSync(out, { force: true });
const db = new DatabaseSync(out);
db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
CREATE TABLE articles(id INTEGER PRIMARY KEY, lang TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, url TEXT NOT NULL);
CREATE VIRTUAL TABLE articles_fts USING fts5(title, summary, content='articles', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);`);
const insert = db.prepare('INSERT INTO articles(lang,title,summary,url) VALUES(?,?,?,?)');
db.exec('BEGIN');
for (const p of english) insert.run('en', p.title, trim(p.summary), `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`);
for (const p of arabic) insert.run('ar', p.title, trim(p.summary), `https://ar.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`);
db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild'); COMMIT;");
db.prepare('INSERT INTO meta VALUES(?,?)').run('built', new Date().toISOString());
db.prepare('INSERT INTO meta VALUES(?,?)').run('source', 'Wikipedia lead sections, CC BY-SA 4.0');
db.exec('VACUUM');
db.close();
console.log(`Library: ${english.length} English + ${arabic.length} Arabic articles, ${(statSync(out).size / 1048576).toFixed(1)} MB → ${out}`);

if (process.argv.includes('--install')) {
  const target = path.join(process.env.APPDATA, 'com.jarvis.personal', 'knowledge.db');
  copyFileSync(out, target);
  console.log(`Installed → ${target}`);
}
