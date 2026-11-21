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
