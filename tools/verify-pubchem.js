#!/usr/bin/env node
// Gleicht die Startliste mit PubChem ab (Internet nötig):
// Für jede CAS-Nummer wird die Summenformel bei PubChem abgefragt und mit der
// Formel der Startliste verglichen (Elementanzahl, Hydratwasser eingeschlossen).
//
// Aufruf: node tools/verify-pubchem.js        -> schreibt PUBCHEM-ABGLEICH.md
//
// Hinweis: PubChem erlaubt max. 5 Anfragen/Sekunde; das Skript wartet zwischen
// den Anfragen. Dichten und Gehalte kann PubChem nicht prüfen.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SEED_SUBSTANCES } from '../js/core/substances-seed.js';
import { lookupPubChem, sameComposition } from '../js/core/pubchem.js';
import { molarMass } from '../js/core/formula.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
let ok = 0;
let bad = 0;
let missing = 0;
for (const s of SEED_SUBSTANCES) {
  if (!s.cas) continue;
  let res = null;
  let err = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await lookupPubChem(s.cas, { maxResults: 1, withCAS: false });
      err = null;
      break;
    } catch (e) {
      err = e;
      if (e.code !== 'busy' && e.code !== 'timeout') break;
      await sleep(2000);
    }
  }
  await sleep(250);
  if (err || !res?.length) {
    missing++;
    rows.push({ s, status: 'nicht gefunden', detail: err ? err.message : '' });
    process.stdout.write('?');
    continue;
  }
  const p = res[0];
  const same = sameComposition(s.formula, p.formula);
  if (same) ok++; else bad++;
  rows.push({ s, status: same ? 'OK' : 'ABWEICHUNG', pc: p, mw: molarMass(s.formula) });
  process.stdout.write(same ? '.' : 'X');
}
console.log(`\n\nOK: ${ok}, Abweichung: ${bad}, nicht gefunden: ${missing}`);

const lines = [
  '# Abgleich der Startliste mit PubChem',
  '',
  `Abgefragt am ${new Date().toISOString().slice(0, 10)} über die CAS-Nummer. OK: ${ok}, Abweichung: ${bad}, nicht gefunden: ${missing}.`,
  '',
  '„OK“ heißt: Die bei PubChem unter dieser CAS-Nummer hinterlegte Summenformel hat dieselbe Elementzusammensetzung wie der Eintrag (inkl. Hydratwasser).',
  'Das bestätigt CAS-Nummer und Formel gegenseitig, **nicht** aber Dichte und Gehalt.',
  '',
  '## Abweichungen und nicht gefundene Einträge',
  '',
  '| Eintrag | Formel (App) | CAS | PubChem-Titel | PubChem-Formel | M App | M PubChem | Status |',
  '|---|---|---|---|---|---|---|---|',
];
for (const r of rows.filter((x) => x.status !== 'OK')) {
  lines.push(`| ${r.s.name} | ${r.s.formula} | ${r.s.cas} | ${r.pc?.title ?? ''} | ${r.pc?.formula ?? ''} | ${r.mw ? r.mw.toFixed(2) : ''} | ${r.pc?.mw ?? ''} | ${r.status} ${r.detail ?? ''} |`);
}
lines.push('', '## Übereinstimmungen', '', '| Eintrag | Formel | CAS | PubChem-Titel | M App | M PubChem |', '|---|---|---|---|---|---|');
for (const r of rows.filter((x) => x.status === 'OK')) {
  lines.push(`| ${r.s.name} | ${r.s.formula} | ${r.s.cas} | ${r.pc.title} | ${r.mw.toFixed(2)} | ${r.pc.mw} |`);
}
writeFileSync(join(root, 'PUBCHEM-ABGLEICH.md'), lines.join('\n') + '\n', 'utf8');
console.log('PUBCHEM-ABGLEICH.md geschrieben.');
