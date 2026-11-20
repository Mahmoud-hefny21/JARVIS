import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/ui', workers: 1, timeout: 30000, globalSetup: './scripts/ui-server.mjs', use: { baseURL: 'http://127.0.0.1:1420', channel: 'chrome', headless: true, trace: 'retain-on-failure' }, reporter: [['list'], ['json',{outputFile:'test-results/ui-results.json'}]] });
