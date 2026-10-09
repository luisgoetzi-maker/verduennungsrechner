// Modus D: Verdünnungsreihe / Kalibrierreihe – Pipettierplan.
//  parallel: jeder Standard direkt aus der Stammlösung (optional über eine Zwischenverdünnung)
//  seriell:  jeder Standard aus dem vorherigen (z. B. 1:10-Schritte)

import { parseQuantity, CONC_KINDS, convert, KINDS } from '../units.js';
import { NumberError } from '../numbers.js';
import { UnitError } from '../units.js';
import { runCalc, readQuantity, readNumber, formatter, step, note, warn, addHint, CalcError, MissingParam, resolveMolarMass } from './common.js';
import { roundToPipette } from '../devices.js';
import { DEFAULT_SETTINGS } from '../settings.js';

/** Liest eine Liste von Konzentrationen: "100; 50; 20", "100, 50, 20", "0,5 1 2", je Zeile einer. */
export function parseTargetList(text, defaultUnit) {
  const s = String(text ?? '').trim();
  if (!s) throw new CalcError('Bitte Zielkonzentrationen eingeben (z. B. 100; 50; 20; 10).', 'targets');
  let items = s.split(/[;\n\t]+|,\s+/).map((x) => x.trim()).filter(Boolean);
  if (items.length === 1 && !/[a-zA-Zµμ%]/.test(items[0]) && /\s/.test(items[0])) items = items[0].split(/\s+/);
  return items.map((it, i) => {
    try {
      const q = parseQuantity(it, { defaultUnit: defaultUnit || undefined });
      if (!q.unit) throw new CalcError('Einheit fehlt.');
      if (!CONC_KINDS.includes(q.unit.kind)) throw new CalcError(`„${q.unit.sym}“ ist keine Konzentration.`);
      if (!(q.value > 0)) throw new CalcError('Wert muss größer als 0 sein.');
      return { value: q.value, unit: q.unit, base: q.value * q.unit.f, text: it };
    } catch (e) {
      if (e instanceof CalcError || e instanceof NumberError || e instanceof UnitError) {
        throw new CalcError(`Zielkonzentration ${i + 1} („${it}“): ${e.message}`, 'targets');
      }
      throw e;
    }
  });
}

/**
 * @param {object} input
 *   stock        Stammlösung {value, unit}
 *   targets      Liste als Text; targetUnit = Einheit für Zahlen ohne Einheit
 *   Vstd         Volumen je Standard
 *   mode         'parallel' | 'serial'
 *   serialFactor, serialCount   seriell: Schritte mit festem Faktor (statt Liste)
 *   compensate   seriell: Mehrvolumen einplanen, damit jedem Standard V bleibt
 *   useIntermediate  parallel: vorgeschlagene Zwischenverdünnung verwenden
 *   round        Pipettiervolumina auf Geräteauflösung runden (Standard: Einstellung)
 *   M, rhoSol, z Zusatzangaben, falls Stamm und Ziele verschiedene Größenarten haben
 */
