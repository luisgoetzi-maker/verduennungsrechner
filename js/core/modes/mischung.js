// Modus G: Mischstandard – mehrere Stoffe in einer Lösung.
// Je Komponente: Einwaage (Feststoff/Reinstoff) oder Pipettiervolumen aus
// einer Stammlösung; alles zusammen auf ein Endvolumen auffüllen.

import { CONC_KINDS, convert, PARAMS } from '../units.js';
import {
  runCalc, readQuantity, readNumber, formatter, step, note, warn, addHint,
  resolveMolarMass, resolveReference, CalcError, MissingParam,
} from './common.js';
import { pureMassNeeded } from './einwaage.js';
import { DEFAULT_SETTINGS } from '../settings.js';

function isBlankValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'object') return v.value === null || v.value === undefined || String(v.value).trim() === '';
  return String(v).trim() === '';
}

/** Komponente ohne Stoff, Formel und Werte wird ignoriert. */
export function isBlankComponent(c) {
  return !c || (!c.substance && !String(c.formula || '').trim() && isBlankValue(c.conc) && isBlankValue(c.stock) && isBlankValue(c.M));
}

/**
 * @param {object} input
 *   amount      Endvolumen der Mischung
 *   useCommon   true: gleiche Zielkonzentration (commonConc) für alle Komponenten
 *   commonConc  gemeinsame Zielkonzentration
 *   components  [{substance, formula, M, conc, source:'stock'|'solid', stock, purity, reference}]
 */
