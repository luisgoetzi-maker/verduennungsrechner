import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcEinwaage, calcVerduennung, calcKonzentriert, calcReihe, calcUmrechner, calcIstd } from '../js/core/modes/index.js';
import { stepText } from '../js/core/modes/common.js';
import { SubstanceDB } from '../js/core/substance-db.js';
import { createMemoryStorage } from '../js/core/storage.js';
import { parseTargetList } from '../js/core/modes/reihe.js';

const db = new SubstanceDB(createMemoryStorage());
const S = { sig: 4 };
const near = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} ≠ ${b}`);
const allSteps = (r) => r.steps.map(stepText).join('\n');

// ---------------------------------------------------------------- A) Einwaage
test('A: 0,1 M CuSO4·5H2O, 250 mL, 99 % -> 6,305 g', () => {
  const r = calcEinwaage({ substance: db.get('cuso4-5h2o'), conc: { value: '0,1', unit: 'mol/L' }, amount: { value: '250', unit: 'mL' }, purity: '99' }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.mPure, 0.1 * 0.25 * 249.677, 1e-4);
  near(r.values.mWeigh, (0.1 * 0.25 * 249.677) / 0.99, 1e-4);
  assert.match(allSteps(r), /n = c · V = 0,1 mol\/L · 0,25 L = 0,025 mol/);
  assert.match(allSteps(r), /Kristallwasser/);
  assert.ok(r.checks.some((c) => c.type === 'mass'));
});

test('A: 0,9 % (m/V) NaCl, 1 L -> 9 g (ohne Molare Masse)', () => {
  const r = calcEinwaage({ conc: '0,9 % (m/V)', amount: '1 L' }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.mWeigh, 9);
});

test('A: Bezug auf Element (1000 mg/L Cu aus CuSO4·5H2O)', () => {
  const r = calcEinwaage({ substance: db.get('cuso4-5h2o'), conc: '1000 mg/L', amount: '100 mL', reference: { type: 'element', element: 'Cu' } }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.mWeigh, (0.1 * 249.677) / 63.546, 1e-4);
});

test('A: Bezug wasserfreie Form und Anion (PFOS-K)', () => {
  let r = calcEinwaage({ substance: db.get('cuso4-5h2o'), conc: '1 g/L', amount: '1 L', reference: { type: 'anhydrous' } }, S);
  near(r.values.mWeigh, 249.677 / 159.602, 1e-4);
  r = calcEinwaage({ substance: db.get('pfos-k'), conc: '50 µg/mL', amount: '10 mL', reference: { type: 'formula', formula: 'C8F17O3S-' } }, S);
  assert.equal(r.ok, true, r.error);
  const Mk = db.get('pfos-k').mw;
  const Ma = Mk - 39.0983;
  near(r.values.mWeigh, (50e-3 * 0.01 * Mk) / Ma, 1e-4);
});

test('A: Flüssigkeit -> Volumen über Dichte (HCl 37 %, 0,1 M, 1 L -> 8,28 mL)', () => {
  const r = calcEinwaage({ substance: db.get('hcl-37'), conc: '0,1 M', amount: '1 L' }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.Vproduct * 1000, 8.28, 2e-3);
  assert.equal(r.main[0].label, 'Abmessen');
});

test('A: fehlende Molare Masse wird angefordert, nicht geraten', () => {
  const r = calcEinwaage({ conc: '0,1 M', amount: '1 L' }, S);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.param), ['M']);
  const r2 = calcEinwaage({ M: '58,44', conc: '0,1 M', amount: '1 L' }, S);
  near(r2.values.mWeigh, 5.844);
});

test('A: % (m/m) mit Masse, Normalität, Molalität, % (V/V)', () => {
  let r = calcEinwaage({ substance: db.get('nacl'), conc: '5 % (m/m)', amount: '200 g' }, S);
  near(r.values.mWeigh, 10);
  r = calcEinwaage({ substance: db.get('nacl'), conc: '5 % (m/m)', amount: '200 mL' }, S);
  assert.deepEqual(r.missing.map((m) => m.param), ['rhoSol']);
  r = calcEinwaage({ substance: db.get('oxalic-2h2o'), conc: '0,1 N', amount: '1 L' }, S);
  near(r.values.mWeigh, 0.05 * 126.065, 1e-3);
  r = calcEinwaage({ substance: db.get('nacl'), conc: '1 mol/kg', amount: '1 kg' }, S);
  near(r.values.mWeigh, 58.443, 1e-4);
  r = calcEinwaage({ substance: db.get('ethanol'), conc: '70 % (V/V)', amount: '100 mL' }, S);
  near(r.values.Vsubstance, 0.07);
  assert.ok(r.hints.some((h) => /nicht additiv/.test(h)));
});

test('A: ppm mit Volumen nutzt ρ = 1 g/mL und zeigt Hinweis', () => {
  const r = calcEinwaage({ substance: db.get('nacl'), conc: '100 ppm', amount: '1 L' }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.mWeigh, 0.1);
  assert.ok(r.hints.some((h) => /verdünnte wässrige/.test(h)));
});

test('A: ungültige Eingaben -> verständliche Fehlermeldung', () => {
  let r = calcEinwaage({ conc: 'abc', amount: '1 L' }, S);
  assert.equal(r.ok, false);
  assert.equal(r.field, 'conc');
  r = calcEinwaage({ conc: '1 M', amount: '1 mg/L' }, S);
  assert.equal(r.field, 'amount');
  r = calcEinwaage({ formula: 'Xy', conc: '1 M', amount: '1 L' }, S);
  assert.match(r.error, /Formel/);
  r = calcEinwaage({ conc: '1 %', amount: '1 L' }, S);
  assert.equal(r.code, 'percent-ambiguous');
});

// ---------------------------------------------------------------- B) Verdünnung
test('B: 5 mL 1000 µg/mL auf 50 mL -> 100 µg/mL (Abnahmetest)', () => {
  const r = calcVerduennung({ c1: '1000 µg/mL', V1: '5 mL', c2: { value: '', unit: 'µg/mL' }, V2: '50 mL' }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.c2, 100);
  near(r.values.F, 10);
  assert.match(r.instruction, /5 mL Stammlösung .* auf 50 mL auffüllen/);
});

test('B: jede der vier Größen berechenbar, auch mit verschiedenen Einheiten', () => {
  let r = calcVerduennung({ c1: '1000 µg/mL', V1: { value: '', unit: 'µL' }, c2: '100 ng/mL', V2: '10 mL' }, S);
  near(r.values.V1, 1e-6);
  assert.match(r.main[0].text, /^1 µL/);
  r = calcVerduennung({ c1: '1 M', V1: '10 mL', c2: '0,1 M', V2: '' }, S);
  near(r.values.V2, 0.1);
  r = calcVerduennung({ c1: '', V1: '10 mL', c2: '0,1 M', V2: '100 mL' }, S);
  near(r.values.c1, 1);
  // Umrechnung mg/L <-> mol/L nur mit Molarer Masse
  r = calcVerduennung({ c1: '1 mmol/L', V1: '', c2: '10 mg/L', V2: '100 mL' }, S);
  assert.deepEqual(r.missing.map((m) => m.param), ['M']);
  r = calcVerduennung({ c1: '1 mmol/L', V1: '', c2: '10 mg/L', V2: '100 mL', M: '100' }, S);
  near(r.values.V1, 0.01);
});

test('B: Plausibilität (c2 > c1, zu viele/wenige Felder)', () => {
  assert.equal(calcVerduennung({ c1: '1 M', V1: '10 mL', c2: '2 M', V2: '' }, S).ok, false);
  assert.equal(calcVerduennung({ c1: '1 M', V1: '10 mL', c2: '0,1 M', V2: '50 mL' }, S).ok, false);
  assert.equal(calcVerduennung({ c1: '1 M', V1: '', c2: '', V2: '50 mL' }, S).ok, false);
});

// ---------------------------------------------------------------- C) Konzentrierte Lösung
test('C: HCl 37 %, 1,19 g/mL -> 12,08 mol/L; 0,1 M / 1 L -> 8,28 mL', () => {
  let r = calcKonzentriert({ substance: db.get('hcl-37') }, S);
  assert.equal(r.ok, true, r.error);
  assert.ok(r.values.c > 12.05 && r.values.c < 12.15);
  r = calcKonzentriert({ substance: db.get('hcl-37'), conc: '0,1 M', amount: '1 L' }, S);
  near(r.values.Vconc * 1000, 8.28, 2e-3);
  assert.ok(r.warnings.some((w) => /Erst das Wasser/.test(w.text)));
  r = calcKonzentriert({ formula: 'H2SO4', purity: '96', density: '1,84' }, S);
  near(r.values.c, (0.96 * 1840) / 98.072, 1e-6);
  r = calcKonzentriert({ formula: 'H2SO4', purity: '96' }, S);
  assert.deepEqual(r.missing.map((m) => m.param), ['density']);
});

// ---------------------------------------------------------------- D) Reihe
test('D: Zielliste lesen', () => {
  assert.deepEqual(parseTargetList('100; 50; 20', 'ng/mL').map((t) => t.value), [100, 50, 20]);
  assert.deepEqual(parseTargetList('100, 50, 20', 'ng/mL').map((t) => t.value), [100, 50, 20]);
  assert.deepEqual(parseTargetList('0,5; 1; 2', 'ng/mL').map((t) => t.value), [0.5, 1, 2]);
  assert.deepEqual(parseTargetList('0,5 1 2', 'ng/mL').map((t) => t.value), [0.5, 1, 2]);
  assert.deepEqual(parseTargetList('100 ng/mL\n5 µg/L', 'ng/mL').map((t) => t.unit.sym), ['ng/mL', 'µg/L']);
});

test('D: parallele Reihe mit tatsächlichen Konzentrationen', () => {
  const r = calcReihe({ stock: '10 µg/mL', targets: '100; 50; 20; 10', targetUnit: 'ng/mL', Vstd: '10 mL', mode: 'parallel' }, S);
  assert.equal(r.ok, true, r.error);
  const rows = r.table.rows;
  assert.equal(rows.length, 4);
  assert.equal(r.table.unit, 'ng/mL');
  near(rows[0].V, 100e-6);
  near(rows[3].V, 10e-6);
  rows.forEach((x) => near(x.actual, x.target, 1e-9));
});

test('D: Zwischenverdünnung wird vorgeschlagen und verwendet', () => {
  const base = { stock: '10 µg/mL', targets: '100; 10; 1', targetUnit: 'ng/mL', Vstd: '10 mL', mode: 'parallel' };
  let r = calcReihe(base, S);
  assert.ok(r.warnings.some((w) => /Zwischenverdünnung/.test(w.text)));
  assert.ok(r.table.rows.some((x) => x.notes.length));
  r = calcReihe({ ...base, useIntermediate: true }, S);
  assert.equal(r.table.rows[0].nr, 'Z');
  assert.ok(r.table.rows.filter((x) => !x.intermediate).every((x) => x.V >= 10e-6 * (1 - 1e-9)));
});

test('D: serielle 1:10-Reihe, Rundung wirkt sich auf die Konzentration aus', () => {
  const r = calcReihe({ stock: '1000 µg/L', Vstd: '10 mL', mode: 'serial', serialFactor: '10', serialCount: '3' }, S);
  assert.equal(r.ok, true, r.error);
  const rows = r.table.rows;
  assert.equal(rows.length, 3);
  near(rows[0].V, 1e-3);
  assert.equal(rows[1].src, 'Std 1');
  near(rows[2].actual, 1);
  near(rows[0].remaining, 9e-3);
  // mit Ausgleich: jedem Standard bleiben 10 mL
  const r2 = calcReihe({ stock: '1000 µg/L', Vstd: '10 mL', mode: 'serial', serialFactor: '10', serialCount: '3', compensate: true, round: false }, S);
  r2.table.rows.forEach((x) => near(x.remaining, 0.01, 1e-9));
  r2.table.rows.forEach((x) => near(x.actual, x.target, 1e-9));
});

test('D: Ziel größer als Stamm -> Fehler', () => {
  const r = calcReihe({ stock: '10 µg/mL', targets: '20', targetUnit: 'µg/mL', Vstd: '10 mL' }, S);
  assert.equal(r.ok, false);
  assert.equal(r.field, 'targets');
});

// ---------------------------------------------------------------- E) Umrechner
test('E: 10 ng/mL = 10 µg/L = 10 ppb = 2,4·10⁻⁸ mol/L (PFOA)', () => {
  const r = calcUmrechner({ quantity: '10 ng/mL', substance: db.get('pfoa') }, S);
  assert.equal(r.ok, true, r.error);
  const text = r.main[0].text;
  assert.match(text, /10 ng\/mL = 10 µg\/L = 10 ppb\* = 2,415·10⁻⁸ mol\/L/);
  assert.ok(r.hints.some((h) => /verdünnte wässrige Lösungen/.test(h)));
  const amount = r.table.groups.find((g) => g.kind === 'amount');
  near(amount.rows.find((x) => x.unit.sym === 'mol/L').value, 2.415e-8, 1e-3);
});

test('E: ohne Molare Masse bleiben mol/L-Einheiten offen und werden angefordert', () => {
  const r = calcUmrechner({ quantity: '5 ug/mL' }, S);
  assert.equal(r.ok, true);
  assert.ok(r.missing.some((m) => m.param === 'M'));
  assert.equal(r.table.groups.find((g) => g.kind === 'amount').rows.length, 0);
});

// ---------------------------------------------------------------- F) Interner Standard
test('F: Spiking mit Volumenzunahme und Chargenbedarf', () => {
  const r = calcIstd({ stock: '1 µg/mL', target: '10 ng/mL', sample: '1 mL', n: '24', reserve: '20', mode: 'add', round: false }, S);
  assert.equal(r.ok, true, r.error);
  near(r.values.Vis, (0.01 * 1e-3) / (1 - 0.01));
  near(r.values.total, r.values.Vis * 24 * 1.2);
  near(r.values.actual, 0.01, 1e-9);
});

test('F: festes Endvolumen und Vorschlag Arbeitslösung', () => {
  let r = calcIstd({ stock: '1 µg/mL', target: '10 ng/mL', sample: '1 mL', n: '10', mode: 'fill' }, S);
  near(r.values.Vis, 10e-6);
  r = calcIstd({ stock: '10 µg/mL', target: '1 ng/mL', sample: '1 mL', n: '24', reserve: '20' }, S);
  assert.ok(r.values.working);
  assert.ok(r.warnings.some((w) => /Arbeitslösung/.test(w.text)));
  r = calcIstd({ stock: '1 ng/mL', target: '10 ng/mL', sample: '1 mL', n: '1' }, S);
  assert.equal(r.ok, false);
});
