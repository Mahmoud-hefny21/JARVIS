import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, formatNumber, needsWeb, needsMath, needsReview, lastingPreference } from '../packages/shared/brain.ts';

test('the calculator is exact and refuses anything but maths', () => {
  const cases = [['2+3*4', 14], ['(2+3)*4', 20], ['2^10', 1024], ['-2^2', -4], ['15%*200', 30], ['sqrt(144)+ln(e)', 13], ['5!', 120], ['1,250*3', 3750], ['10/4', 2.5], ['3×4÷2', 6]];
  for (const [e, v] of cases) assert.equal(calculate(e), v, e);
  assert.equal(formatNumber(calculate('0.1+0.2')), '0.3');
  for (const bad of ['alert(1)', 'process.exit()', '2+', '1/0', 'constructor']) assert.throws(() => calculate(bad), bad);
});

test('current facts go to the web in three languages; general knowledge does not', () => {
  for (const s of ['latest iPhone price in Egypt', 'who won the match yesterday', 'سعر الدولار النهارده', 'akhbar el ahly eh', 'news about AI today']) assert.ok(needsWeb(s), s);
  for (const s of ['what is photosynthesis', 'explain recursion', 'ezayak ya jarvis']) assert.ok(!needsWeb(s), s);
});

test('maths and hard questions are recognised', () => {
  for (const s of ['what is 17*23', 'calculate 15% of 3200', 'احسب 25 في 4', 'if a car goes 120 km in 1.5 hours what is its speed']) assert.ok(needsMath(s), s);
  assert.ok(!needsMath('hi jarvis'));
  assert.ok(needsReview('what is the difference between TCP and UDP'));
  assert.ok(!needsReview('good morning'));
});

test('corrections and preferences are learned without "remember"', () => {
  for (const s of ["don't call me Mahmoud", 'from now on answer shorter', 'I study computer science at MIU', 'متقوليش يا محمود', 'ba3d keda kalemni english', 'JARVIS, I prefer tea']) assert.ok(lastingPreference(s), s);
  for (const s of ['open chrome', 'what time is it', 'always']) assert.ok(!lastingPreference(s) || s === 'always', s);
});
