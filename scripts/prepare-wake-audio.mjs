// Prepares an owner-provided wake-up recording for the cinematic wake sequence.
// Usage: node scripts/prepare-wake-audio.mjs <input.mp3|wav> [startSec] [endSec]
// The original is copied unchanged; a trimmed WAV (exact samples, short fades only) is written next to it
// in %APPDATA%\com.jarvis.personal\sounds. Nothing is written into the repository.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input || !fs.existsSync(input)) { console.error('Input audio file not found'); process.exit(1); }
const startArg = process.argv[3] ? Number(process.argv[3]) : null;
const endArg = process.argv[4] ? Number(process.argv[4]) : null;
const dir = path.join(process.env.APPDATA, 'com.jarvis.personal', 'sounds');
fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
const original = path.join(dir, 'original', path.basename(input));
fs.copyFileSync(input, original);

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(async ({ b64, startArg, endArg }) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
  const sr = buf.sampleRate, chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  // Onset: first sample above -60 dBFS; keep 20 ms of pre-roll so the attack is not clipped.
  let onset = 0; while (onset < chans[0].length && Math.abs(chans[0][onset]) < 0.001) onset++;
  const start = Math.max(0, startArg != null ? Math.round(startArg * sr) : onset - Math.round(0.02 * sr));
  const end = Math.min(chans[0].length, endArg != null ? Math.round(endArg * sr) : chans[0].length);
  const len = end - start, fadeIn = Math.round(0.01 * sr), fadeOut = Math.round(0.25 * sr);
  const pcm = new Int16Array(len * chans.length);
  for (let i = 0; i < len; i++) {
    const g = Math.min(1, i / fadeIn, (len - i) / fadeOut);
    for (let c = 0; c < chans.length; c++) pcm[i * chans.length + c] = Math.max(-32768, Math.min(32767, Math.round(chans[c][start + i] * g * 32767)));
  }
  return { sr, channels: chans.length, duration: buf.duration, onset: onset / sr, start: start / sr, end: end / sr, pcm: Array.from(new Uint8Array(pcm.buffer)) };
}, { b64: fs.readFileSync(input).toString('base64'), startArg, endArg });
await browser.close();

const data = Buffer.from(result.pcm), header = Buffer.alloc(44);
const blockAlign = result.channels * 2;
header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(result.channels, 22);
header.writeUInt32LE(result.sr, 24); header.writeUInt32LE(result.sr * blockAlign, 28); header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(data.length, 40);
fs.writeFileSync(path.join(dir, 'wake.wav'), Buffer.concat([header, data]));
const timing = { source: path.basename(input), sourceDuration: +result.duration.toFixed(3), firstSound: +result.onset.toFixed(4),
  trimStart: +result.start.toFixed(4), trimEnd: +result.end.toFixed(4), processedDuration: +(result.end - result.start).toFixed(3),
  sampleRate: result.sr, channels: result.channels, fadeInMs: 10, fadeOutMs: 250 };
fs.writeFileSync(path.join(dir, 'wake-timing.json'), JSON.stringify(timing, null, 2));
console.log(JSON.stringify(timing, null, 2));
console.log('Original kept at', original);
