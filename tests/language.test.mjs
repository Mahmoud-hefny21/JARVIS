import test from 'node:test';
import assert from 'node:assert/strict';
import { localIntent, translateCommandWords, parseTaskWhen } from '../packages/shared/model.ts';
import { COMMANDS, CHAT, REMINDERS } from './language-cases.mjs';

// The same path the app uses: Franco/Arabic words → English command words → intent.
const understand = s => localIntent(translateCommandWords(s));
const now = new Date(2026, 10, 23, 10, 0); // Monday 10:00 local

test(`${COMMANDS.length} commands in English, Arabic and Franco reach the right action`, () => {
  const wrong = COMMANDS.filter(([s, action, text]) => {
    const r = understand(s);
    return r?.action !== action || (text && !String(r?.text ?? '').toLowerCase().includes(String(text).toLowerCase()));
  }).map(([s]) => `${s} → ${JSON.stringify(understand(s))}`);
  assert.deepEqual(wrong, []);
});

test(`${CHAT.length} questions and chat stay with the brain instead of becoming commands`, () => {
  assert.deepEqual(CHAT.filter(s => understand(s) !== null).map(s => `${s} → ${JSON.stringify(understand(s))}`), []);
});

test(`${REMINDERS.length} reminders get the right title and time in all three languages`, () => {
  const wrong = [];
  for (const [s, title, when] of REMINDERS) {
    const r = understand(s);
    if (r?.action !== 'task') { wrong.push(`${s} → ${JSON.stringify(r)}`); continue; }
    const p = parseTaskWhen(r.text, now), d = p.dueAt ? new Date(p.dueAt) : null;
    let ok = p.title.toLowerCase().includes(String(title).toLowerCase()) && !!d;
    if (ok && when[0] === '+min') ok = Math.round((d.getTime() - now.getTime()) / 60000) === when[1];
    else if (ok) {
      const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(2026, 10, 23)) / 86400000);
      ok = days === when[0] && d.getHours() === when[1] && d.getMinutes() === when[2];
    }
    if (!ok) wrong.push(`${s} → "${p.title}" ${d}`);
  }
  assert.deepEqual(wrong, []);
});
