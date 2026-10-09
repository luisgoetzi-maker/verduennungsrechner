#!/usr/bin/env node
// Minimaler statischer Webserver (ohne Abhängigkeiten) zum Testen im WLAN.
// Aufruf: node tools/serve.js [Port]     (Standard-Port 8080)
//
// Hinweis: Der Service Worker (Offline-Betrieb, Installation als App) läuft nur
// auf "sicheren" Adressen: https://… oder http://localhost. Über die
// WLAN-Adresse http://192.168.x.x funktioniert die App, aber ohne Offline-
// Modus – siehe README.md (USB-Weiterleitung oder GitHub Pages).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8080;
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

server.listen(port, '0.0.0.0', () => {
  console.log(`Verdünnungsrechner läuft:`);
  console.log(`  am PC:      http://localhost:${port}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  im WLAN:    http://${a.address}:${port}/   (ohne Offline-Modus, siehe README)`);
    }
  }
  console.log('Beenden mit Strg+C.');
});