export function calcMischung(input, settings = {}) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const f = formatter(S.sig);
  return runCalc((R) => {
    const amount = readQuantity(input.amount, { kinds: ['volume'], label: 'Endvolumen', field: 'amount' });
    const V = amount.base;
    const comps = (input.components || []).filter((c) => !isBlankComponent(c));
    if (!comps.length) throw new CalcError('Bitte mindestens eine Komponente eingeben.', 'components');
    const common = input.useCommon
      ? readQuantity(input.commonConc, { kinds: CONC_KINDS, label: 'Zielkonzentration (für alle)', field: 'commonConc' })
      : null;
    const minL = S.minPipetteUL * 1e-6;
    const rhoSol = readNumber(input.rhoSol, { label: 'Dichte der Lösung', field: 'rhoSol', min: 0 });

    R.steps.push(note('Gegeben', `Endvolumen ${f.q(amount)}; ${comps.length} ${comps.length === 1 ? 'Komponente' : 'Komponenten'}${common ? `; je ${f.q(common)}` : ''}`));
    R.steps.push(note('Formeln', 'Stammlösung: V = c(Ziel) · V(End) / c(Stamm); Feststoff: m = c · V(End) · M / Reinheit'));

    const rows = [];
    const seen = new Map();
    let sumV = 0;
    let sumM = 0;

    comps.forEach((c, i) => {
      const nr = i + 1;
      let lbl = `(${nr}) Komponente`;
      try {
        if (!c.substance && !String(c.formula || '').trim()) throw new CalcError(`${lbl}: Bitte einen Stoff wählen oder eine Formel eingeben.`, 'components');
        const mm = resolveMolarMass({ substance: c.substance, formula: c.formula, M: c.M });
        const name = c.substance ? c.substance.name : (mm.parsed ? mm.parsed.pretty : 'Komponente');
        lbl = `(${nr}) ${name}`;
        const key = c.substance ? c.substance.id : (mm.parsed ? mm.parsed.hill : null);
        if (key && seen.has(key)) warn(R, `${name} ist mehrfach enthalten (Komponente ${seen.get(key)} und ${nr}).`, 'info');
        if (key) seen.set(key, nr);
        const conc = common || readQuantity(c.conc, { kinds: CONC_KINDS, label: `${lbl}: Zielkonzentration`, field: 'components' });
        const firstStep = R.steps.length;

        if (c.source === 'solid') {
          const purity = readNumber(c.purity, { label: `${lbl}: Reinheit`, field: 'components', min: 0, max: 100 }) ?? c.substance?.purity ?? 100;
          const ref = resolveReference(c.reference, mm, f);
          const z = readNumber(c.z, { label: `${lbl}: Wertigkeit`, field: 'components', min: 0 }) ?? c.substance?.z ?? null;
          const r = pureMassNeeded(R, f, { conc, V, mSol: null, mm, ref, z, rhoSol });
          let m = r.mComp;
          if (purity < 100) {
            m = r.mComp / (purity / 100);
            R.steps.push(step('Reinheit', 'm(Einwaage) = m / w', `${f.g(r.mComp)} / ${f.n(purity / 100)}`, f.g(m)));
          }
          for (let k = firstStep; k < R.steps.length; k++) R.steps[k].label = `${lbl} – ${R.steps[k].label}`;
          const rhoP = readNumber(c.density, { label: `${lbl}: Dichte`, field: 'components', min: 0 })
            ?? (c.substance && c.substance.state === 'l' ? c.substance.density : null) ?? null;
          const liquid = !!rhoP;
          const Vp = liquid ? m / (rhoP * 1000) : null;
          const notes = [];
          if (m * 1000 < S.minMassMg * (1 - 1e-9)) notes.push(`unter ${f.n(S.minMassMg)} mg`);
          if (Vp !== null && Vp < minL * (1 - 1e-9)) notes.push(`unter ${f.n(S.minPipetteUL)} µL`);
          rows.push({
            nr, name, target: f.q(conc), kind: 'solid', m, Vp,
            source: `${liquid ? 'Reinstoff' : 'Feststoff'}${purity < 100 ? ` ${f.n(purity)} %` : ''}${ref.isCompound ? '' : `, als ${ref.label}`}`,
            amount: Vp !== null ? `${f.vol(Vp)} (${f.mass(m)})` : f.mass(m),
            notes,
          });
          sumM += m;
          if (Vp !== null) sumV += Vp;
          R.checks.push({ type: 'mass', g: m, label: lbl });
          if (Vp !== null) R.checks.push({ type: 'pipette', L: Vp, label: lbl });
        } else {
          const stock = readQuantity(c.stock, { kinds: CONC_KINDS, label: `${lbl}: Konzentration der Stammlösung`, field: 'components' });
          let ct;
          if (conc.unit.kind === stock.unit.kind) {
            ct = conc.base / stock.unit.f;
          } else {
            const r = convert(conc.value, conc.unit, stock.unit, { M: mm.M ?? undefined, z: c.substance?.z ?? undefined });
            if (!r.ok) throw new MissingParam(r.missing);
            r.hints.forEach((h) => addHint(R, h));
            r.assumptions.forEach((a) => addHint(R, a));
            ct = r.value;
          }
          if (ct > stock.value * (1 + 1e-12)) throw new CalcError(`${lbl}: Die Zielkonzentration ist größer als die Stammlösung.`, 'components');
          const Vi = (ct * V) / stock.value;
          const F = stock.value / ct;
          R.steps.push(step(lbl, 'V = c(Ziel) · V(End) / c(Stamm)', `${f.n(ct)} ${stock.unit.sym} · ${f.vol(V)} / ${f.q(stock)}`, f.vol(Vi)));
          const notes = [];
          if (Vi < minL * (1 - 1e-9)) notes.push(`unter ${f.n(S.minPipetteUL)} µL`);
          if (F > S.maxStepFactor * (1 + 1e-9)) notes.push(`Faktor ${f.n(F)} > ${f.n(S.maxStepFactor)}`);
          rows.push({ nr, name, target: f.q(conc), kind: 'stock', V: Vi, F, source: `Stamm ${f.q(stock)}`, amount: f.vol(Vi), notes });
          sumV += Vi;
          R.checks.push({ type: 'pipette', L: Vi, label: lbl }, { type: 'factor', F });
        }
      } catch (e) {
        if (e instanceof MissingParam) {
          throw new CalcError(`${lbl}: Es fehlt ${e.params.map((p) => PARAMS[p]?.label || p).join(', ')} – Stoff aus der Datenbank wählen, Formel eingeben oder Einheiten angleichen.`, 'components');
        }
        if (e instanceof CalcError && !e.message.startsWith(`(${nr})`)) throw new CalcError(`${lbl}: ${e.message}`, 'components');
        throw e;
      }
    });

    if (sumV > V * (1 + 1e-12)) {
      throw new CalcError(`Die Zugaben (${f.vol(sumV)}) sind größer als das Endvolumen (${f.vol(V)}). Größeres Endvolumen oder konzentriertere Stammlösungen wählen.`, 'amount');
    }
    const share = sumV / V;
    if (share > 0.1) {
      warn(R, `Die Zugaben machen ${f.n(share * 100)} % des Endvolumens aus – Lösungsmittel der Stammlösungen beachten (Matrix der Mischung).`, 'info');
    }
    const flagged = rows.filter((r) => r.notes.length);
    if (flagged.length) {
      warn(R, `${flagged.length === 1 ? 'Eine Komponente liegt' : `${flagged.length} Komponenten liegen`} außerhalb der Plausibilitätsgrenzen (siehe Tabelle). Abhilfe: größeres Endvolumen, Zwischenverdünnung der Stammlösung oder größere Einwaage als Stammlösung ansetzen.`);
    }

    const hasSolid = rows.some((r) => r.kind === 'solid');
    R.main.push({ label: 'Mischung', text: `${rows.length} ${rows.length === 1 ? 'Komponente' : 'Komponenten'} in ${f.vol(V)}`, primary: true });
    if (sumV > 0) R.main.push({ label: 'Zugaben (Volumen) gesamt', text: f.vol(sumV), value: sumV, unit: 'L' });
    if (sumM > 0) R.main.push({ label: 'Einwaagen gesamt', text: f.mass(sumM), value: sumM, unit: 'g' });
    R.main.push({ label: 'Lösungsmittel (ca.)', text: f.vol(V - sumV), value: V - sumV, unit: 'L' });
    R.instruction = `Alle ${hasSolid ? 'Einwaagen und ' : ''}Zugaben in einen ${f.vol(V)}-Messkolben geben${hasSolid ? ', lösen' : ''}, bis zur Marke auffüllen und mischen.`;
    R.table = { type: 'mix', rows };
    R.values = { V, sumV, sumM, n: rows.length, components: rows.map((r) => ({ name: r.name, target: r.target })) };
    R.checks.push({ type: 'flask', L: V });
    R.uncertainty = {
      kind: 'mix', V,
      items: rows.map((r) => (r.kind === 'stock' ? { label: `(${r.nr}) ${r.name}`, V1: r.V } : { label: `(${r.nr}) ${r.name}`, m: r.m })),
    };
  });
}

