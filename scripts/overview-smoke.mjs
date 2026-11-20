import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const profile = path.resolve('.build/qa', 'overview-' + crypto.randomUUID());
await mkdir(profile, { recursive: true });
await mkdir('test-results', { recursive: true });
await mkdir('docs/verification', { recursive: true });
const child = spawn(path.resolve('.build/target/release/jarvis-desktop.exe'), [], {
  windowsHide: true, stdio: 'ignore', env: {
    ...process.env, JARVIS_ENABLE_TEST_PROFILE: '1', JARVIS_QA_DATA_DIR: profile,
    WEBVIEW2_USER_DATA_FOLDER: path.join(profile, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9225 --remote-debugging-address=127.0.0.1',
    TEMP: path.resolve('.build/tmp'), TMP: path.resolve('.build/tmp'),
  },
});
let browser, spawnError;
child.once('error', error => { spawnError = error; });
const report = { at: new Date().toISOString(), scope: 'optimized Windows release, isolated UUID profile', results: {} };
try {
  const deadline = Date.now() + 40_000;
  for (;;) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('App exited before the isolated profile opened; close any normal JARVIS instance first.');
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9225', { timeout: 1000 }); break; }
    catch (error) { if (Date.now() > deadline) throw error; await new Promise(resolve => setTimeout(resolve, 150)); }
  }
  const page = browser.contexts()[0].pages()[0];
  await page.locator('main h1').waitFor();
  await access(path.join(profile, 'jarvis.db'));
  const isFullscreen = () => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_fullscreen', { label: 'main' }));
  async function checkPanels() {
    await expect.poll(() => page.evaluate(() => {
      const viewport = document.querySelector('.overview-viewport').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.dashboard-stack > .panel')];
      return cards.length === 8 && cards.every(card => {
        const box = card.getBoundingClientRect();
        return box.top >= viewport.top - 1 && box.left >= viewport.left - 1 && box.bottom <= viewport.bottom + 1 && box.right <= viewport.right + 1 && card.scrollHeight <= card.clientHeight + 1 && card.scrollWidth <= card.clientWidth + 1;
      }) && document.documentElement.scrollHeight <= innerHeight + 1;
    })).toBe(true);
  }
  await checkPanels();
  report.results.windowedOverviewFits = true;
  await page.screenshot({ path: 'test-results/overview-native-windowed.png' });
  await page.getByRole('button', { name: 'Enter overview fullscreen', exact: true }).click();
  await expect.poll(isFullscreen).toBe(true);
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit overview fullscreen', exact: true })).toBeVisible();
  await checkPanels();
  report.results.nativeFullscreen = true;
  report.results.sidebarHidden = true;
  await page.screenshot({ path: 'test-results/overview-native-fullscreen.png' });
  await page.keyboard.press('Escape');
  await expect.poll(isFullscreen).toBe(false);
  await expect(page.locator('.sidebar')).toBeVisible();
  report.results.escapeRestoresSidebar = true;
  await page.getByRole('button', { name: 'Enter overview fullscreen', exact: true }).click();
  await expect.poll(isFullscreen).toBe(true);
  await page.getByRole('button', { name: 'Exit overview fullscreen', exact: true }).click();
  await expect.poll(isFullscreen).toBe(false);
  await expect(page.locator('.sidebar')).toBeVisible();
  assert.equal(await page.locator('[data-action="overview-fullscreen"]').getAttribute('aria-pressed'), 'false');
  report.results.buttonRestoresSidebar = true;
  await checkPanels();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error);
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      report.layout = await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight], document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        cards: [...document.querySelectorAll('.dashboard-stack > .panel')].map(card => ({
          title: card.querySelector('h2')?.textContent, client: [card.clientWidth, card.clientHeight], scroll: [card.scrollWidth, card.scrollHeight], box: card.getBoundingClientRect().toJSON(),
        })),
      })).catch(() => null);
      await page.screenshot({ path: 'test-results/overview-native-failure.png' }).catch(() => {});
    }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  child.kill();
  if (browser) await browser.close().catch(() => {});
  await writeFile('docs/verification/overview-native.json', JSON.stringify(report, null, 2) + '\n');
}
