#!/usr/bin/env node
// Minimaler statischer Webserver (ohne Abhängigkeiten) zum Testen im WLAN.
// Aufruf: node tools/serve.js [Port] [--open]   (Standard-Port 8080; --open öffnet den Browser)
//
// Hinweis: Der Service Worker (Offline-Betrieb, Installation als App) läuft nur
// auf "sicheren" Adressen: https://… oder http://localhost. Über die
// WLAN-Adresse http://192.168.x.x funktioniert die App, aber ohne Offline-
// Modus – siehe README.md (USB-Weiterleitung oder GitHub Pages).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 8080;
const openBrowser = process.argv.includes('--open');
const url = `http://localhost:${port}/`;

function openUrl() {
  if (!openBrowser) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end('Verboten'); return; }
    const st = await stat(file);
    if (st.isDirectory()) { res.writeHead(302, { Location: `${path}/` }).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${port} ist schon belegt – läuft der Verdünnungsrechner bereits? Adresse: ${url}`);
    openUrl();
    setTimeout(() => process.exit(1), 500);
  } else {
    console.error(e);
    process.exit(1);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Verdünnungsrechner läuft:`);
  console.log(`  am PC:      http://localhost:${port}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  im WLAN:    http://${a.address}:${port}/   (ohne Offline-Modus, siehe README)`);
    }
  }
  console.log('Beenden mit Strg+C (oder dieses Fenster schließen).');
  openUrl();
});
