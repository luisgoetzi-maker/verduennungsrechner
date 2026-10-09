// Modus B: Verdünnung c1·V1 = c2·V2 – drei Größen eingeben, die vierte wird berechnet.

import { CONC_KINDS, convert, parseUnit, autoVolume } from '../units.js';
import { runCalc, readQuantity, readNumber, formatter, step, note, warn, addHint, CalcError, MissingParam, resolveMolarMass } from './common.js';

const FIELDS = ['c1', 'V1', 'c2', 'V2'];
const LABELS = { c1: 'Ausgangskonzentration c₁', V1: 'Volumen Stammlösung V₁', c2: 'Zielkonzentration c₂', V2: 'Endvolumen V₂' };

function isEmpty(x) {
  if (x === null || x === undefined) return true;
  if (typeof x === 'string') return !x.trim();
  return x.value === null || x.value === undefined || String(x.value).trim() === '';
}

function unitOf(x, fallback) {
  try {
    return parseUnit((x && typeof x === 'object' && x.unit) || fallback);
  } catch {
    return parseUnit(fallback);
  }
}

/**
 * @param {object} input {c1, V1, c2, V2, solveFor?, M?, rhoSol?, z?, rhoSub?}
 *   Das leere Feld (oder solveFor) wird berechnet. Für die gesuchte Größe
 *   bestimmt die mitgegebene Einheit die Ausgabe.
 */