/** Hat die Einwaage weitere Stoffe (über das ＋ im Formular)? */
export function hasExtraSubstances(input) {
  return Array.isArray(input && input.extra) && input.extra.some((e) => e && (e.substance || String(e.formula || '').trim()));
}

/**
 * Modus A mit mehreren Stoffen: Einwaage jedes Stoffes für eine gemeinsame Lösung.
 * Der erste Stoff kommt aus den normalen Feldern, weitere aus input.extra.
 */
export function calcEinwaageMehrere(input, settings = {}) {
  let kind = null;
  try {
    kind = readQuantity(input.amount, { label: 'Volumen', field: 'amount' }).unit.kind;
  } catch {
    // ungültige oder fehlende Eingabe: die Meldung kommt aus calcMischung
  }
  if (kind === 'massq') {
    return runCalc(() => { throw new CalcError('Bei mehreren Stoffen bitte das Volumen der Lösung angeben (z. B. in mL).', 'amount'); });
  }
  const main = {
    substance: input.substance, formula: input.formula, M: input.M, conc: input.conc, purity: input.purity,
    reference: input.reference, density: input.density, z: input.z, source: 'solid',
  };
  const extra = input.extra.filter((e) => e && (e.substance || String(e.formula || '').trim())).map((e) => ({ ...e, source: 'solid' }));
  return calcMischung({ amount: input.amount, rhoSol: input.rhoSol, components: [main, ...extra] }, settings);
}
