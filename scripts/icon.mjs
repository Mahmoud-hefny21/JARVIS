// JARVIS app icon: the Workshop core as a round mark (tick ring, segmented arcs, glowing heart), no square tile.
// Windows gets a transparent round icon (icon.ico); the phone gets the same circle on near-black (icon.png),
// because iOS always masks home-screen icons to a rounded square and fills transparency with black.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const sizes = [16, 24, 32, 48, 64, 128, 256];
const cyan = [53, 214, 255], bright = [127, 240, 255], deep = [31, 134, 168], disc = [4, 16, 27];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const TAU = Math.PI * 2;

// Background colour for the phone icon (null = transparent, for Windows).
let ground = null;
function sample(x, y, size) {
  const d = Math.hypot(x, y), turn = ((Math.atan2(y, x) + TAU) % TAU) / TAU;
  if (d > 0.985) return ground ? [...ground, 255] : [0, 0, 0, 0];
  let c = mix([8, 30, 46], disc, Math.min(d / 0.98, 1));
  const fine = size >= 48, mid = size >= 32;
  // Heart glow, as on the PC core.
  c = mix(c, cyan, Math.min(0.6, Math.exp(-(((d - 0.36) / 0.16) ** 2)) * 0.35));
  // Tick ring (every 6 degrees, long every 30) on large sizes; a solid thin ring on small ones.
  if (fine) {
    const tick = turn * 60 % 1, long = Math.round(turn * 60) % 5 === 0;
    if (d > (long ? 0.84 : 0.89) && d < 0.96 && (tick < 0.09 || tick > 0.91)) c = long ? bright : deep;
  } else if (d > 0.9 && d < 0.96) c = deep;
  // Segmented outer arc (like stroke-dasharray 46 18 8 18).
  const seg = turn * 9 % 1;
  if (d > 0.72 && d < (mid ? 0.79 : 0.81) && (!mid || seg < 0.51 || (seg > 0.71 && seg < 0.8))) c = mix(cyan, bright, 0.2);
  // Thin inner ring.
  if (mid && d > 0.6 && d < 0.625) c = mix(c, deep, 0.9);
  // The glowing heart: same gradient as the PC (#d8fbff → #5fe3ff → #0a6d93 → #03202f).
  if (d < 0.44) {
    const t = d / 0.44;
    c = t < 0.26 ? mix([216, 251, 255], [95, 227, 255], t / 0.26) : t < 0.66 ? mix([95, 227, 255], [10, 109, 147], (t - 0.26) / 0.4) : mix([10, 109, 147], [3, 32, 47], (t - 0.66) / 0.34);
  }
  // Edge rim so the circle reads on light wallpapers.
  if (d > 0.965) c = mix(c, deep, 0.7);
  return [...c, 255];
}
function render(size) {
  const ss = 4, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const acc = [0, 0, 0, 0];
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const u = ((x + (i + 0.5) / ss) / size) * 2 - 1, v = ((y + (j + 0.5) / ss) / size) * 2 - 1;
      const [r, g, b, al] = sample(u, v, size);
      acc[0] += r * al; acc[1] += g * al; acc[2] += b * al; acc[3] += al;
    }
    const o = (y * size + x) * 4, al = acc[3];
    if (al) { px[o] = acc[0] / al; px[o + 1] = acc[1] / al; px[o + 2] = acc[2] / al; }
    px[o + 3] = al / (ss * ss);
  }
  return png(size, px);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4), sum = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type), data]); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(td)); return Buffer.concat([len, td, sum]); };
function png(size, px) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const images = sizes.map(render);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => { const e = 6 + 16 * i; header[e] = s % 256; header[e + 1] = s % 256; header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6); header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12); offset += images[i].length; });
mkdirSync('apps/desktop/src-tauri/icons', { recursive: true });
writeFileSync('apps/desktop/src-tauri/icons/icon.ico', Buffer.concat([header, ...images]));
// Phone home-screen icon: same circle, near-black ground (iOS masks to a rounded square and blacks out transparency).
ground = [2, 8, 13];
writeFileSync('apps/desktop/src-tauri/icons/icon.png', render(256));
