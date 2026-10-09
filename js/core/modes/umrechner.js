// Modus E: Einheiten-Umrechner – ein Wert in allen sinnvollen Einheiten.

(function () {
  'use strict';
  const { CONC_KINDS, convertAll, HINTS, PARAMS, convert, bestUnit, parseUnit } = VR.use('core/units.js');
  const { runCalc, readQuantity, readNumber, formatter, step, note, resolveMolarMass, activeExtras, componentName } = VR.use('core/modes/common.js');

/**
 * @param {object} input {quantity, substance?, formula?, M?, rhoSol?, rhoSub?, z?}
 */
function calcUmrechner(input, settings = {}) {
  const f = formatter(settings.sig || 4);
  return runCalc((R) => {
    const q = readQuantity(input.quantity, { kinds: CONC_KINDS, label: 'Wert', field: 'quantity' });
    const sub = input.substance || null;
    const mm = resolveMolarMass({ substance: sub, formula: input.formula, M: input.M });
    const params = {
      M: mm.M ?? undefined,
      rhoSol: readNumber(input.rhoSol, { label: 'Dichte der Lösung', field: 'rhoSol', min: 0 }) ?? undefined,
      rhoSub: readNumber(input.rhoSub, { label: 'Dichte des reinen Stoffes', field: 'rhoSub', min: 0 }) ?? sub?.density ?? undefined,
      z: readNumber(input.z, { label: 'Wertigkeit', field: 'z', min: 0 }) ?? sub?.z ?? undefined,
    };
    const res = convertAll(q.value, q.unit, params);

    const given = [`${f.q(q)}`];
    if (params.M) given.push(`M = ${f.M(params.M)}${mm.source ? ` (${mm.source})` : ''}`);
    if (params.rhoSol) given.push(`ρ(Lösung) = ${f.n(params.rhoSol)} g/mL`);
    if (params.rhoSub) given.push(`ρ(Stoff) = ${f.n(params.rhoSub)} g/mL`);
    if (params.z) given.push(`z = ${f.n(params.z)}`);
    R.steps.push(note(`Gegeben${mm.label && mm.label !== 'Stoff' ? ` (${mm.label})` : ''}`, given.join('; ')));

    // Rechenweg: Formeln der verwendeten Umrechnungen mit Zahlen
    const g = (kind) => res.groups.find((x) => x.kind === kind);
    const massRow = g('mass').rows.find((r) => r.unit.sym === 'g/L');
    const beta = massRow ? massRow.value : null;
    if (q.unit.kind !== 'mass' && beta !== null) {
      R.steps.push(step('Massenkonzentration', 'β', `${f.q(q)}`, `${f.n(beta)} g/L`));
    }
    if (beta !== null && params.M && q.unit.kind !== 'amount') {
      R.steps.push(step('Stoffmengenkonzentration', 'c = β / M', `${f.n(beta)} g/L / ${f.M(params.M)}`, `${f.n(beta / params.M)} mol/L`));
    }
    if (q.unit.kind === 'amount' && params.M) {
      R.steps.push(step('Massenkonzentration', 'β = c · M', `${f.n(q.base)} mol/L · ${f.M(params.M)}`, `${f.n(q.base * params.M)} g/L`));
    }
    if (beta !== null && q.unit.kind !== 'massfrac') {
      const rho = params.rhoSol || 1;
      const assumed = !params.rhoSol;
      if (params.rhoSol || g('massfrac').rows.length) {
        R.steps.push(step(`Massenanteil${assumed ? ' (ρ = 1 g/mL angenommen)' : ''}`, 'w = β / ρ(Lösung)', `${f.n(beta)} g/L / ${f.n(rho * 1000)} g/L`, `${f.n(beta / (rho * 1000))} ≙ ${f.n((beta / (rho * 1000)) * 1e6)} ppm`));
      }
    }
    if (params.z && params.M && q.unit.kind !== 'normality' && beta !== null) {
      R.steps.push(step('Äquivalentkonzentration', 'c(eq) = z · c', `${f.n(params.z)} · ${f.n(beta / params.M)} mol/L`, `${f.n((params.z * beta) / params.M)} eq/L`));
    }
    if (params.rhoSub && beta !== null && q.unit.kind !== 'volfrac') {
      R.steps.push(step('Volumenanteil', 'φ = β / ρ(Stoff)', `${f.n(beta)} g/L / ${f.n(params.rhoSub * 1000)} g/L`, `${f.n(beta / (params.rhoSub * 1000) * 100)} % (V/V)`));
    }

    // Zusammenfassung: beste Einheit je Größenart, Eingabeeinheit zuerst
    // (Reihenfolge wie im Labor üblich: 10 ng/mL = 10 µg/L = 10 ppb = 2,4·10⁻⁸ mol/L)
    const parts = [`${f.n(q.value)} ${q.unit.sym}`];
    for (const kind of ['mass', 'massfrac', 'volfrac', 'amount', 'normality', 'molality']) {
      const grp = g(kind);
      if (!grp.best) continue;
      const row = grp.rows.find((r) => r.unit.sym === grp.best.sym);
      if (!row || row.unit.sym === q.unit.sym) continue;
      if (kind === 'amount' && row.unit.sym !== 'mol/L' && q.unit.kind !== 'amount') {
        const molRow = grp.rows.find((r) => r.unit.sym === 'mol/L');
        parts.push(`${f.n(molRow.value)} mol/L (${f.n(row.value)} ${row.unit.sym})`);
        continue;
      }
      parts.push(`${f.n(row.value)} ${row.unit.sym}${row.assumed ? '*' : ''}`);
    }
    R.main.push({ label: 'Ergebnis', text: parts.join(' = '), primary: true });
    // Derselbe Wert für weitere Stoffe (＋): Umrechnung über die jeweilige Molare Masse
    const extras = activeExtras(input);
    if (extras.length) {
      const amountUnits = ['mol/L', 'mmol/L', 'µmol/L', 'nmol/L', 'pmol/L'];
      const massUnits = ['g/L', 'mg/L', 'µg/L', 'ng/L', 'pg/mL'];
      const show = (value, unitSym, list) => {
        const u = bestUnit(value * parseUnit(unitSym).f, list);
        return `${f.n((value * parseUnit(unitSym).f) / u.f)} ${u.sym}`;
      };
      const rows = [];
      const all = [{ ...input, nr: 1 }, ...extras.map((e, i) => ({ ...e, nr: i + 2 }))];
      for (const e of all) {
        const name = e.nr === 1 ? (mm.label && mm.label !== 'Stoff' ? mm.label : 'Stoff 1') : componentName(e, e.nr);
        const m = e.nr === 1 ? mm : resolveMolarMass({ substance: e.substance, formula: e.formula });
        if (!m.M) { rows.push([name, '–', 'Molare Masse fehlt', '']); continue; }
        const p = { ...params, M: m.M, z: e.substance?.z ?? undefined, rhoSub: e.substance?.density ?? undefined };
        const ra = convert(q.value, q.unit, 'mol/L', p);
        const rm = convert(q.value, q.unit, 'g/L', p);
        rows.push([name, f.M(m.M), ra.ok ? show(ra.value, 'mol/L', amountUnits) : 'Angabe fehlt', rm.ok ? show(rm.value, 'g/L', massUnits) : 'Angabe fehlt']);
      }
      R.extraTable = { title: `${f.q(q)} für mehrere Stoffe`, headers: ['Stoff', 'M', 'Stoffmenge', 'Masse'], rows };
    }
    R.table = { type: 'convert', groups: res.groups.map((grp) => ({ ...grp, rows: grp.rows.map((r) => ({ ...r, text: f.n(r.value) })) })) };
    res.hints.forEach((h) => HINTS[h] && R.hints.push(HINTS[h]));
    if (res.assumptions.includes('ppmAssumed')) R.hints.push(`* ${HINTS.ppmAssumed}`);
    // Fehlende Angaben für weitere Einheiten (kein Fehler, nur Hinweis)
    const missing = [...new Set(res.groups.flatMap((grp) => (grp.rows.length && grp.kind !== 'massfrac' ? [] : grp.missing)))];
    R.missing = missing.map((p) => ({ param: p, ...PARAMS[p], optional: true }));
    R.values = { value: q.value, unit: q.unit.sym, params };
    // Plausibilität der eingegebenen Werte
    if (q.unit.kind === 'massfrac' && q.base > 1) R.warnings.push({ level: 'error', text: 'Massenanteil über 100 % ist nicht möglich.' });
    if (q.unit.kind === 'volfrac' && q.base > 1) R.warnings.push({ level: 'error', text: 'Volumenanteil über 100 % ist nicht möglich.' });
  });
}

  VR.provide('core/modes/umrechner.js', { calcUmrechner });
}());