export function calcVerduennung(input, settings = {}) {
  const f = formatter(settings.sig || 4);
  return runCalc((R) => {
    let solve = input.solveFor;
    if (!solve) {
      const empty = FIELDS.filter((k) => isEmpty(input[k]));
      if (empty.length === 0) throw new CalcError('Bitte ein Feld leer lassen – es wird berechnet.', null);
      if (empty.length > 1) throw new CalcError(`Bitte drei der vier Größen eingeben (fehlt: ${empty.map((k) => LABELS[k]).join(', ')}).`, empty[0]);
      solve = empty[0];
    }
    const params = {
      M: resolveMolarMass({ substance: input.substance, formula: input.formula, M: input.M }).M ?? undefined,
      rhoSol: readNumber(input.rhoSol, { label: 'Dichte der Lösung', field: 'rhoSol', min: 0 }) ?? undefined,
      z: readNumber(input.z, { label: 'Wertigkeit', field: 'z', min: 0 }) ?? input.substance?.z ?? undefined,
      rhoSub: readNumber(input.rhoSub, { label: 'Dichte des Stoffes', field: 'rhoSub', min: 0 }) ?? input.substance?.density ?? undefined,
    };
    const q = {};
    for (const k of FIELDS) {
      if (k === solve) continue;
      q[k] = readQuantity(input[k], { kinds: k[0] === 'c' ? CONC_KINDS : ['volume'], label: LABELS[k], field: k });
    }

    // Konzentrationen in derselben Einheit wie c1 (bzw. c2) ausdrücken
    const refUnit = q.c1 ? q.c1.unit : q.c2.unit;
    const toRef = (qty) => {
      if (qty.unit.kind === refUnit.kind) return qty.base / refUnit.f;
      const r = convert(qty.value, qty.unit, refUnit, params);
      r.hints.forEach((h) => addHint(R, h));
      r.assumptions.forEach((a) => addHint(R, a));
      if (!r.ok) throw new MissingParam(r.missing);
      R.steps.push(step('Einheit angleichen', `${f.q(qty)}`, null, `${f.n(r.value)} ${refUnit.sym}`));
      return r.value;
    };
    const cu = refUnit.sym;
    const vUnit = parseUnit((q.V2 || q.V1).unit.sym);
    const vu = vUnit.sym;
    const vIn = (qty) => qty.base / vUnit.f;

    if (refUnit.ppm) addHint(R, 'ppm');
    if (['massfrac', 'molality'].includes(refUnit.kind) && !refUnit.ppm) {
      warn(R, 'c₁·V₁ = c₂·V₂ gilt streng nur für volumenbezogene Konzentrationen (mol/L, g/L). Bei Massenanteilen und Molalität ist das Ergebnis nur für verdünnte Lösungen mit ähnlicher Dichte eine Näherung.', 'info');
    }
    if (refUnit.kind === 'volfrac') addHint(R, 'volfrac');

    R.steps.push(note('Grundgleichung', 'c₁ · V₁ = c₂ · V₂'));
    let c1; let c2; let V1; let V2; // c in refUnit, V in vUnit
    switch (solve) {
      case 'c2': {
        c1 = q.c1.value * (q.c1.unit.f / refUnit.f); V1 = vIn(q.V1); V2 = vIn(q.V2);
        c2 = (c1 * V1) / V2;
        R.steps.push(step('gesucht c₂', 'c₂ = c₁ · V₁ / V₂', `${f.n(c1)} ${cu} · ${f.n(V1)} ${vu} / ${f.n(V2)} ${vu}`, `${f.n(c2)} ${cu}`));
        break;
      }
      case 'c1': {
        c2 = toRef(q.c2); V1 = vIn(q.V1); V2 = vIn(q.V2);
        c1 = (c2 * V2) / V1;
        R.steps.push(step('gesucht c₁', 'c₁ = c₂ · V₂ / V₁', `${f.n(c2)} ${cu} · ${f.n(V2)} ${vu} / ${f.n(V1)} ${vu}`, `${f.n(c1)} ${cu}`));
        break;
      }
      case 'V1': {
        c1 = q.c1.value; c2 = toRef(q.c2); V2 = vIn(q.V2);
        V1 = (c2 * V2) / c1;
        R.steps.push(step('gesucht V₁', 'V₁ = c₂ · V₂ / c₁', `${f.n(c2)} ${cu} · ${f.n(V2)} ${vu} / ${f.n(c1)} ${cu}`, `${f.n(V1)} ${vu}`));
        break;
      }
      case 'V2': {
        c1 = q.c1.value; c2 = toRef(q.c2); V1 = vIn(q.V1);
        V2 = (c1 * V1) / c2;
        R.steps.push(step('gesucht V₂', 'V₂ = c₁ · V₁ / c₂', `${f.n(c1)} ${cu} · ${f.n(V1)} ${vu} / ${f.n(c2)} ${cu}`, `${f.n(V2)} ${vu}`));
        break;
      }
      default:
        throw new CalcError('Unbekannte gesuchte Größe.', null);
    }

    if (c2 > c1 * (1 + 1e-12)) {
      throw new CalcError('Die Zielkonzentration ist größer als die Ausgangskonzentration – durch Verdünnen nicht erreichbar.', solve === 'c2' || solve === 'c1' ? 'V1' : 'c2');
    }
    if (V1 > V2 * (1 + 1e-12)) throw new CalcError('Das Volumen der Stammlösung ist größer als das Endvolumen.', solve === 'V1' ? 'c2' : 'V1');

    const V1L = V1 * vUnit.f;
    const V2L = V2 * vUnit.f;
    const F = V2 / V1;
    R.steps.push(step('Verdünnungsfaktor', 'F = c₁ / c₂ = V₂ / V₁', `${f.n(c1)} / ${f.n(c2)}`, f.n(F)));
    const solvent = V2L - V1L;
    R.steps.push(step('Lösungsmittel (ungefähr)', 'V(LM) ≈ V₂ − V₁', `${f.vol(V2L)} − ${f.vol(V1L)}`, f.vol(solvent)));

    // Hauptergebnis in der gewünschten Einheit
    if (solve === 'c1' || solve === 'c2') {
      const want = unitOf(input[solve], cu);
      const value = solve === 'c1' ? c1 : c2;
      let text = `${f.n(value)} ${cu}`;
      if (want.sym !== cu) {
        const r = convert(value, refUnit, want, params);
        if (r.ok) text = `${f.n(r.value)} ${want.sym}`;
      }
      R.main.push({ label: solve === 'c1' ? 'Ausgangskonzentration c₁' : 'Zielkonzentration c₂', text, value, unit: cu, primary: true });
    } else {
      const L = solve === 'V1' ? V1L : V2L;
      const want = unitOf(input[solve], vu);
      const auto = autoVolume(L);
      let text = `${f.n(L / want.f)} ${want.sym}`;
      if (auto.sym !== want.sym) text += ` (= ${f.vol(L)})`;
      R.main.push({ label: solve === 'V1' ? 'Volumen Stammlösung V₁' : 'Endvolumen V₂', text, value: L, unit: 'L', primary: true });
    }
    R.main.push({ label: 'Verdünnungsfaktor', text: F <= 1000 ? `F = ${f.n(F)}  (1 + ${f.n(F - 1)})` : `F = ${f.n(F)}`, value: F });
    R.instruction = `${f.vol(V1L)} Stammlösung (${f.n(c1)} ${cu}) auf ${f.vol(V2L)} auffüllen → ${f.n(c2)} ${cu}.`;
    R.values = { c1, c2, cUnit: cu, V1: V1L, V2: V2L, F, solvent };
    R.checks.push({ type: 'pipette', L: V1L, label: 'Stammlösung' }, { type: 'flask', L: V2L }, { type: 'factor', F });
    R.uncertainty = { kind: 'dilution', steps: [{ V1: V1L, V2: V2L }] };
  });
}
