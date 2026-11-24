import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskWhen } from '../packages/shared/model.ts';
const now = new Date(2026, 10, 21, 10, 0); // Saturday 10:00 local
const local = iso => { const d = new Date(iso); return [d.getDate(), d.getHours(), d.getMinutes()]; };
test('tomorrow with time becomes a due date and a clean title', () => {
  const r = parseTaskWhen('buy milk tomorrow at 9.', now);
  assert.equal(r.title, 'Buy milk'); assert.deepEqual(local(r.dueAt), [22, 9, 0]);
});
test('am/pm and default morning time', () => {
  assert.deepEqual(local(parseTaskWhen('call mom tomorrow at 9am', now).dueAt), [22, 9, 0]);
  assert.deepEqual(local(parseTaskWhen('pay rent tomorrow', now).dueAt), [22, 9, 0]);
});
test('weekday and relative minutes', () => {
  assert.deepEqual(local(parseTaskWhen('gym next monday', now).dueAt), [23, 9, 0]);
  const r = parseTaskWhen('check oven in 20 minutes', now);
  assert.equal(r.title, 'Check oven'); assert.equal(Date.parse(r.dueAt) - now.getTime(), 20 * 60000);
});
test('time alone today, or tomorrow when already passed', () => {
  assert.deepEqual(local(parseTaskWhen('call the bank at 5', now).dueAt), [21, 17, 0]);
  assert.deepEqual(local(parseTaskWhen('standup at 8:30 am', now).dueAt), [22, 8, 30]);
});
test('Arabic tomorrow and plain text without dates', () => {
  assert.equal(new Date(parseTaskWhen('اشتري لبن بكرة', now).dueAt).getDate(), 22);
  assert.deepEqual(parseTaskWhen('review the release', now), { title: 'Review the release' });
});
import { localIntent } from '../packages/shared/model.ts';
test('spoken punctuation never breaks instant commands', () => {
  for (const said of ['Add task, buy milk tomorrow at 9.', 'Jarvis, add task buy milk tomorrow at 9', 'Please add a task: buy milk tomorrow at 9', 'Hey Jarvis. Add task - buy milk tomorrow at 9'])
    assert.deepEqual(localIntent(said), { action: 'task', text: 'buy milk tomorrow at 9' }, said);
});
import { matchTask } from '../packages/shared/model.ts';
test('delete and complete tasks by voice', () => {
  assert.deepEqual(localIntent('Delete task buy milk.'), { action: 'task-delete', text: 'buy milk' });
  assert.deepEqual(localIntent('Jarvis, remove the milk task'), { action: 'task-delete', text: 'milk' });
  assert.deepEqual(localIntent('delete it'), { action: 'task-delete', text: 'it' });
  assert.deepEqual(localIntent('I finished the report'), { action: 'task-done', text: 'report' });
  assert.equal(localIntent('امسح التاسك بتاع اللبن').action, 'task-delete');
  const tasks = [{ title: 'Buy milk', createdAt: '1' }, { title: 'Write report', createdAt: '2' }];
  assert.equal(matchTask('milk', tasks).title, 'Buy milk');
  assert.equal(matchTask('it', tasks).title, 'Write report');
  assert.equal(matchTask('walk the dog', tasks), null);
});
test('natural window placement across monitors', () => {
  const cases = { 'Switch Chrome in monitor two.': 'chrome|move|two', 'Chrome to monitor one': 'chrome|move|one', 'put this tab on screen 1': 'chrome|move|1',
    'Jarvis, move VS Code to the left monitor': 'vscode|move|left', 'send the browser to display three': 'chrome|move|three', 'open chrome on monitor two': 'chrome|open|two', 'Throw Chrome on the second screen.': 'chrome|move|two', 'move this tab to the main screen': 'chrome|move|one' };
  for (const [said, want] of Object.entries(cases)) if (want) assert.equal(localIntent(said)?.text, want, said);
});
import { headsUp, onlineGreeting } from '../packages/shared/model.ts';
test('proactive heads-ups are spoken once per stage', () => {
  const now = new Date(2026, 10, 21, 19, 40);
  const recs = [{ id: 'a', kind: 'task', title: 'Go to Arabella Plaza', dueAt: new Date(now.getTime() + 4 * 60000).toISOString() },
    { id: 'b', kind: 'event', title: 'Team call', dueAt: new Date(now.getTime() + 9 * 60000).toISOString() },
    { id: 'c', kind: 'task', title: 'Later', dueAt: new Date(now.getTime() + 60 * 60000).toISOString() }];
  const warned = new Set();
  const first = headsUp(recs, now, warned);
  assert.deepEqual(first.map(x => x.text), ['Sir, Go to Arabella Plaza in 4 minutes.', 'Sir, Team call in 9 minutes.']);
  first.forEach(x => warned.add(x.key));
  assert.deepEqual(headsUp(recs, now, warned), []);
  assert.equal(headsUp(recs, new Date(now.getTime() + 4 * 60000), warned)[0].text, "Sir, it's time. Go to Arabella Plaza.");
});
test('online greeting sounds like a briefing', () => {
  const g = onlineGreeting('Sir', 20, [{ title: 'Buy milk' }], null, { temperature: 27.6, description: 'Partly cloudy' });
  assert.equal(g, 'Good evening, sir. All systems are online. It\'s 28 degrees and partly cloudy. You have 1 open task: Buy milk.');
});
test('number words from speech-to-text', () => {
  const r = parseTaskWhen('stretch break in two minutes', now);
  assert.equal(r.title, 'Stretch break'); assert.equal(Date.parse(r.dueAt) - now.getTime(), 2 * 60000);
  assert.equal(Date.parse(parseTaskWhen('call mom in half an hour', now).dueAt) - now.getTime(), 30 * 60000);
  assert.deepEqual(local(parseTaskWhen('gym tomorrow at seven', now).dueAt), [22, 19, 0]);
});
test('"show me" requests bring the hologram forward', () => {
  for (const [said, want] of [['Show me my tasks', 'tasks'], ["What's next?", 'next'], ['What do I have today?', 'next'], ['Read my emails', 'comms'], ['show the weather', 'weather'], ['Jarvis, pull up my schedule', 'next']])
    assert.deepEqual(localIntent(said), { action: 'pod', text: want }, said);
});
test('no heads-up for a task created a moment ago', () => {
  const now = new Date(2026, 10, 21, 22, 0);
  const rec = [{ id: 'w', kind: 'task', title: 'Drink water', createdAt: new Date(now.getTime() - 10000).toISOString(), dueAt: new Date(now.getTime() + 120000).toISOString() }];
  assert.deepEqual(headsUp(rec, now, new Set()), []);
  assert.equal(headsUp(rec, new Date(now.getTime() + 120000), new Set())[0].text, "Sir, it's time. Drink water.");
});
test('wake-up and "what am I working on" phrases', () => {
  assert.deepEqual(localIntent('Wake up, Jarvis.'), { action: 'wake' });
  assert.deepEqual(localIntent('Jarvis, wake up!'), { action: 'wake' });
  assert.deepEqual(localIntent('JARVIS'), { action: 'wake', text: 'instant' });
  for (const said of ['What am I working on?', 'Jarvis, ana kont ba3mel eh?', 'what was I doing', 'انا كنت بعمل ايه']) assert.deepEqual(localIntent(said), { action: 'working-on' }, said);
  assert.equal(localIntent('Jarvis, open chrome').action, 'chrome');
});
import { siteUrl } from '../packages/shared/model.ts';
test('open websites by name, and mute', () => {
  for (const said of ['Open WhatsApp for me.', 'Open WhatsApp web from my Chrome.', 'open my whatsapp web', 'Jarvis, open WhatsApp web please'])
    assert.deepEqual(localIntent(said), { action: 'site', text: 'https://web.whatsapp.com' }, said);
  assert.equal(localIntent('open youtube').text, 'https://www.youtube.com');
  assert.equal(localIntent('open chrome').action, 'chrome');
  assert.equal(siteUrl('some unknown thing'), null);
  for (const said of ['Mute.', 'Jarvis, mute']) assert.deepEqual(localIntent(said), { action: 'mute' }, said);
  for (const said of ['stop talking', 'shut up', 'اسكت']) assert.deepEqual(localIntent(said), { action: 'hush' }, said);
});
import { translateCommandWords } from '../packages/shared/model.ts';
test('Franco and Arabic command words', () => {
  assert.equal(translateCommandWords('efta7 whatsapp'), 'open whatsapp');
  assert.equal(translateCommandWords('Jarvis, eftahly youtube'), 'open youtube');
  assert.equal(localIntent(translateCommandWords('افتح يوتيوب')).text, 'https://www.youtube.com');
  assert.equal(translateCommandWords('jarvis aft7 spotify'), 'open spotify');
  assert.equal(translateCommandWords('افتح يوتيوب'), 'open يوتيوب');
  assert.equal(translateCommandWords('shaghal el spotify'), 'open spotify');
  assert.equal(translateCommandWords('fakarny a2ra el ketab bokra'), 'remind me to a2ra ketab bokra');
  assert.equal(localIntent(translateCommandWords('efta7 el whatsapp web')).text, 'https://web.whatsapp.com');
});
