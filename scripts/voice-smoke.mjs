import { approvedIpc } from './native-approval.mjs';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { defaults } from '../packages/shared/model.ts';

const profile = path.resolve('.build/qa', crypto.randomUUID());
await mkdir(profile, { recursive: true });
await mkdir('docs/verification', { recursive: true });
const executable = path.resolve('.build/target/release/jarvis-desktop.exe');
const env = {
  ...process.env,
  JARVIS_ENABLE_TEST_PROFILE: '1',
  JARVIS_QA_DATA_DIR: profile,
  WEBVIEW2_USER_DATA_FOLDER: path.join(profile, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9227 --remote-debugging-address=127.0.0.1',
  TEMP: path.resolve('.build/tmp'),
  TMP: path.resolve('.build/tmp'),
};
let child, browser, page, server;
const report = { at: new Date().toISOString(), profile: 'isolated UUID QA', engine: 'Piper standalone', results: {} };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let generatedRequest;
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    generatedRequest = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'You were reviewing the locally stored desktop assistant project yesterday, sir.' } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  child = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
  let spawnError;
  child.once('error', error => { spawnError = error; });
  const deadline = Date.now() + 45000;
  for (;;) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Isolated JARVIS exited during startup (${child.exitCode}).`);
    try {
      if (!browser) browser = await chromium.connectOverCDP('http://127.0.0.1:9227', { timeout: 3000 });
      page = browser.contexts()[0]?.pages()[0];
      if (page && await page.locator('main h1').count()) break;
    } catch (error) {
      if (error.code !== 'ECONNREFUSED' && error.name !== 'TimeoutError' && !/Target closed|Execution context was destroyed|Cannot find context/i.test(String(error))) throw error;
    }
    if (Date.now() > deadline) throw new Error('Timed out waiting for the isolated JARVIS window and page.');
    await pause(200);
  }
  const prefs = {
    ...defaults,
    ttsEngine: 'piper',
    piperExecutable: path.resolve('local-voice/runtime/piper/piper.exe'),
    piperModel: path.resolve('local-voice/jarvis-high.onnx'),
    piperConfig: path.resolve('local-voice/jarvis-high.onnx.json'),
    language: 'en-GB',
    speak: true,
    quietStart: 0,
    quietEnd: 0,
    aiUrl: `http://127.0.0.1:${server.address().port}/v1`,
    aiModel: 'isolated-voice-fixture',
  };
  await approvedIpc(page, child, 'settings_save', { settings: prefs });
  const say = async (label, text) => {
    const result = await page.evaluate(({ text }) => window.__TAURI_INTERNALS__.invoke('speak', { text, language: 'en-GB', voice: '' }), { text });
    assert.equal(result.engine, 'piper', `${label}: Piper was not used`);
    assert.equal(result.played, true, `${label}: playback did not complete`);
    assert.ok(result.audioBytes > 44 && result.sampleRate === 22050);
    report.results[label] = result;
    return result;
  };
  for (const [label, text] of [
    ['greeting', 'Good morning, sir.'],
    ['acknowledgement', 'Yes, sir.'],
    ['actionConfirmation', "Of course. I've opened your project."],
  ]) await say(label, text);
  const prompt = 'Describe why an offline assistant can be useful.';
  const generated = await page.evaluate(({ prompt }) => window.__TAURI_INTERNALS__.invoke('ai_chat', {
    messages: [{ role: 'user', content: prompt }], memories: [],
  }), { prompt });
  assert.equal(generated, 'You were reviewing the locally stored desktop assistant project yesterday, sir.');
  assert.ok(generatedRequest?.messages?.some(message => message.content === prompt));
  report.results.dynamicResponse = {
    source: 'Synthetic local OpenAI-compatible fixture; production model/provider unavailable.',
    text: generated,
    playback: await say('dynamicResponsePlayback', generated),
  };
  report.results.ai = 'Synthetic local HTTP fixture only; no production model/provider configured.';
  await writeFile('docs/verification/voice-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error);
  await writeFile('docs/verification/voice-smoke.json', JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (child) child.kill();
  if (browser) await browser.close().catch(() => {});
  if (server) { server.closeAllConnections(); server.close(); }
}