export function calcReihe(input, settings = {}) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const f = formatter(S.sig);
  return runCalc((R) => {
    const stock = readQuantity(input.stock, { kinds: CONC_KINDS, label: 'Stammlösung', field: 'stock' });
    const Vstd = readQuantity(input.Vstd, { kinds: ['volume'], label: 'Volumen je Standard', field: 'Vstd' }).base;
    const mode = input.mode === 'serial' ? 'serial' : 'parallel';
    const round = input.round ?? S.roundPipette;
    const minL = S.minPipetteUL * 1e-6;
    const cu = stock.unit.sym;
    const c0 = stock.value;
    const params = {
      M: resolveMolarMass({ substance: input.substance, formula: input.formula, M: input.M }).M ?? undefined,
      rhoSol: readNumber(input.rhoSol, { label: 'Dichte der Lösung', field: 'rhoSol', min: 0 }) ?? undefined,
      z: readNumber(input.z, { label: 'Wertigkeit', field: 'z', min: 0 }) ?? input.substance?.z ?? undefined,
    };
    if (stock.unit.ppm) addHint(R, 'ppm');

    // Zielkonzentrationen in der Einheit der Stammlösung
    let targets;
    let list = null;
    const factor = readNumber(input.serialFactor, { label: 'Verdünnungsfaktor je Schritt', field: 'serialFactor', min: 1 });
    const count = readNumber(input.serialCount, { label: 'Anzahl Schritte', field: 'serialCount', min: 0 });
    if (mode === 'serial' && factor && count) {
      if (count > 30) throw new CalcError('Höchstens 30 Schritte.', 'serialCount');
      targets = [];
      for (let i = 1; i <= Math.round(count); i++) targets.push(c0 / factor ** i);
      R.steps.push(note('Reihe', `${Math.round(count)} Schritte mit Faktor ${f.n(factor)}: cᵢ = c₀ / ${f.n(factor)}ⁱ`));
    } else {
      list = parseTargetList(input.targets, input.targetUnit || cu);
      targets = list.map((t) => {
        if (t.unit.kind === stock.unit.kind) return t.base / stock.unit.f;
        const r = convert(t.value, t.unit, stock.unit, params);
        if (!r.ok) throw new MissingParam(r.missing);
        r.hints.forEach((h) => addHint(R, h));
        r.assumptions.forEach((a) => addHint(R, a));
        return r.value;
      });
    }
    // Anzeige in der Einheit der Zielliste (z. B. ng/mL), gerechnet wird in der Einheit der Stammlösung
    let du = cu;
    let dk = 1;
    if (list && list.every((t) => t.unit.sym === list[0].unit.sym) && list[0].unit.kind === stock.unit.kind) {
      du = list[0].unit.sym;
      dk = stock.unit.f / list[0].unit.f;
    }
    const cd = (x) => `${f.n(x * dk)} ${du}`;
    if (mode === 'serial') targets = [...targets].sort((a, b) => b - a);
    const tooHigh = targets.filter((t) => t > c0 * (1 + 1e-12));
    if (tooHigh.length) throw new CalcError(`Zielkonzentration ${cd(tooHigh[0])} ist größer als die Stammlösung (${cd(c0)}).`, 'targets');

    R.steps.push(note('Gegeben', `Stammlösung c₀ = ${f.q(stock)}; Volumen je Standard ${f.vol(Vstd)}; ${mode === 'serial' ? 'serielle' : 'parallele'} Verdünnung${round ? '; Pipettiervolumina gerundet auf Geräteauflösung' : ''}`));
    R.steps.push(note('Formel', 'V(Pipette) = c(Ziel) · V(Standard) / c(Quelle); tatsächlich c = c(Quelle) · V(gerundet) / V(Standard)'));

    const rows = [];
    const rnd = (L) => (round ? roundToPipette(L) : L);
    const flagRow = (row) => {
      row.notes = [];
      if (row.V > row.Vtot) row.notes.push('Volumen größer als Standardvolumen');
      else if (row.V < minL * (1 - 1e-9)) row.notes.push(`unter ${f.n(S.minPipetteUL)} µL`);
      if (row.F > S.maxStepFactor * (1 + 1e-9)) row.notes.push(`Faktor > ${f.n(S.maxStepFactor)} in einem Schritt`);
    };

    if (mode === 'parallel') {
      // Zwischenverdünnung vorschlagen, wenn nötig
      const problem = (t) => (t * Vstd) / c0 < minL * (1 - 1e-9) || c0 / t > S.maxStepFactor * (1 + 1e-9);
      const tmin = Math.min(...targets);
      let inter = null;
      if (targets.some(problem)) {
        const upper = (tmin * Vstd) / minL; // c(Zwischen) darf höchstens so groß sein
        const k = Math.max(1, Math.ceil(Math.log10(c0 / Math.min(upper, c0 / 10)) - 1e-9));
        const Fint = 10 ** k;
        const cint = c0 / Fint;
        const users = targets.filter((t) => problem(t) && t <= cint);
        const need = users.reduce((s, t) => s + (t * Vstd) / cint, 0) * 1.2;
        const flasks = S.flasksML.map((x) => x / 1000);
        let Vint = flasks.find((v) => v >= need && v / Fint >= minL) || flasks[flasks.length - 1];
        let Vs = Vint / Fint;
        inter = { F: Fint, c: cint, Vint, Vstock: Vs, users: users.length };
        if (input.useIntermediate) {
          Vs = rnd(Vs);
          const cintAct = (c0 * Vs) / Vint;
          inter.Vstock = Vs;
          inter.cActual = cintAct;
          R.steps.push(step('Zwischenverdünnung (Z)', 'c(Z) = c₀ · V(Stamm) / V(Z)', `${cd(c0)} · ${f.vol(Vs)} / ${f.vol(Vint)}`, `${cd(cintAct)}`));
          rows.push({ nr: 'Z', target: cint, src: 'Stamm', V: Vs, Vtot: Vint, solvent: Vint - Vs, actual: cintAct, F: c0 / cint, intermediate: true });
          R.checks.push({ type: 'pipette', L: Vs, label: 'Zwischenverdünnung' }, { type: 'flask', L: Vint }, { type: 'factor', F: Fint });
        } else {
          warn(R, `Einige Standards brauchen weniger als ${f.n(S.minPipetteUL)} µL Stammlösung oder einen Faktor über ${f.n(S.maxStepFactor)}. Vorschlag: Zwischenverdünnung 1:${f.n(Fint)} (${f.vol(Vs)} Stammlösung auf ${f.vol(Vint)} → ${cd(cint)}).`);
        }
      }
      targets.forEach((t, i) => {
        const fromInt = input.useIntermediate && inter && problem(t) && t <= inter.c;
        const src = fromInt ? inter.cActual : c0;
        const srcTarget = fromInt ? inter.c : c0;
        const Vexact = (t * Vstd) / src;
        const V = rnd(Vexact);
        const actual = (src * V) / Vstd;
        const row = { nr: i + 1, target: t, src: fromInt ? 'Z' : 'Stamm', V, Vexact, Vtot: Vstd, solvent: Vstd - V, actual, F: srcTarget / t };
        flagRow(row);
        rows.push(row);
        R.steps.push(step(`Std ${i + 1}`, null, `${cd(t)} · ${f.vol(Vstd)} / ${cd(src)}`, `${f.vol(Vexact)}${round && Math.abs(V - Vexact) > 1e-15 ? ` → gerundet ${f.vol(V)} → c = ${cd(actual)}` : ''}`));
        R.checks.push({ type: 'pipette', L: V, label: `Std ${i + 1}` }, { type: 'factor', F: row.F });
      });
      R.values.intermediate = inter;
    } else {
      // seriell: Volumen je Gefäß, ggf. mit Ausgleich für die Entnahme
      const n = targets.length;
      const Vtot = new Array(n).fill(Vstd);
      const transfer = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        const srcT = i === 0 ? c0 : targets[i - 1];
        transfer[i] = (targets[i] * Vtot[i]) / srcT;
        if (input.compensate && i > 0) Vtot[i - 1] = Vstd + transfer[i];
      }
      let prevActual = c0;
      const Vr = transfer.map(rnd);
      for (let i = 0; i < n; i++) {
        const srcT = i === 0 ? c0 : targets[i - 1];
        const actual = (prevActual * Vr[i]) / Vtot[i];
        const remaining = Vtot[i] - (i < n - 1 ? Vr[i + 1] : 0);
        const row = { nr: i + 1, target: targets[i], src: i === 0 ? 'Stamm' : `Std ${i}`, V: Vr[i], Vexact: transfer[i], Vtot: Vtot[i], solvent: Vtot[i] - Vr[i], actual, F: srcT / targets[i], remaining };
        flagRow(row);
        rows.push(row);
        R.steps.push(step(`Std ${i + 1}`, null, `${cd(targets[i])} · ${f.vol(Vtot[i])} / ${cd(srcT)}`,
          `${f.vol(transfer[i])}${round && Math.abs(Vr[i] - transfer[i]) > 1e-15 ? ` → gerundet ${f.vol(Vr[i])}` : ''} → c = ${cd(prevActual)} · ${f.vol(Vr[i])} / ${f.vol(Vtot[i])} = ${cd(actual)}`));
        R.checks.push({ type: 'pipette', L: Vr[i], label: `Std ${i + 1}` }, { type: 'factor', F: row.F });
        prevActual = actual;
      }
      if (!input.compensate && n > 1) warn(R, 'Seriell ohne Ausgleich: Aus jedem Standard wird Volumen für den nächsten entnommen – siehe Spalte „Rest“.', 'info');
    }

    const stockUse = rows.filter((r) => r.src === 'Stamm').reduce((s, r) => s + r.V, 0);
    R.values = { ...R.values, rows, stockUse, cUnit: du, mode };
    for (const r of rows) { r.target *= dk; r.actual *= dk; }
    R.table = { type: 'series', mode, unit: du, rows };
    R.main.push({ label: 'Standards', text: `${rows.filter((r) => !r.intermediate).length}`, primary: true });
    R.main.push({ label: 'Stammlösung gesamt', text: f.vol(stockUse), value: stockUse, unit: 'L' });
    const maxDev = Math.max(...rows.map((r) => Math.abs(r.actual - r.target) / r.target));
    if (round) R.main.push({ label: 'max. Abweichung durch Rundung', text: maxDev < 1e-9 ? 'keine' : `${f.n(maxDev * 100)} %`, value: maxDev });
    R.checks.push({ type: 'flask', L: Vstd });
    R.uncertainty = {
      kind: mode === 'serial' ? 'serial' : 'parallel',
      steps: rows.map((r) => ({ V1: r.V, V2: r.Vtot, label: String(r.nr), key: r.nr === 'Z' ? 'Z' : `Std ${r.nr}`, src: r.src })),
    };
    if (rows.some((r) => r.V > r.Vtot)) throw new CalcError('Mindestens ein Standard ist mit diesem Volumen nicht herstellbar (Pipettiervolumen > Standardvolumen).', 'targets');
    R.values.kindLabel = KINDS[stock.unit.kind].label;
  });
}
