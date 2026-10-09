#!/usr/bin/env node
// Erzeugt die App-Icons (PNG 192/512, maskierbar 512, SVG) ohne externe Bibliotheken.
// Aufruf: node tools/make-icons.js

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [13, 17, 23];
const GLASS = [230, 237, 243];
const LIQUID = [57, 197, 187];
const DROP = [95, 224, 213];

// Geometrie im Einheitsquadrat (0..1)
const NECK = [[0.425, 0.2], [0.575, 0.2], [0.575, 0.43], [0.425, 0.43]];
const RIM = [[0.38, 0.165], [0.62, 0.165], [0.62, 0.215], [0.38, 0.215]];
const BODY = [[0.425, 0.42], [0.575, 0.42], [0.81, 0.79], [0.79, 0.825], [0.21, 0.825], [0.19, 0.79]];
const INNER = [[0.455, 0.45], [0.545, 0.45], [0.765, 0.79], [0.755, 0.795], [0.245, 0.795], [0.235, 0.79]];
const LIQ_Y = 0.6;
const BUBBLES = [[0.44, 0.7, 0.022], [0.56, 0.66, 0.016], [0.5, 0.74, 0.012]];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Farbe an Position (u, v) im Inhaltsbereich; null = Hintergrund. */
function shade(u, v) {
  for (const [bx, by, br] of BUBBLES) if ((u - bx) ** 2 + (v - by) ** 2 <= br * br) return DROP;
  if (inPoly(u, v, INNER)) return v >= LIQ_Y ? LIQUID : BG;
  if (inPoly(u, v, BODY) || inPoly(u, v, NECK) || inPoly(u, v, RIM)) return GLASS;
  return null;
}

function render(size, { maskable }) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.78 : 1;
  const off = (1 - scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = (x + (sx + 0.5) / ss) / size;
          const fy = (y + (sy + 0.5) / ss) / size;
          const bgInside = maskable ? true : inRoundRect(fx, fy, 0.2);
          if (!bgInside) continue;
          const c = shade((fx - off) / scale, (fy - off) / scale) || BG;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const cov = a / 255;
      px[i] = cov ? Math.round(r / cov) : 0;
      px[i + 1] = cov ? Math.round(g / cov) : 0;
      px[i + 2] = cov ? Math.round(b / cov) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, px);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w, hgt, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(hgt, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * hgt);
  for (let y = 0; y < hgt; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const pts = (poly) => poly.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' ');
const rgb = (c) => `rgb(${c.join(',')})`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="${rgb(BG)}"/>
  <polygon points="${pts(BODY)}" fill="${rgb(GLASS)}"/>
  <polygon points="${pts(NECK)}" fill="${rgb(GLASS)}"/>
  <polygon points="${pts(RIM)}" fill="${rgb(GLASS)}"/>
  <polygon points="${pts(INNER)}" fill="${rgb(BG)}"/>
  <clipPath id="c"><polygon points="${pts(INNER)}"/></clipPath>
  <rect x="0" y="${LIQ_Y * 100}" width="100" height="${(1 - LIQ_Y) * 100}" fill="${rgb(LIQUID)}" clip-path="url(#c)"/>
  ${BUBBLES.map(([x, y, r]) => `<circle cx="${x * 100}" cy="${y * 100}" r="${r * 100}" fill="${rgb(DROP)}"/>`).join('\n  ')}
</svg>
`;

writeFileSync(join(outDir, 'icon-192.png'), render(192, { maskable: false }));
writeFileSync(join(outDir, 'icon-512.png'), render(512, { maskable: false }));
writeFileSync(join(outDir, 'icon-maskable-512.png'), render(512, { maskable: true }));
writeFileSync(join(outDir, 'icon.svg'), svg, 'utf8');
console.log('Icons geschrieben: icons/icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg');
