#!/usr/bin/env node
// Prüft die Startliste der Stoffdatenbank:
//  - jede Formel wird durch den Parser geschickt
//  - CAS-Prüfziffern, doppelte IDs/Namen, Dichte/Gehalt, Hydrat-Benennung
//  - mehrdeutige Aliase werden als Info gemeldet
//
// Aufruf:  node tools/check-substances.js          (Bericht auf der Konsole)
//          node tools/check-substances.js --md     (zusätzlich VERIFIZIEREN.md schreiben)
// Rückgabewert 1, wenn Fehler gefunden wurden.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SEED_SUBSTANCES } from '../js/core/substances-seed.js';
import { checkSubstances } from '../js/core/substance-check.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { errors, warnings, infos, rows } = checkSubstances(SEED_SUBSTANCES);

console.log(`Startliste: ${SEED_SUBSTANCES.length} Einträge\n`);
const section = (title, list) => {
  console.log(`${title} (${list.length})`);
  list.forEach((l) => console.log(`  - ${l}`));
  console.log('');
};
section('FEHLER', errors);
section('Warnungen', warnings);
section('Hinweise', infos);

if (process.argv.includes('--md')) {
  const fmt = (v, d = 2) => (v === undefined || v === null ? '' : Number(v).toFixed(d).replace('.', ','));
  const lines = [];
  lines.push('# Zu prüfende Werte der Stoff-Startliste');
  lines.push('');
  lines.push('Alle Werte wurden **aus dem Gedächtnis** eingetragen. Bitte gegen Sicherheitsdatenblatt (Abschnitt 1, 3 und 9) bzw. PubChem prüfen.');
  lines.push('Die Molare Masse wird aus der Formel berechnet – geprüft werden müssen vor allem **Formel (Hydratstufe!)**, **CAS-Nummer**, **Dichte** und **Gehalt**.');
  lines.push('Die CAS-Prüfziffern sind bereits automatisch geprüft (fängt Tippfehler ab, aber keine Verwechslungen).');
  lines.push('');
  lines.push(`Erzeugt mit \`node tools/check-substances.js --md\` – ${rows.length} Einträge.`);
  lines.push('');
  lines.push('## Besonders wichtig: Dichten und Gehalte der Lösungen/Flüssigkeiten');
  lines.push('');
  lines.push('| ✓ | Name | Formel | CAS | Gehalt % (m/m) | Dichte g/mL (20 °C) | z |');
  lines.push('|---|---|---|---|---|---|---|');
  rows.filter((r) => r.density !== undefined).forEach((r) => {
    lines.push(`| ☐ | ${r.name} | ${r.formula} | ${r.cas} | ${fmt(r.purity, 1)} | ${fmt(r.density, 3)} | ${r.z ?? ''} |`);
  });
  lines.push('');
  lines.push('## Feststoffe und übrige Einträge (Formel, Hydratstufe, CAS)');
  lines.push('');
  lines.push('| ✓ | Name | Formel | M (g/mol, berechnet) | CAS | Kategorie |');
  lines.push('|---|---|---|---|---|---|');
  rows.filter((r) => r.density === undefined).forEach((r) => {
    lines.push(`| ☐ | ${r.name} | ${r.formula} | ${fmt(r.mw, 3)} | ${r.cas} | ${r.cat} |`);
  });
  lines.push('');
  if (warnings.length || infos.length) {
    lines.push('## Meldungen des Prüfskripts');
    lines.push('');
    [...warnings, ...infos].forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }
  writeFileSync(join(root, 'VERIFIZIEREN.md'), lines.join('\n'), 'utf8');
  console.log('VERIFIZIEREN.md geschrieben.');
}

process.exit(errors.length ? 1 : 0);
