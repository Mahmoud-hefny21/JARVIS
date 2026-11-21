// Owner-provided sounds (activation, wake-up music, notifications) stored locally in IndexedDB.
// Nothing is downloaded or bundled; without a file the activation falls back to an original synthesized tone.
export type Slot = 'activation' | 'music' | 'notify';
export const SLOTS: { id: Slot; label: string; hint: string }[] = [
  { id: 'activation', label: 'Activation sound', hint: 'Plays the moment JARVIS wakes.' },
  { id: 'music', label: 'Wake-up music', hint: 'Fades in during the wake-up sequence, ducks while JARVIS speaks.' },
  { id: 'notify', label: 'Notification sound', hint: 'Plays before a spoken heads-up.' },
];
type Prefs = { volume: Record<Slot, number>; silent: boolean; bargeIn?: boolean };
const PREFS_KEY = 'jarvis-audio-prefs';
export function prefs(): Prefs {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Prefs | null; if (p?.volume) return p; } catch { /* storage unavailable */ }
  return { volume: { activation: 0.8, music: 0.45, notify: 0.7 }, silent: false };
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
export async function audioName(slot: Slot): Promise<string | null> { try { const v = await tx<{ name: string } | undefined>('readonly', s => s.get(slot)); return v?.name ?? null; } catch { return null; } }

const playing = new Map<Slot, HTMLAudioElement>();
let ducked = false;
function fade(el: HTMLAudioElement, to: number, ms: number) {
  const from = el.volume, start = performance.now();
  return new Promise<void>(done => { const step = (t: number) => { const k = Math.min(1, (t - start) / ms); el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
}
/** Plays a slot; returns false when no file is set or sound is silenced. */
export async function play(slot: Slot, opts: { fadeInMs?: number; loop?: boolean } = {}): Promise<boolean> {
  const p = prefs(); if (p.silent) return false;
  let v: { blob: Blob } | undefined;
  try { v = await tx('readonly', s => s.get(slot)); } catch { return false; }
  if (!v) return false;
  stop(slot, 0);
  const el = new Audio(URL.createObjectURL(v.blob)); el.loop = !!opts.loop;
  const target = p.volume[slot] * (slot === 'music' && ducked ? 0.18 : 1);
  el.volume = opts.fadeInMs ? 0 : target; playing.set(slot, el);
  el.onended = () => { URL.revokeObjectURL(el.src); playing.delete(slot); };
  try { await el.play(); } catch { playing.delete(slot); return false; }
  if (opts.fadeInMs) void fade(el, target, opts.fadeInMs);
  return true;
}
export function stop(slot: Slot, fadeMs = 600) {
  const el = playing.get(slot); if (!el) return; playing.delete(slot);
  const end = () => { el.pause(); URL.revokeObjectURL(el.src); };
  if (fadeMs) void fade(el, 0, fadeMs).then(end); else end();
}
/** Lowers wake-up music while JARVIS speaks so the voice stays clear. */
export function duck(on: boolean) {
  ducked = on; const el = playing.get('music'); if (!el) return;
  void fade(el, prefs().volume.music * (on ? 0.18 : 1), 350);
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
