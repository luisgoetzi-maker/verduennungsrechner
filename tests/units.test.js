import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnit, parseQuantity, convert, convertAll, UnitError, bestUnit, autoVolume, autoMass } from '../js/core/units.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-300, `${a} ≠ ${b}`);

test('Präfixe und Basiseinheiten', () => {
  const cases = [
    ['mg/L', 'mass', 1e-3], ['µg/mL', 'mass', 1e-3], ['ug/mL', 'mass', 1e-3], ['μg/mL', 'mass', 1e-3],
    ['ng/mL', 'mass', 1e-6], ['ng/L', 'mass', 1e-9], ['µg/L', 'mass', 1e-6], ['g/L', 'mass', 1],
    ['M', 'amount', 1], ['mM', 'amount', 1e-3], ['µM', 'amount', 1e-6], ['uM', 'amount', 1e-6], ['nM', 'amount', 1e-9],
    ['pM', 'amount', 1e-12], ['mol/L', 'amount', 1], ['mmol/L', 'amount', 1e-3], ['mol/l', 'amount', 1],
    ['% (m/V)', 'mass', 10], ['% (m/m)', 'massfrac', 0.01], ['% (V/V)', 'volfrac', 0.01],
    ['ppm', 'massfrac', 1e-6], ['ppb', 'massfrac', 1e-9], ['ppt', 'massfrac', 1e-12],
    ['mol/kg', 'molality', 1], ['mmol/kg', 'molality', 1e-3], ['eq/L', 'normality', 1], ['meq/L', 'normality', 1e-3],
    ['N', 'normality', 1], ['mN', 'normality', 1e-3], ['mL', 'volume', 1e-3], ['µL', 'volume', 1e-6], ['kg', 'massq', 1e3],
    ['mg', 'massq', 1e-3], ['mmol', 'amountq', 1e-3], ['Mg/L', 'mass', 1e6], ['kg/L', 'mass', 1e3], ['g/100 mL', 'mass', 10],
    ['mg L-1', 'mass', 1e-3], ['mg·L⁻¹', 'mass', 1e-3], ['mg/kg', 'massfrac', 1e-6], ['µL/mL', 'volfrac', 1e-3],
  ];
  for (const [s, kind, f] of cases) {
    const u = parseUnit(s);
    assert.equal(u.kind, kind, s);
    near(u.f, f);
  }
});

test('"M" allein = mol/L, "mM" = millimolar, "MM" = megamolar', () => {
  assert.equal(parseUnit('M').kind, 'amount');
  assert.equal(parseUnit('M').f, 1);
  assert.equal(parseUnit('mM').f, 1e-3);
  assert.equal(parseUnit('MM').f, 1e6);
});

test('% ohne Angabe ist mehrdeutig, unbekannte Einheiten werfen', () => {
  assert.throws(() => parseUnit('%'), (e) => e instanceof UnitError && e.code === 'percent-ambiguous');
  assert.throws(() => parseUnit('mg/xyz'), UnitError);
  assert.throws(() => parseUnit('furlong'), UnitError);
});

test('Freitext-Mengenangaben', () => {
  let q = parseQuantity('5 µg/mL');
  assert.equal(q.value, 5);
  assert.equal(q.unit.sym, 'µg/mL');
  q = parseQuantity('10 ng/mL');
  assert.equal(q.value, 10);
  assert.equal(q.unit.sym, 'ng/mL');
  q = parseQuantity('0,1 M');
  assert.equal(q.value, 0.1);
  assert.equal(q.unit.kind, 'amount');
  q = parseQuantity('2,4·10⁻⁸ mol/L');
  near(q.value, 2.4e-8);
  q = parseQuantity('5ug/ml');
  assert.equal(q.unit.sym, 'µg/mL');
  q = parseQuantity('250', { defaultUnit: 'mL' });
  assert.equal(q.unit.sym, 'mL');
  q = parseQuantity('1,5e-3 M');
  near(q.value, 1.5e-3);
  assert.throws(() => parseQuantity('250 mL', { kinds: ['mass'] }), UnitError);
});

test('Umrechnung innerhalb einer Größenart', () => {
  near(convert(10, 'ng/mL', 'µg/L').value, 10);
  near(convert(1, 'mg/mL', 'g/L').value, 1);
  near(convert(1, 'M', 'mM').value, 1000);
  near(convert(5, 'µg/mL', 'mg/L').value, 5);
  near(convert(0.9, '% (m/V)', 'g/L').value, 9);
});

test('Umrechnung zwischen Größenarten verlangt Zusatzangaben statt zu raten', () => {
  let r = convert(1, 'mg/L', 'mol/L');
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['M']);
  r = convert(1, 'mol/L', 'eq/L');
  assert.deepEqual(r.missing, ['z']);
  r = convert(37, '% (m/m)', 'mol/L', { M: 36.46 });
  assert.deepEqual(r.missing, ['rhoSol']);
  r = convert(10, '% (V/V)', 'g/L');
  assert.deepEqual(r.missing, ['rhoSub']);
  r = convert(10, '% (V/V)', 'g/L', { rhoSub: 0.789 });
  near(r.value, 78.9);
  assert.ok(r.hints.includes('volfrac'));
  r = convert(0.1, 'M', 'N', { z: 2 });
  near(r.value, 0.2);
});

test('ppm/ppb: Hinweis auf verdünnte wässrige Lösung', () => {
  const r = convert(10, 'ng/mL', 'ppb');
  near(r.value, 10);
  assert.ok(r.hints.includes('ppm'));
  assert.ok(r.assumptions.includes('ppmAssumed'));
  // mit angegebener Dichte keine Annahme
  const r2 = convert(10, 'ng/mL', 'ppb', { rhoSol: 1.2 });
  near(r2.value, 10 / 1.2);
  assert.equal(r2.assumptions.length, 0);
  // mg/kg ist kein ppm-Kürzel: Dichte wird verlangt
  assert.equal(convert(10, 'mg/L', 'mg/kg').ok, false);
});

test('Molalität', () => {
  // 1 mol/L NaCl, Dichte 1,037 g/mL -> Lösungsmittel = 1037 - 58,44 g
  const r = convert(1, 'mol/L', 'mol/kg', { M: 58.44, rhoSol: 1.037 });
  near(r.value, 1000 / (1037 - 58.44), 1e-9);
  const back = convert(r.value, 'mol/kg', 'mol/L', { M: 58.44, rhoSol: 1.037 });
  near(back.value, 1, 1e-9);
});

test('Übersicht in alle Einheiten', () => {
  const r = convertAll(10, 'ng/mL', { M: 414.07 });
  const g = Object.fromEntries(r.groups.map((x) => [x.kind, x]));
  assert.equal(g.mass.best.sym, 'µg/L');
  assert.equal(g.amount.best.sym, 'nmol/L');
  assert.ok(g.massfrac.rows.some((x) => x.unit.sym === 'ppb' && Math.abs(x.value - 10) < 1e-9));
  assert.ok(g.massfrac.missing.includes('rhoSol'));
  assert.ok(g.normality.missing.includes('z'));
  assert.ok(r.hints.includes('ppm'));
});

test('automatische Einheitenwahl', () => {
  assert.equal(autoVolume(0.00828).sym, 'mL');
  assert.equal(autoVolume(5e-6).sym, 'µL');
  assert.equal(autoMass(0.0124).sym, 'mg');
  assert.equal(autoMass(6.24).sym, 'g');
  assert.equal(bestUnit(2.4e-8, ['mol/L', 'mmol/L', 'µmol/L', 'nmol/L']).sym, 'nmol/L');
});
