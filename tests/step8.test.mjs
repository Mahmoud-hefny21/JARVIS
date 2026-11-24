import test from 'node:test';
import assert from 'node:assert/strict';
import { localIntent, translateCommandWords } from '../packages/shared/model.ts';

const understand = s => localIntent(translateCommandWords(s));
const CASES = [
  // PC control
  ['set brightness to 70', 'pc', 'brightness:70'], ['brightness 40%', 'pc', 'brightness:40'], ['الاضاءة ٣٠', 'pc', 'brightness:30'],
  ['increase brightness', 'pc', 'brightness:up'], ['wati el edaaya', 'pc', 'brightness:down'], ['وطي الاضاءة', 'pc', 'brightness:down'],
  ['dark mode', 'pc', 'dark:on'], ['turn on dark mode', 'pc', 'dark:on'], ['الوضع الليلي', 'pc', 'dark:on'], ['light mode', 'pc', 'dark:off'],
  ['turn off wifi', 'pc', 'wifi:off'], ['wifi on', 'pc', 'wifi:on'], ['bluetooth off', 'pc', 'bluetooth:off'], ['شغل البلوتوث', 'pc', 'bluetooth:on'], ['2fel el wifi', 'pc', 'wifi:off'], ['اقفل الواي فاي', 'pc', 'wifi:off'],
  ['take a screenshot', 'pc', 'screenshot'], ['screenshot', 'pc', 'screenshot'], ['سكرين شوت', 'pc', 'screenshot'],
  ['tidy my downloads', 'pc', 'tidy-downloads'], ['رتب الداونلودز', 'pc', 'tidy-downloads'], ['clean temp files', 'pc', 'clean-temp'], ['free up space', 'pc', 'clean-temp'], ['نضف الجهاز', 'pc', 'clean-temp'],
  ['find my file called physics notes', 'find-file', 'physics notes'], ['find the calculus pdf', 'find-file', 'calculus'], ['دور على ملف الفيزيا', 'find-file', 'الفيزيا'], ['open file cv', 'open-file', 'cv'],
  // News and media
  ['news', 'news', ''], ['what\'s the news', 'news', ''], ['news about AI', 'news', 'ai'], ['الاخبار', 'news', ''], ['اخبار الاهلي', 'news', 'الاهلي'], ['akhbar el ahly', 'news', 'ahly'],
  ['summarize this page', 'summarize-page'], ['summarize this video', 'summarize-page'], ['لخص الصفحة', 'summarize-page'],
  ['play nogoum fm radio', 'play', 'nogoum fm radio'], ['play amr diab', 'play', 'amr diab'], ['شغل عمرو دياب', 'play', 'عمرو دياب'], ['play some lofi', 'play', 'lofi'],
  // Money
  ['i spent 200 on food', 'expense', '200|food'], ['spent 50 pounds on uber', 'expense', '50|uber'], ['sraft 150 3la akl', 'expense', '150|akl'], ['صرفت ٣٠٠ على مواصلات', 'expense', '300|مواصلات'],
  ['how much did i spend this month', 'spending'], ['صرفت كام', 'spending'], ['my budget is 5000', 'budget', '5000'], ['الميزانية ٤٠٠٠', 'budget', '4000'],
  ['add subscription netflix 200 on the 5th', 'subscription', 'netflix|200|5'], ['my subscriptions', 'subscriptions'],
  ['i want to save 10000 for a laptop', 'goal', '10000|laptop'], ['عايز احوش ٥٠٠٠ عشان موبايل', 'goal', '5000|موبايل'], ['i saved 500', 'saved', '500|'], ['حوشت ٢٠٠', 'saved', '200|'], ['my savings', 'goals'],
];

test(`${CASES.length} PC, news, media and money commands in three languages`, () => {
  const wrong = CASES.filter(([s, action, text]) => {
    const r = understand(s);
    return r?.action !== action || (text !== undefined && String(r?.text ?? '').toLowerCase() !== text.toLowerCase());
  }).map(([s]) => `${s} → ${JSON.stringify(understand(s))}`);
  assert.deepEqual(wrong, []);
});

test('these phrases are not hijacked by the new commands', () => {
  for (const s of ['play', 'pause', 'next song', 'what is the news value of this', 'find me a good restaurant nearby']) {
    const r = understand(s);
    assert.ok(!['pc', 'expense', 'find-file'].includes(r?.action), `${s} → ${JSON.stringify(r)}`);
  }
});
