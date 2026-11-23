import test from 'node:test';
import assert from 'node:assert/strict';
import { prayerTimes, nextPrayer, qibla, hijri } from '../packages/shared/prayer.ts';

// Reference: Aladhan API, method 5 (Egyptian General Authority of Survey), Al-Rehab City 30.06 N 31.49 E.
const minutes = d => d.getHours() * 60 + d.getMinutes();
const at = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
for (const [label, date, ref] of [
  ['winter, 23 Nov 2026', new Date(2026, 10, 23), { fajr: '04:55', sunrise: '06:26', dhuhr: '11:40', asr: '14:36', maghrib: '16:55', isha: '18:16' }],
  ['summer with Egypt DST, 1 Jul 2026', new Date(2026, 6, 1), { fajr: '04:11', sunrise: '05:56', dhuhr: '12:58', asr: '16:34', maghrib: '19:59', isha: '21:32' }],
]) test(`prayer times for Al-Rehab match the Egyptian method within a minute (${label})`, () => {
  const t = prayerTimes(date, 30.06, 31.49);
  for (const [name, hm] of Object.entries(ref)) assert.ok(Math.abs(minutes(t[name]) - at(hm)) <= 1, `${name}: ${t[name].toTimeString().slice(0, 5)} vs ${hm}`);
});

test('the next prayer after Isha is tomorrow\'s Fajr; Qibla and Hijri date are right', () => {
  const next = nextPrayer(new Date(2026, 10, 23, 20, 0), 30.06, 31.49);
  assert.equal(next.id, 'fajr');
  assert.equal(next.at.getDate(), 24);
  assert.equal(nextPrayer(new Date(2026, 10, 23, 12, 0), 30.06, 31.49).id, 'asr');
  assert.ok(Math.abs(qibla(30.06, 31.49) - 137) < 1.5);
  const h = hijri(new Date(2026, 10, 23));
  assert.equal(h.day, 13); assert.equal(h.month, 6);
});

import { copticEaster, upcomingOccasions } from '../packages/shared/prayer.ts';
test('Coptic Easter, Sham el-Nessim and Islamic occasions land on the expected dates', () => {
  assert.equal(copticEaster(2026).toDateString(), new Date(2026, 3, 12).toDateString());
  assert.equal(copticEaster(2027).toDateString(), new Date(2027, 4, 2).toDateString());
  const list = upcomingOccasions(new Date(2026, 10, 23));
  const on = name => list.find(o => o.en === name)?.date.toDateString();
  assert.equal(on('Sham el-Nessim'), new Date(2027, 4, 3).toDateString());
  assert.equal(on('Ramadan begins'), new Date(2027, 1, 8).toDateString());
  assert.equal(on('Eid al-Adha'), new Date(2027, 4, 16).toDateString());
});
