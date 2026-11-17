// Generates the PWA PNG icons procedurally (no image tooling needed).
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const smooth = (edge, d, w) => Math.max(0, Math.min(1, (edge - d) / w + 0.5));

// scale < 1 shrinks the artwork into the maskable safe zone.
function art(scale, roundedBg) {
  return (u, v) => {
    const x = (u - 0.5) / scale, y = (v - 0.5) / scale;
    let col = mix([5, 8, 22], [13, 27, 61], v);
    let alpha = 255;
    if (roundedBg) {
      const r = 0.22, ax = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), ay = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      alpha = Math.round(255 * smooth(r, Math.hypot(ax, ay), 0.01));
    }
    // orbit ring (rotated ellipse)
    const a = -0.44, cx = x * Math.cos(a) - y * Math.sin(a), cy = x * Math.sin(a) + y * Math.cos(a);
    const e = Math.hypot(cx / 0.38, cy / 0.17);
    col = mix(col, [122, 162, 255], smooth(0.05, Math.abs(e - 1), 0.03) * 0.95);
    // sun with glow
    const d = Math.hypot(x, y);
    col = mix(col, [255, 159, 74], Math.min(1, Math.max(0, 0.35 - d) * 1.4));
    col = mix(col, mix([255, 231, 168], [255, 159, 74], d / 0.14), smooth(0.14, d, 0.01));
    // planets
    const p1 = Math.hypot(x - 0.3, y + 0.16);
    col = mix(col, [255, 122, 217], smooth(0.07, p1, 0.01));
    const p2 = Math.hypot(x + 0.3, y - 0.16);
    col = mix(col, [122, 255, 210], smooth(0.055, p2, 0.01));
    return [...col, alpha];
  };
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, art(1, true)));
writeFileSync('public/icons/icon-512.png', png(512, art(1, true)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, art(0.72, false)));
console.log('icons written to public/icons');
