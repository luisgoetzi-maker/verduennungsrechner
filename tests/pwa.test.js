// Prüft die PWA-Bestandteile: Manifest, Icons, Service-Worker-Dateiliste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listAssets } from '../tools/update-sw.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Manifest ist gültig und installierbar (Name, start_url, display, Icons 192/512)', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url);
  assert.equal(m.lang, 'de');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), i.src);
});

test('Service Worker speichert alle App-Dateien (node tools/update-sw.js ausführen, falls dieser Test fehlschlägt)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const block = sw.match(/\/\/ ASSETS-START\n([\s\S]*?)\/\/ ASSETS-END/)[1];
  const listed = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(listed, listAssets());
  for (const a of listed) if (a !== './') assert.ok(existsSync(join(root, a)), a);
});

test('Versionen von App und Service Worker stimmen überein', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const v = readFileSync(join(root, 'js/ui/version.js'), 'utf8');
  const swV = sw.match(/CACHE_VERSION = 'vr-([^']+)'/)[1];
  const appV = v.match(/APP_VERSION = '([^']+)'/)[1];
  assert.equal(swV, appV);
});

test('index.html bindet Manifest, Stylesheet und App ein (relative Pfade für GitHub Pages)', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<html lang="de"/);
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /href="css\/app.css"/);
  assert.match(html, /src="js\/ui\/app.js"/);
  assert.doesNotMatch(html, /(src|href)="\//);
});
