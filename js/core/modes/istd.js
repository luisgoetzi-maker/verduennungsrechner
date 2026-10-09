// Modus F: Interner Standard (Spiking) – Zugabevolumen je Probe und
// Gesamtbedarf für eine Charge mit n Proben inklusive Reserve.

(function () {
  'use strict';
  const { CONC_KINDS, convert } = VR.use('core/units.js');
  const { runCalc, readQuantity, readNumber, formatter, step, note, warn, addHint, CalcError, MissingParam, resolveMolarMass, activeExtras, componentName } = VR.use('core/modes/common.js');
  const { roundToPipette } = VR.use('core/devices.js');
  const { DEFAULT_SETTINGS } = VR.use('core/settings.js');

/**
 * @param {object} input
 *   stock      Konzentration der IS-Lösung
 *   target     gewünschte IS-Konzentration in der Endlösung
 *   mode       'add'  – IS wird zur Probe gegeben, Volumen addiert sich (V_end = V_Probe + V_IS)
 *              'fill' – Endvolumen ist fest (IS zugeben, dann auffüllen)
 *   sample     Probenvolumen (mode 'add') bzw. Endvolumen (mode 'fill')
 *   n          Anzahl Proben (inkl. Kalibrierstandards, Blindwerte, QCs)
 *   reserve    Reserve in %
 *   round      Zugabevolumen auf Pipettenauflösung runden
 */
function calcIstd(input, settings = {}) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const f = formatter(S.sig);
  return runCalc((R) => {
    const stock = readQuantity(input.stock, { kinds: CONC_KINDS, label: 'Konzentration IS-Lösung', field: 'stock' });
    const target = readQuantity(input.target, { kinds: CONC_KINDS, label: 'IS-Konzentration in der Endlösung', field: 'target' });
    const mode = input.mode === 'fill' ? 'fill' : 'add';
    const V = readQuantity(input.sample, { kinds: ['volume'], label: mode === 'add' ? 'Probenvolumen' : 'Endvolumen', field: 'sample' }).base;
    const n = readNumber(input.n, { label: 'Anzahl Proben', field: 'n', min: 0 }) ?? 1;
    if (!Number.isInteger(n)) throw new CalcError('Anzahl Proben: bitte eine ganze Zahl eingeben.', 'n');
    const reserve = readNumber(input.reserve, { label: 'Reserve', field: 'reserve', min: 0, minExclusive: false }) ?? 0;
    const round = input.round ?? S.roundPipette;
    const cu = stock.unit.sym;
    const params = {
      M: resolveMolarMass({ substance: input.substance, formula: input.formula, M: input.M }).M ?? undefined,
      rhoSol: readNumber(input.rhoSol, { label: 'Dichte', field: 'rhoSol', min: 0 }) ?? undefined,
    };
    if (stock.unit.ppm) addHint(R, 'ppm');

    let ct = target.value;
    if (target.unit.sym !== cu) {
      const r = convert(target.value, target.unit, stock.unit, params);
      if (!r.ok) throw new MissingParam(r.missing);
      r.hints.forEach((h) => addHint(R, h));
      r.assumptions.forEach((a) => addHint(R, a));
      ct = r.value;
      R.steps.push(step('Einheit angleichen', f.q(target), null, `${f.n(ct)} ${cu}`));
    }
    const cs = stock.value;
    if (ct >= cs) throw new CalcError('Die Zielkonzentration muss kleiner als die Konzentration der IS-Lösung sein.', 'target');

    R.steps.push(note('Gegeben', `c(IS-Lösung) = ${f.q(stock)}; c(Ziel) = ${f.n(ct)} ${cu}; ${mode === 'add' ? 'Probenvolumen' : 'Endvolumen'} ${f.vol(V)}; ${n} Proben; Reserve ${f.n(reserve)} %`));
    let Vis;
    if (mode === 'add') {
      Vis = (ct * V) / (cs - ct);
      R.steps.push(note('Ansatz', 'c(Ziel) = c(IS) · V(IS) / (V(Probe) + V(IS))  →  V(IS) = c(Ziel) · V(Probe) / (c(IS) − c(Ziel))'));
      R.steps.push(step('Zugabe je Probe', 'V(IS) = c(Ziel) · V(Probe) / (c(IS) − c(Ziel))', `${f.n(ct)} ${cu} · ${f.vol(V)} / (${f.n(cs)} − ${f.n(ct)}) ${cu}`, f.vol(Vis)));
      const approx = (ct * V) / cs;
      if (Math.abs(approx - Vis) / Vis > 0.001) {
        R.steps.push(note('Zum Vergleich', `Näherung ohne Volumenzunahme V = c(Ziel) · V(Probe) / c(IS) = ${f.vol(approx)}`));
      }
    } else {
      Vis = (ct * V) / cs;
      R.steps.push(step('Zugabe je Probe', 'V(IS) = c(Ziel) · V(End) / c(IS)', `${f.n(ct)} ${cu} · ${f.vol(V)} / ${f.n(cs)} ${cu}`, f.vol(Vis)));
    }
    const Vr = round ? roundToPipette(Vis) : Vis;
    const actual = mode === 'add' ? (cs * Vr) / (V + Vr) : (cs * Vr) / V;
    if (round && Math.abs(Vr - Vis) / Vis > 1e-9) {
      R.steps.push(step('gerundet auf Pipettenauflösung', null, `V(IS) = ${f.vol(Vr)} → c = ${f.n(cs)} ${cu} · ${f.vol(Vr)} / ${mode === 'add' ? `(${f.vol(V)} + ${f.vol(Vr)})` : f.vol(V)}`, `${f.n(actual)} ${cu}`));
    }
    const total = Vr * n * (1 + reserve / 100);
    R.steps.push(step('Gesamtbedarf Charge', 'V(gesamt) = V(IS) · n · (1 + Reserve)', `${f.vol(Vr)} · ${n} · ${f.n(1 + reserve / 100)}`, f.vol(total)));

    R.main.push({ label: 'Zugabe je Probe', text: f.vol(Vr), value: Vr, unit: 'L', primary: true });
    R.main.push({ label: `Bedarf für ${n} Proben (+${f.n(reserve)} %)`, text: f.vol(total), value: total, unit: 'L' });
    R.main.push({ label: 'IS-Konzentration in der Endlösung', text: `${f.n(actual)} ${cu}`, value: actual });
    R.instruction = mode === 'add'
      ? `Je Probe (${f.vol(V)}) ${f.vol(Vr)} IS-Lösung zugeben. Für die Charge mindestens ${f.vol(total)} IS-Lösung bereitstellen.`
      : `Je Probe ${f.vol(Vr)} IS-Lösung vorlegen und auf ${f.vol(V)} auffüllen. Für die Charge mindestens ${f.vol(total)} IS-Lösung bereitstellen.`;
    R.values = { Vis, Vr, actual, total, n, reserve, mode, cUnit: cu };
    R.checks.push({ type: 'pipette', L: Vr, label: 'IS je Probe' });
    R.uncertainty = { kind: 'spike', steps: [{ V1: Vr, V2: V, fill: mode === 'fill' }] };

    if (mode === 'add' && Vr / V > 0.05) {
      warn(R, `Die Zugabe verdünnt die Probe um ${f.n((Vr / (V + Vr)) * 100)} % – bei der Auswertung berücksichtigen oder eine konzentriertere IS-Lösung verwenden.`, 'info');
    }
    // Arbeitslösung vorschlagen, wenn das Zugabevolumen zu klein ist
    const minL = S.minPipetteUL * 1e-6;
    if (Vis < minL) {
      const F = 10 ** Math.ceil(Math.log10(minL / Vis) - 1e-9);
      const cw = cs / F;
      const Vw = mode === 'add' ? (ct * V) / (cw - ct) : (ct * V) / cw;
      const need = Vw * n * (1 + reserve / 100);
      const flask = S.flasksML.map((x) => x / 1000).find((x) => x >= need && x / F >= minL) || null;
      const text = flask
        ? `Arbeitslösung 1:${f.n(F)} herstellen (${f.vol(flask / F)} IS-Lösung auf ${f.vol(flask)} → ${f.n(cw)} ${cu}), dann ${f.vol(Vw)} je Probe zugeben.`
        : `Arbeitslösung 1:${f.n(F)} (${f.n(cw)} ${cu}) herstellen, dann ${f.vol(Vw)} je Probe zugeben (Bedarf ${f.vol(need)}).`;
      warn(R, `Zugabevolumen unter ${f.n(S.minPipetteUL)} µL. Vorschlag: ${text}`);
      R.values.working = { F, c: cw, Vper: Vw, need, flask };
      R.checks.push({ type: 'factor', F });
    }
  });
}

/**
 * Mehrere IS-Lösungen je Probe (＋). Jede Lösung hat eigene Konzentration und
 * Zielkonzentration. Bei "zur Probe geben" erhöht jede Zugabe das Endvolumen –
 * das wird für alle gemeinsam exakt gelöst:
 *   cᵢ(Ziel) = cᵢ(Lösung) · vᵢ / (V + Σv)  →  Σv = V · a / (1 − a),  a = Σ cᵢ(Ziel)/cᵢ(Lösung)
 */
function calcIstdMehrere(input, settings = {}) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const f = formatter(S.sig);
  return runCalc((R) => {
    const mode = input.mode === 'fill' ? 'fill' : 'add';
    const V = readQuantity(input.sample, { kinds: ['volume'], label: mode === 'add' ? 'Probenvolumen' : 'Endvolumen', field: 'sample' }).base;
    const n = readNumber(input.n, { label: 'Anzahl Proben', field: 'n', min: 0 }) ?? 1;
    if (!Number.isInteger(n)) throw new CalcError('Anzahl Proben: bitte eine ganze Zahl eingeben.', 'n');
    const reserve = readNumber(input.reserve, { label: 'Reserve', field: 'reserve', min: 0, minExclusive: false }) ?? 0;
    const round = input.round ?? S.roundPipette;
    const parts = [{ ...input, nr: 1 }, ...activeExtras(input).map((e, i) => ({ ...e, nr: i + 2 }))];

    const items = parts.map((part) => {
      const name = componentName(part, part.nr);
      const lbl = `(${part.nr}) ${name}`;
      const field = part.nr === 1 ? null : 'extra';
      const stock = readQuantity(part.stock, { kinds: CONC_KINDS, label: `${lbl}: Konzentration IS-Lösung`, field: field || 'stock' });
      const target = readQuantity(part.target, { kinds: CONC_KINDS, label: `${lbl}: Zielkonzentration`, field: field || 'target' });
      let ct = target.value;
      if (target.unit.sym !== stock.unit.sym) {
        const M = resolveMolarMass({ substance: part.substance, formula: part.formula, M: part.M }).M ?? undefined;
        const r = convert(target.value, target.unit, stock.unit, { M });
        if (!r.ok) throw new CalcError(`${lbl}: Für die Umrechnung fehlt die Molare Masse – Stoff wählen oder gleiche Einheiten verwenden.`, field || 'target');
        r.hints.forEach((h) => addHint(R, h));
        ct = r.value;
      }
      if (ct >= stock.value) throw new CalcError(`${lbl}: Die Zielkonzentration muss kleiner als die Konzentration der IS-Lösung sein.`, field || 'target');
      return { nr: part.nr, name, lbl, cs: stock.value, ct, cu: stock.unit.sym };
    });

    R.steps.push(note('Gegeben', `${items.length} IS-Lösungen; ${mode === 'add' ? 'Probenvolumen' : 'Endvolumen'} ${f.vol(V)}; ${n} Proben; Reserve ${f.n(reserve)} %`));
    let Vend = V;
    if (mode === 'add') {
      const a = items.reduce((sum, it) => sum + it.ct / it.cs, 0);
      if (a >= 1) throw new CalcError('Die Zielkonzentrationen sind zu hoch für diese IS-Lösungen (Summe der Anteile ≥ 100 %).', 'target');
      const Ssum = (V * a) / (1 - a);
      Vend = V + Ssum;
      R.steps.push(note('Ansatz', 'cᵢ(Ziel) = cᵢ(IS) · vᵢ / (V + Σv); Σv = V · a / (1 − a) mit a = Σ cᵢ(Ziel)/cᵢ(IS)'));
      R.steps.push(step('Summe der Zugaben', 'Σv = V · a / (1 − a)', `${f.vol(V)} · ${f.n(a)} / (1 − ${f.n(a)})`, f.vol(Ssum)));
    }
    for (const it of items) {
      it.v = (it.ct * Vend) / it.cs;
      R.steps.push(step(it.lbl, mode === 'add' ? 'v = c(Ziel) · (V + Σv) / c(IS)' : 'v = c(Ziel) · V(End) / c(IS)',
        `${f.n(it.ct)} ${it.cu} · ${f.vol(Vend)} / ${f.n(it.cs)} ${it.cu}`, f.vol(it.v)));
      it.vr = round ? roundToPipette(it.v) : it.v;
    }
    const sumR = items.reduce((sum, it) => sum + it.vr, 0);
    if (mode === 'fill' && sumR >= V) throw new CalcError('Die Zugaben sind größer als das Endvolumen.', 'sample');
    const denom = mode === 'add' ? V + sumR : V;
    const rows = items.map((it) => {
      it.actual = (it.cs * it.vr) / denom;
      const total = it.vr * n * (1 + reserve / 100);
      R.checks.push({ type: 'pipette', L: it.vr, label: it.lbl });
      return [it.name, `${f.n(it.cs)} ${it.cu}`, `${f.n(it.ct)} ${it.cu}`, f.vol(it.vr), f.vol(total), `${f.n(it.actual)} ${it.cu}`];
    });
    R.extraTable = { title: 'Zugabe je IS-Lösung', headers: ['IS', 'c(Lösung)', 'Ziel', 'je Probe', `Charge (${n} Proben + ${f.n(reserve)} %)`, 'tatsächlich'], rows };
    R.main.push({ label: 'Zugabe je Probe (alle IS)', text: f.vol(sumR), value: sumR, unit: 'L', primary: true });
    R.main.push({ label: 'IS-Lösungen', text: String(items.length) });
    R.instruction = `Je Probe (${f.vol(V)}) ${items.map((it) => `${f.vol(it.vr)} ${it.name}`).join(', ')} zugeben${mode === 'fill' ? ' und auf das Endvolumen auffüllen' : ''}.`;
    const minL = S.minPipetteUL * 1e-6;
    const small = items.filter((it) => it.vr < minL * (1 - 1e-9));
    if (small.length) warn(R, `Zugabe unter ${f.n(S.minPipetteUL)} µL bei: ${small.map((it) => it.name).join(', ')} – Arbeitslösung (Verdünnung) dieser IS-Lösung herstellen.`);
    if (mode === 'add' && sumR / V > 0.05) warn(R, `Die Zugaben verdünnen die Probe um ${f.n((sumR / (V + sumR)) * 100)} %.`, 'info');
    R.values = { n, reserve, mode, sum: sumR, items: items.map((it) => ({ name: it.name, v: it.vr, actual: it.actual })) };
  });
}

  VR.provide('core/modes/istd.js', { calcIstd, calcIstdMehrere });
}());
