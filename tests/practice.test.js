// Etappe 3: Plausibilität, Geräte, Messunsicherheit, Lösungen, Verlauf, Export
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePractice, splitFactor } from '../js/core/practice.js';
import { suggestFlask, suggestPipette, roundToPipette } from '../js/core/devices.js';
import { volumeUncertainty, estimateUncertainty } from '../js/core/uncertainty.js';
import { SolutionStore } from '../js/core/solutions.js';
import { HistoryStore } from '../js/core/history.js';
import { expiryStatus, daysUntil, addDays } from '../js/core/expiry.js';
import { makePdf, toWinAnsiText, wrapLines } from '../js/core/pdf.js';
import { resultToText } from '../js/core/export.js';
import { buildBackup, inspectBackup, applyBackup } from '../js/core/backup.js';
import { createMemoryStorage } from '../js/core/storage.js';
import { SubstanceDB } from '../js/core/substance-db.js';
import { DEFAULT_SETTINGS } from '../js/core/settings.js';
import { calcEinwaage, calcVerduennung, calcReihe, calcIstd } from '../js/core/modes/index.js';

const S = { ...DEFAULT_SETTINGS };
const db = new SubstanceDB(createMemoryStorage());
const near = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} ≠ ${b}`);

// ---------------------------------------------------------------- Plausibilität
test('Warnung: Pipettiervolumen unter 10 µL', () => {
  const R = calcVerduennung({ c1: '1000 µg/mL', V1: '', c2: '0,05 µg/mL', V2: '100 mL' }, S);
  const p = evaluatePractice(R, S);
  assert.ok(p.warnings.some((w) => /unter 10 µL/.test(w.text)));
});

test('Warnung: Verdünnungsfaktor über 1:1000 mit Vorschlag Zwischenverdünnung', () => {
  const R = calcVerduennung({ c1: '1000 µg/mL', V1: '', c2: '0,1 µg/mL', V2: '1000 mL' }, S);
  const p = evaluatePractice(R, S);
  const w = p.warnings.find((x) => /Zwischenverdünnung/.test(x.text));
  assert.ok(w, JSON.stringify(p.warnings));
  assert.match(w.text, /erst 1:100, dann 1:100/);
  assert.deepEqual(splitFactor(10000), [100, 100]);
  assert.deepEqual(splitFactor(5000), [100, 50]);
});

test('Warnung: Zielvolumen größer als verfügbare Messkolben', () => {
  const R = calcEinwaage({ substance: db.get('nacl'), conc: '0,1 M', amount: '2 L' }, S);
  const p = evaluatePractice(R, S);
  assert.ok(p.warnings.some((w) => /größte verfügbare Messkolben/.test(w.text)));
});

test('Warnung: Einwaage unter 10 mg', () => {
  const R = calcEinwaage({ substance: db.get('nacl'), conc: '1 mmol/L', amount: '100 mL' }, S);
  const p = evaluatePractice(R, S);
  assert.ok(p.warnings.some((w) => /Einwaage .* unter 10 mg/.test(w.text)));
  // keine Warnung bei normaler Einwaage
  const R2 = calcEinwaage({ substance: db.get('nacl'), conc: '0,1 M', amount: '100 mL' }, S);
  assert.equal(evaluatePractice(R2, S).warnings.length, 0);
});

test('Gerätevorschläge: Messkolben und Pipetten', () => {
  assert.equal(suggestFlask(0.25, S).text, 'Messkolben 250 mL');
  assert.match(suggestFlask(0.3, S).text, /500 mL/);
  assert.ok(suggestFlask(2, S).tooLarge);
  assert.match(suggestPipette(50e-6, S).text, /100 µL/);
  assert.match(suggestPipette(8e-6, S).text, /10 µL/);
  assert.match(suggestPipette(500e-6, S).text, /1000 µL/);
  assert.match(suggestPipette(5e-3, S).text, /Vollpipette 5 mL/);
  assert.match(suggestPipette(2.5e-3, S).text, /2 × 1000 µL \+ 500 µL/);
  assert.equal(suggestPipette(0.5e-6, S).kind, 'tooSmall');
  const R = calcVerduennung({ c1: '1000 µg/mL', V1: '', c2: '100 µg/mL', V2: '50 mL' }, S);
  const p = evaluatePractice(R, S);
  assert.ok(p.devices.some((d) => /Vollpipette 5 mL/.test(d.text)));
  assert.ok(p.devices.some((d) => /Messkolben 50 mL/.test(d.text)));
});

test('Reihe: Geräte in der Tabelle', () => {
  const R = calcReihe({ stock: '10 µg/mL', targets: '100; 50; 20', targetUnit: 'ng/mL', Vstd: '10 mL' }, S);
  evaluatePractice(R, S);
  assert.ok(R.table.rows.every((r) => r.device));
});

test('Rundung auf Pipettenauflösung', () => {
  near(roundToPipette(12.34e-6), 12.5e-6);
  near(roundToPipette(1.111e-3), 1.11e-3);
  near(roundToPipette(4.04e-6), 4.0e-6);
  near(roundToPipette(123.4e-6), 123e-6);
});

// ---------------------------------------------------------------- Messunsicherheit
test('Volumenunsicherheit: Messkolben, Vollpipette, Kolbenhubpipette', () => {
  near(volumeUncertainty(0.1, 'flask', S).u, 0.1e-3 / Math.sqrt(3));
  near(volumeUncertainty(0.005, 'pipette', S).u, 0.015e-3 / Math.sqrt(3));
  const p = volumeUncertainty(100e-6, 'pipette', S);
  near(p.u, Math.sqrt((0.8e-6 / Math.sqrt(3)) ** 2 + (0.3e-6) ** 2));
});

test('Messunsicherheit der Verdünnung (Fehlerfortpflanzung)', () => {
  const R = calcVerduennung({ c1: '1000 µg/mL', V1: '', c2: '100 µg/mL', V2: '50 mL' }, S);
  const u = estimateUncertainty(R.uncertainty, { settings: S, stockUrel: 0.005 });
  assert.equal(u.ok, true);
  const exp = Math.sqrt(0.005 ** 2 + (0.015 / Math.sqrt(3) / 5) ** 2 + (0.06 / Math.sqrt(3) / 50) ** 2);
  near(u.urel, exp, 1e-9);
  near(u.U, 2 * exp, 1e-9);
  assert.ok(u.lines.some((l) => /k = 2/.test(l)));
});

test('Messunsicherheit: Einwaage, serielle Reihe kumuliert', () => {
  const A = calcEinwaage({ substance: db.get('nacl'), conc: '0,1 M', amount: '100 mL' }, S);
  const ua = estimateUncertainty(A.uncertainty, { settings: S });
  assert.ok(ua.ok && ua.urel > 0 && ua.urel < 0.01);
  const D = calcReihe({ stock: '1000 µg/L', Vstd: '10 mL', mode: 'serial', serialFactor: '10', serialCount: '3' }, S);
  const ud = estimateUncertainty(D.uncertainty, { settings: S });
  const per = ud.perStandard.map((p) => p.urel);
  assert.ok(per[0] < per[1] && per[1] < per[2], 'Unsicherheit steigt seriell an');
  const P = calcReihe({ stock: '1000 µg/L', targets: '100; 10; 1', targetUnit: 'µg/L', Vstd: '10 mL', mode: 'parallel' }, S);
  const up = estimateUncertainty(P.uncertainty, { settings: S });
  assert.equal(up.perStandard.length, 3);
  const F = calcIstd({ stock: '1 µg/mL', target: '10 ng/mL', sample: '1 mL', n: '10' }, S);
  assert.ok(estimateUncertainty(F.uncertainty, { settings: S }).ok);
});

// ---------------------------------------------------------------- Ablaufdatum / Lösungen
test('Ampel nach Ablaufdatum', () => {
  const today = new Date(2026, 9, 9);
  assert.equal(daysUntil('2026-10-19', today), 10);
  assert.equal(expiryStatus('2026-10-01', 14, today).color, 'red');
  assert.equal(expiryStatus('2026-10-09', 14, today).color, 'yellow');
  assert.equal(expiryStatus('2026-10-20', 14, today).color, 'yellow');
  assert.equal(expiryStatus('2026-12-31', 14, today).color, 'green');
  assert.equal(expiryStatus('', 14, today).color, 'grey');
  assert.equal(addDays('2026-10-09', 30), '2026-11-08');
});

test('Lösungsverwaltung: anlegen, suchen, sortieren, bearbeiten, löschen', () => {
  const st = new SolutionStore(createMemoryStorage());
  const today = new Date(2026, 9, 9);
  st.add({ name: 'NaCl 0,1 M', conc: '0,1 mol/L', solvent: 'Wasser', made: '2026-09-01', expires: '2026-10-01' });
  st.add({ name: 'PFOA-Stamm', conc: '10 µg/mL', solvent: 'Methanol', made: '2026-10-01', expires: '2027-04-01' });
  const b = st.add({ name: 'EDTA 0,05 M', conc: '0,05 mol/L', made: '2026-10-05', expires: '2026-10-15' });
  const list = st.list({ today });
  assert.deepEqual(list.map((s) => s.status.color), ['red', 'yellow', 'green']);
  assert.equal(st.list({ query: 'methanol', today }).length, 1);
  assert.equal(st.list({ filter: 'expired', today }).length, 1);
  st.update(b.id, { notes: 'pH 8' });
  assert.equal(st.get(b.id).notes, 'pH 8');
  st.remove(b.id);
  assert.equal(st.list({ today }).length, 2);
  assert.throws(() => st.add({ name: '' }));
  assert.throws(() => st.add({ name: 'X', made: '2026-10-10', expires: '2026-10-01' }));
  assert.deepEqual(st.counts({ today }), { red: 1, yellow: 0, green: 1, grey: 0 });
});

// ---------------------------------------------------------------- Verlauf
test('Verlauf: speichert, ersetzt Sitzung, keine Duplikate, begrenzt', () => {
  const h = new HistoryStore(createMemoryStorage(), 3);
  const t0 = 1_000_000;
  h.add({ mode: 'einwaage', state: { a: 1 }, session: 's1' }, t0);
  assert.equal(h.add({ mode: 'einwaage', state: { a: 1 }, session: 's1' }, t0 + 10), null);
  h.add({ mode: 'einwaage', state: { a: 2 }, session: 's1' }, t0 + 1000);
  assert.equal(h.list().length, 1, 'gleiche Sitzung ersetzt');
  h.add({ mode: 'einwaage', state: { a: 3 }, session: 's2' }, t0 + 2000);
  h.add({ mode: 'reihe', state: { b: 1 }, session: 's3' }, t0 + 3000);
  h.add({ mode: 'umrechner', state: { c: 1 }, session: 's4' }, t0 + 4000);
  assert.equal(h.list().length, 3);
  assert.equal(h.list()[0].mode, 'umrechner');
  h.clear();
  assert.equal(h.list().length, 0);
});

// ---------------------------------------------------------------- Export
test('Text-Export enthält Ergebnis, Anleitung und Rechenweg', () => {
  const R = calcVerduennung({ c1: '1000 µg/mL', V1: '5 mL', c2: '', V2: '50 mL' }, S);
  R.practice = evaluatePractice(R, S);
  R.uncertaintyResult = estimateUncertainty(R.uncertainty, { settings: S });
  const t = resultToText(R, { title: 'Verdünnung', inputs: ['c1=1000 µg/mL'] });
  assert.match(t, /Ergebnis:/);
  assert.match(t, /100 µg\/mL/);
  assert.match(t, /Rechenweg:/);
  assert.match(t, /c₂ = c₁ · V₁ \/ V₂ = 1000 µg\/mL · 5 mL \/ 50 mL = 100 µg\/mL/);
  assert.match(t, /Geräte:/);
  assert.match(t, /Messunsicherheit/);
  const D = calcReihe({ stock: '10 µg/mL', targets: '100; 50', targetUnit: 'ng/mL', Vstd: '10 mL' }, S);
  assert.match(resultToText(D, { title: 'Reihe' }), /Pipettierplan:\nNr \| Ziel \(ng\/mL\)/);
});

test('PDF: gültige Struktur, Umlaute und Hochzahlen werden lesbar umgesetzt', () => {
  assert.equal(toWinAnsiText('2,4·10⁻⁸ mol/L'), '2,4·10^-8 mol/L');
  assert.equal(toWinAnsiText('c₂ = β / ρ ≈ 5 µg'), 'c2 = beta / rho ~ 5 µg');
  assert.equal(toWinAnsiText('Säure – „OK“'), 'Säure – „OK“');
  const long = 'x '.repeat(80);
  assert.ok(wrapLines([long]).length > 1);
  const lines = Array.from({ length: 120 }, (_, i) => `Zeile ${i + 1}: Größe ä ö ü ß µL (Klammer) \\ Ende`);
  const pdf = makePdf(lines, { title: 'Test – Einwaage', footer: 'Verdünnungsrechner' });
  const text = String.fromCharCode(...pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 3/); // 57 Zeilen je Seite
  assert.match(text, /Gr\\366\\337e/); // "Größe" in WinAnsi (oktal)
  assert.match(text, /\\\(Klammer\\\)/);
  // xref-Offsets zeigen auf die Objekte
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(xref).startsWith('xref'));
  const offs = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offs.forEach((o, i) => assert.ok(text.slice(o).startsWith(`${i + 1} 0 obj`), `Objekt ${i + 1}`));
});

// ---------------------------------------------------------------- Backup
test('Gesamt-Backup: Stoffe, Lösungen, Verlauf, Einstellungen', () => {
  const storageA = createMemoryStorage();
  const a = { db: new SubstanceDB(storageA), solutions: new SolutionStore(storageA), history: new HistoryStore(storageA) };
  a.db.add({ name: 'Mein Stoff', formula: 'KCl' });
  a.solutions.add({ name: 'KCl 3 M', conc: '3 mol/L' });
  a.history.add({ mode: 'einwaage', state: { x: 1 } });
  const json = JSON.stringify(buildBackup({ ...a, settings: { ...S, sig: 5 }, appVersion: 'test' }));
  const info = inspectBackup(json);
  assert.equal(info.summary.solutions, 1);
  const storageB = createMemoryStorage();
  const b = { db: new SubstanceDB(storageB), solutions: new SolutionStore(storageB), history: new HistoryStore(storageB) };
  let saved = null;
  applyBackup(info.data, 'replace', { ...b, saveSettings: (s) => { saved = s; return s; } });
  assert.ok(b.db.search('Mein Stoff').length);
  assert.equal(b.solutions.list().length, 1);
  assert.equal(b.history.list().length, 1);
  assert.equal(saved.sig, 5);
  assert.throws(() => inspectBackup('{"foo":1}'));
  assert.throws(() => inspectBackup('kein json'));
});
