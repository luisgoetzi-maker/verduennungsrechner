// Modus G: Mischstandard (mehrere Stoffe in einer Lösung)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcMischung } from '../js/core/modes/index.js';
import { evaluatePractice } from '../js/core/practice.js';
import { estimateUncertainty } from '../js/core/uncertainty.js';
import { resultToText } from '../js/core/export.js';
import { SubstanceDB } from '../js/core/substance-db.js';
import { createMemoryStorage } from '../js/core/storage.js';

const db = new SubstanceDB(createMemoryStorage());
const S = { sig: 4 };
const near = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} ≠ ${b}`);

test('Mischung aus Stammlösungen: gemeinsame Zielkonzentration', () => {
  const R = calcMischung({
    amount: '10 mL', useCommon: true, commonConc: '1 µg/mL',
    components: [
      { substance: db.get('pfoa'), source: 'stock', stock: '50 µg/mL' },
      { substance: db.get('pfos'), source: 'stock', stock: '50 µg/mL' },
      { substance: db.get('pfhxa'), source: 'stock', stock: '100 µg/mL' },
    ],
  }, S);
  assert.equal(R.ok, true, R.error);
  const rows = R.table.rows;
  assert.equal(rows.length, 3);
  near(rows[0].V, 200e-6);
  near(rows[2].V, 100e-6);
  near(R.values.sumV, 500e-6);
  assert.match(R.instruction, /10 mL-Messkolben/);
  assert.ok(R.steps.some((s) => s.res === '200 µL'));
});

test('Mischung aus Feststoffen mit eigener Konzentration je Komponente', () => {
  const R = calcMischung({
    amount: '100 mL',
    components: [
      { substance: db.get('nacl'), source: 'solid', conc: '0,1 M' },
      { substance: db.get('kcl'), source: 'solid', conc: '10 mM', purity: '99,5' },
      { substance: db.get('cuso4-5h2o'), source: 'solid', conc: '100 mg/L', reference: { type: 'element', element: 'Cu' } },
    ],
  }, S);
  assert.equal(R.ok, true, R.error);
  near(R.table.rows[0].m, 0.01 * 58.443, 1e-4);
  near(R.table.rows[1].m, (0.001 * 74.551) / 0.995, 1e-4);
  near(R.table.rows[2].m, (0.01 * 249.677) / 63.546, 1e-4);
  near(R.values.sumM, R.table.rows.reduce((s, r) => s + r.m, 0));
});

test('Gemischt: Feststoff, Stammlösung, Formel und Umrechnung mol/L ↔ µg/mL', () => {
  const R = calcMischung({
    amount: '50 mL',
    components: [
      { formula: 'C8HF15O2', source: 'stock', conc: '10 nmol/L', stock: '1 µg/mL' },
      { substance: db.get('pfos-k'), source: 'solid', conc: '1 mg/L', reference: { type: 'formula', formula: 'C8F17O3S-' } },
    ],
  }, S);
  assert.equal(R.ok, true, R.error);
  near(R.table.rows[0].V, (10e-9 * 414.07 * 1e3 * 0.05) / 1, 1e-4); // c in µg/mL · V / c(Stamm)
  const Mk = db.get('pfos-k').mw;
  near(R.table.rows[1].m, (1e-3 * 0.05 * Mk) / (Mk - 39.0983), 1e-6);
});

test('Fehler und Warnungen: Summe > Endvolumen, fehlende Molare Masse, Plausibilität', () => {
  let R = calcMischung({ amount: '1 mL', useCommon: true, commonConc: '10 µg/mL', components: [
    { substance: db.get('pfoa'), source: 'stock', stock: '15 µg/mL' },
    { substance: db.get('pfos'), source: 'stock', stock: '15 µg/mL' },
  ] }, S);
  assert.equal(R.ok, false);
  assert.match(R.error, /größer als das Endvolumen/);
  R = calcMischung({ amount: '10 mL', components: [{ source: 'stock', conc: '1 mM', stock: '1 mg/mL' }] }, S);
  assert.equal(R.ok, false);
  assert.match(R.error, /\(1\) Komponente: Bitte einen Stoff wählen/);
  R = calcMischung({ amount: '10 mL', components: [{ source: 'stock', conc: '1 mM', stock: '1 mg/mL', substance: { id: 'x', name: 'Unbekannt', mw: null } }] }, S);
  assert.match(R.error, /\(1\) Unbekannt: Es fehlt Molare Masse/);
  R = calcMischung({ amount: '10 mL', useCommon: true, commonConc: '1 ng/mL', components: [
    { substance: db.get('pfoa'), source: 'stock', stock: '1000 µg/mL' },
  ] }, S);
  assert.equal(R.ok, true);
  assert.ok(R.table.rows[0].notes.length >= 1);
  assert.ok(R.warnings.some((w) => /Plausibilitätsgrenzen/.test(w.text)));
  R = calcMischung({ amount: '10 mL', components: [] }, S);
  assert.equal(R.ok, false);
  R = calcMischung({ amount: '10 mL', useCommon: true, commonConc: '1 µg/mL', components: [
    { substance: db.get('pfoa'), source: 'stock', stock: '0,5 µg/mL' },
  ] }, S);
  assert.match(R.error, /größer als die Stammlösung/);
});

test('Geräte, Messunsicherheit und Export je Komponente', () => {
  const R = calcMischung({ amount: '10 mL', useCommon: true, commonConc: '1 µg/mL', components: [
    { substance: db.get('pfoa'), source: 'stock', stock: '100 µg/mL' },
    { substance: db.get('nacl'), source: 'solid' },
  ] }, S);
  assert.equal(R.ok, true, R.error);
  evaluatePractice(R, S);
  assert.match(R.table.rows[0].device, /Pip\. 100 µL/);
  assert.equal(R.table.rows[1].device, 'Analysenwaage');
  const u = estimateUncertainty(R.uncertainty, { settings: S });
  assert.equal(u.perStandard.length, 2);
  assert.match(resultToText(R, { title: 'Mischstandard' }), /Komponenten:\nNr \| Stoff/);
});
