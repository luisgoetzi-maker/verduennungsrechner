// Abnahmetests aus der Aufgabenstellung (Etappe 1: Rechenkern)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { molarMass } from '../js/core/formula.js';
import { convert, parseUnit, parseQuantity } from '../js/core/units.js';

const between = (v, lo, hi, msg) => assert.ok(v >= lo && v <= hi, `${msg}: ${v} nicht in [${lo}, ${hi}]`);

test('H2SO4: ca. 98,07–98,08 g/mol', () => {
  between(molarMass('H2SO4'), 98.07, 98.08, 'H2SO4');
});

test('CuSO4·5H2O: ca. 249,68 g/mol', () => {
  between(molarMass('CuSO4·5H2O'), 249.675, 249.685, 'CuSO4·5H2O');
});

test('EDTA C10H16N2O8: ca. 292,24 g/mol; Na2EDTA·2H2O: ca. 372,24 g/mol', () => {
  between(molarMass('C10H16N2O8'), 292.235, 292.245, 'EDTA');
  between(molarMass('C10H14N2Na2O8·2H2O'), 372.235, 372.245, 'Na2EDTA·2H2O');
});

test('0,9 % (m/V) NaCl = 9 g/L', () => {
  const r = convert(0.9, '% (m/V)', 'g/L');
  assert.ok(Math.abs(r.value - 9) < 1e-12);
});

test('HCl 37 % (m/m), Dichte 1,19 g/mL: ca. 12,1 mol/L', () => {
  const r = convert(37, '% (m/m)', 'mol/L', { M: molarMass('HCl'), rhoSol: 1.19 });
  assert.equal(r.ok, true);
  between(r.value, 12.05, 12.15, 'HCl 37 %');
});

test('10 ng/mL PFOA (C8HF15O2, ca. 414,07 g/mol): ca. 2,4·10⁻⁸ mol/L', () => {
  const M = molarMass('C8HF15O2');
  between(M, 414.06, 414.08, 'M(PFOA)');
  const r = convert(10, 'ng/mL', 'mol/L', { M });
  between(r.value, 2.40e-8, 2.42e-8, 'PFOA');
});

test('5 mL Stammlösung 1000 µg/mL auf 50 mL aufgefüllt: 100 µg/mL', () => {
  // c2 = c1 · V1 / V2 (Rechenkern: Einheiten)
  const c1 = parseQuantity('1000 µg/mL');
  const V1 = parseQuantity('5 mL');
  const V2 = parseQuantity('50 mL');
  const c2Base = (c1.value * c1.unit.f * V1.value * V1.unit.f) / (V2.value * V2.unit.f);
  const c2 = c2Base / parseUnit('µg/mL').f;
  assert.ok(Math.abs(c2 - 100) < 1e-9);
});

test('"mM" wird als millimolar gelesen, "µg/mL" und "ug/mL" sind gleichwertig', () => {
  const mM = parseUnit('mM');
  assert.equal(mM.kind, 'amount');
  assert.equal(mM.f, 1e-3);
  const a = parseUnit('µg/mL');
  const b = parseUnit('ug/mL');
  assert.equal(a.kind, b.kind);
  assert.equal(a.f, b.f);
  assert.equal(a.sym, b.sym);
});
