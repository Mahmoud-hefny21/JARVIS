// Owner-provided sounds (activation, wake-up music, notifications) stored locally in IndexedDB.
// Nothing is downloaded or bundled; without a file the activation falls back to an original synthesized tone.
import { command, native } from './bridge';
export type Slot = 'wake' | 'activation' | 'music' | 'notify' | 'adhan';
export type WakeMode = 'cinematic' | 'instant' | 'silent';
export const SLOTS: { id: Slot; label: string; hint: string }[] = [
  { id: 'wake', label: 'Cinematic wake-up sound', hint: 'Plays on “Wake up, JARVIS”; the greeting follows the cue.' },
  { id: 'activation', label: 'Activation sound', hint: 'Plays the moment JARVIS wakes.' },
  { id: 'music', label: 'Wake-up music', hint: 'Fades in during the wake-up sequence, ducks while JARVIS speaks.' },
  { id: 'notify', label: 'Notification sound', hint: 'Plays before a spoken heads-up.' },
  { id: 'adhan', label: 'Adhan (call to prayer)', hint: 'Plays at each prayer time for Al-Rehab. Choose a recording you like.' },
];
type Prefs = { volume: Record<Slot, number>; silent: boolean; bargeIn?: boolean; mode?: WakeMode; greetAtMs?: number };
const PREFS_KEY = 'jarvis-audio-prefs';
export function prefs(): Prefs {
  const base: Prefs = { volume: { wake: 0.9, activation: 0.8, music: 0.45, notify: 0.7, adhan: 0.85 }, silent: false, mode: 'cinematic', greetAtMs: 1300 };
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Prefs | null; if (p?.volume) return { ...base, ...p, volume: { ...base.volume, ...p.volume } }; } catch { /* storage unavailable */ }
  return base;
}
export function savePrefs(p: Prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } }

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const r = indexedDB.open('jarvis-audio', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db(); return new Promise((resolve, reject) => { const r = run(d.transaction('files', mode).objectStore('files')); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function importAudio(slot: Slot, file: File) {
  if (!/^audio\//.test(file.type) && !/\.(mp3|wav|ogg|m4a)$/i.test(file.name)) throw new Error('Choose an MP3, WAV, OGG or M4A file.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Audio files are limited to 40 MB.');
  await tx('readwrite', s => s.put({ name: file.name, blob: file }, slot));
}
export async function removeAudio(slot: Slot) { await tx('readwrite', s => s.delete(slot)); }
export async function audioName(slot: Slot): Promise<string | null> {
  try { const v = await tx<{ name: string } | undefined>('readonly', s => s.get(slot)); if (v?.name) return v.name; } catch { /* fall through */ }
  return (await nativeAsset(slot)) ? `${slot}.wav (JARVIS data folder)` : null;
}
/** Files prepared on this PC (scripts/prepare-wake-audio.mjs) live in the app data folder, outside the repo. */
const nativeCache = new Map<Slot, string | null>();
async function nativeAsset(slot: Slot): Promise<string | null> {
  if (!native) return null;
  // The app's CSP allows media only from blob: (not data:), so the file is turned into a Blob URL once.
  if (!nativeCache.has(slot)) { try { const dataUrl = await command<string | null>('sound_asset', { slot }); nativeCache.set(slot, dataUrl ? toBlobUrl(dataUrl) : null); } catch (error) { lastError = 'sound_asset: ' + String(error); nativeCache.set(slot, null); } }
  return nativeCache.get(slot) ?? null;
}

const playing = new Map<Slot, HTMLAudioElement>();
/** Why the last playback failed (shown in the activity log for diagnosis). */
export let lastError = '';
let ducked = false;
function fade(el: HTMLAudioElement, to: number, ms: number) {
  const from = el.volume, start = performance.now();
  return new Promise<void>(done => { const step = (t: number) => { const k = Math.min(1, (t - start) / ms); el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
}
/** Plays a slot; returns false when no file is set or sound is silenced. */
export async function play(slot: Slot, opts: { fadeInMs?: number; loop?: boolean } = {}): Promise<boolean> {
  const p = prefs(); if (p.silent) return false;
  let v: { blob: Blob } | undefined;
  try { v = await tx('readonly', s => s.get(slot)); } catch { v = undefined; }
  const src = v ? URL.createObjectURL(v.blob) : await nativeAsset(slot);
  if (!src) return false;
  stop(slot, 0); // never two copies of the same sound at once
  const el = new Audio(src); el.loop = !!opts.loop;
  const target = p.volume[slot] * ((slot === 'music' || slot === 'wake') && ducked ? 0.18 : 1);
  el.volume = opts.fadeInMs ? 0 : target; playing.set(slot, el);
  el.onended = () => { if (v && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); if (playing.get(slot) === el) playing.delete(slot); if (slot === 'wake') document.documentElement.style.setProperty('--audio-level', '0'); };
  try { await el.play(); } catch (error) { lastError = `play(${slot}): ` + String(error); playing.delete(slot); return false; }
  if (slot === 'wake') meter(el);
  if (opts.fadeInMs) void fade(el, target, opts.fadeInMs);
  return true;
}
export function stop(slot: Slot, fadeMs = 600) {
  const el = playing.get(slot); if (!el) return; playing.delete(slot);
  const end = () => { el.pause(); if (![...nativeCache.values()].includes(el.src) && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); };
  if (fadeMs) void fade(el, 0, fadeMs).then(end); else end();
}
/** Lowers wake-up music while JARVIS speaks so the voice stays clear. */
export function duck(on: boolean) {
  ducked = on;
  for (const slot of ['music', 'wake'] as Slot[]) { const el = playing.get(slot); if (el) void fade(el, prefs().volume[slot] * (on ? 0.18 : 1), 350); }
}
/** Original synthesized activation tone, used when no activation file is set. */
export function synthTone() {
  if (prefs().silent) return;
  try {
    const ctx = new AudioContext(), now = ctx.currentTime, gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.25 * prefs().volume.activation, now + 0.04); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    gain.connect(ctx.destination);
    for (const [f, d] of [[440, 0], [660, 0.09], [990, 0.18]] as const) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, now + d); o.frequency.exponentialRampToValueAtTime(f * 1.5, now + d + 0.5); o.connect(gain); o.start(now + d); o.stop(now + 0.95); }
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* audio unavailable */ }
}

/** Drives the core's --audio-level from the wake sound's real output level while it plays. */
let meterCtx: AudioContext | null = null;
function meter(el: HTMLAudioElement) {
  try {
    meterCtx ??= new AudioContext();
    const src = meterCtx.createMediaElementSource(el), an = meterCtx.createAnalyser(); an.fftSize = 512;
    src.connect(an); an.connect(meterCtx.destination);
    const data = new Uint8Array(an.fftSize);
    const tick = () => { if (el.paused || el.ended) { document.documentElement.style.setProperty('--audio-level', '0'); return; }
      an.getByteTimeDomainData(data); let sum = 0; for (const v of data) sum += (v - 128) ** 2;
      document.documentElement.style.setProperty('--audio-level', Math.min(1, Math.sqrt(sum / data.length) / 40).toFixed(3)); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  } catch { /* metering is decorative */ }
}
export function isPlaying(slot: Slot) { return playing.has(slot); }

function toBlobUrl(dataUrl: string): string {
  const [head, b64] = dataUrl.split(',', 2), mime = /data:([^;]+)/.exec(head)?.[1] ?? 'audio/wav';
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
