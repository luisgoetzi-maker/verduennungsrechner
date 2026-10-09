import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, molarMass, tryParseFormula, FormulaError, hillFormula, prettyFormula } from '../js/core/formula.js';
import { ELEMENTS } from '../js/core/elements.js';

const near = (actual, expected, tol = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≠ ${expected} (±${tol})`);

test('alle 118 Elemente vorhanden', () => {
  assert.equal(Object.keys(ELEMENTS).length, 118);
  const z = Object.values(ELEMENTS).map((e) => e.z).sort((a, b) => a - b);
  z.forEach((v, i) => assert.equal(v, i + 1));
});

test('einfache Formeln', () => {
  near(molarMass('H2O'), 18.015);
  near(molarMass('NaCl'), 58.44);
  near(molarMass('H2SO4'), 98.072);
  near(molarMass('HCl'), 36.458);
  near(molarMass('C6H12O6'), 180.156);
});

test('Klammern, auch verschachtelt und eckig', () => {
  near(molarMass('Ca(OH)2'), 74.092);
  near(molarMass('Al2(SO4)3'), 342.131);
  near(molarMass('(NH4)2SO4'), 132.134);
  near(molarMass('K4[Fe(CN)6]'), 368.343);
  near(molarMass('Ca3(PO4)2'), 310.174);
  near(molarMass('((CH3)3C)2O'), 130.231);
  near(molarMass('{Cu(NH3)4}SO4'), 227.722);
});

test('Hydrate mit ·, ., * und Bruchfaktoren', () => {
  for (const f of ['CuSO4·5H2O', 'CuSO4.5H2O', 'CuSO4*5H2O', 'CuSO4•5H2O', 'CuSO₄·5H₂O']) {
    near(molarMass(f), 249.68, 0.01);
  }
  const r = parseFormula('CuSO4·5H2O');
  assert.equal(r.waterCount, 5);
  near(r.anhydrousMass, 159.60, 0.01);
  near(molarMass('CaSO4·0.5H2O'), 145.14, 0.01);
  near(molarMass('CaSO4·0,5H2O'), 145.14, 0.01);
  near(molarMass('CaSO4·½H2O'), 145.14, 0.01);
  near(molarMass('CaSO4·1/2H2O'), 145.14, 0.01);
  near(molarMass('C4H11NO3·HCl'), 157.59, 0.01);
  near(molarMass('Na2CO3.10H2O'), 286.14, 0.01);
});

test('Groß-/Kleinschreibung: Co ≠ CO', () => {
  near(molarMass('Co'), 58.933);
  near(molarMass('CO'), 28.010);
  assert.notEqual(molarMass('Co'), molarMass('CO'));
  near(molarMass('CoCl2'), 129.833);
});

test('Isotope und D/T', () => {
  near(molarMass('[13C]H4'), 17.035, 0.002);
  near(molarMass('^13CH4'), 17.035, 0.002);
  near(molarMass('¹³CH₄'), 17.035, 0.002);
  near(molarMass('D2O'), 20.028, 0.002);
  near(molarMass('CDCl3'), 120.38, 0.01);
  near(molarMass('[13C]8HF15O2'), 422.01, 0.01);
  near(molarMass('[13C]4C4HF15O2'), 418.04, 0.01);
  assert.throws(() => molarMass('[99C]H4'), FormulaError);
});

test('Ladungen', () => {
  const cases = [
    ['SO4^2-', -2], ['SO4(2-)', -2], ['SO4 2-', -2], ['SO4-2', -2], ['SO₄²⁻', -2], ['SO42-', -2],
    ['NH4+', 1], ['NH4^+', 1], ['Fe3+', 3], ['Fe^3+', 3], ['[Fe(CN)6]4-', -4], ['PO43-', -3], ['Cl-', -1], ['H2PO4-', -1],
  ];
  for (const [f, q] of cases) assert.equal(parseFormula(f).charge, q, f);
  near(molarMass('SO4^2-'), 96.06, 0.01);
  near(molarMass('SO42-'), 96.06, 0.01);
  near(molarMass('NH4+'), 18.04, 0.01);
  near(molarMass('Fe3+'), 55.845);
  near(molarMass('H2PO4-'), 96.99, 0.01);
  // heuristische Deutungen werden erklärt
  assert.ok(parseFormula('SO42-').notes.length > 0);
  assert.equal(parseFormula('SO4^2-').notes.length, 0);
});

test('verständliche Fehlermeldungen statt Absturz', () => {
  const bad = ['', '   ', 'h2so4', 'Xy', 'Ca(OH', 'Ca)OH(', 'H0', 'CuSO4·', '()', 'H2O$', 'Ca(OH]2', 'NaCl·'];
  for (const f of bad) {
    const r = tryParseFormula(f);
    assert.equal(r.ok, false, `„${f}“ sollte ungültig sein`);
    assert.ok(typeof r.error === 'string' && r.error.length > 5, `Fehlermeldung für „${f}“`);
  }
  assert.match(tryParseFormula('h2so4').error, /Großbuchstaben/);
  assert.match(tryParseFormula('Xy').error, /Unbekanntes Elementsymbol/);
  assert.match(tryParseFormula('Ca(OH').error, /Klammer/);
});

test('Hill-Notation und Anzeige', () => {
  assert.equal(parseFormula('CH3COOH').hill, 'C2H4O2');
  assert.equal(parseFormula('H2SO4').hill, 'H2O4S');
  assert.equal(parseFormula('CuSO4·5H2O').hill, 'CuH10O9S');
  assert.equal(hillFormula({ C: 4, '13C': 4, H: 1, F: 15, O: 2 }), 'C4[13C]4HF15O2');
  assert.equal(prettyFormula('CuSO4·5H2O'), 'CuSO₄·5H₂O');
  assert.equal(prettyFormula('CaSO4.0.5H2O'), 'CaSO₄·0,5H₂O');
  assert.equal(parseFormula('SO4^2-').pretty, 'SO₄²⁻');
  assert.equal(parseFormula('[13C]8HF15O2').pretty, '¹³C₈HF₁₅O₂');
});

test('Elemente ohne Standardatomgewicht erzeugen eine Warnung', () => {
  const r = parseFormula('TcO4-');
  assert.ok(r.warnings.some((w) => /Standardatomgewicht/.test(w)));
});
