#!/usr/bin/env node
// Schreibt die Liste der offline zu speichernden Dateien in sw.js neu
// (zwischen den Markierungen ASSETS-START und ASSETS-END).
// Nach dem Hinzufügen neuer Dateien aufrufen: node tools/update-sw.js

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function listAssets() {
  const out = ['./', './index.html', './manifest.webmanifest'];
  const walk = (dir, exts) => {
    for (const name of readdirSync(join(root, dir)).sort()) {
      const p = join(root, dir, name);
      if (statSync(p).isDirectory()) walk(join(dir, name), exts);
      else if (exts.some((e) => name.endsWith(e))) out.push(`./${relative(root, p).split(sep).join('/')}`);
    }
  };
  walk('css', ['.css']);
  walk('icons', ['.png', '.svg']);
  walk('js', ['.js']);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const swPath = join(root, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const list = listAssets().map((a) => `  '${a}',`).join('\n');
  const next = sw.replace(/\/\/ ASSETS-START\n[\s\S]*?\/\/ ASSETS-END/, `// ASSETS-START\n${list}\n  // ASSETS-END`);
  writeFileSync(swPath, next, 'utf8');
  console.log(`sw.js: ${listAssets().length} Dateien eingetragen.`);
}
