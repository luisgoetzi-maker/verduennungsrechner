// Modus C: Konzentrierte Lösung
//  - Gehalt % (m/m) + Dichte -> mol/L (und g/L, eq/L, mol/kg)
//  - umgekehrt: Wie viel mL der konzentrierten Lösung für V einer Zielkonzentration?

import { CONC_KINDS, convert } from '../units.js';
import {
  runCalc, readQuantity, readNumber, formatter, step, note, warn,
  resolveMolarMass, resolveReference, requireParam, CalcError,
} from './common.js';
import { pureMassNeeded } from './einwaage.js';

function isAcid(sub, name) {
  return (sub && sub.cat === 'Säure') || /säure/i.test(name || '');
}

/**
 * @param {object} input
 *   substance, formula, M   Stoff bzw. Molare Masse
 *   purity                  Gehalt der konzentrierten Lösung in % (m/m)
 *   density                 Dichte der konzentrierten Lösung in g/mL
 *   z                       Wertigkeit (optional, für eq/L)
 *   conc, amount            optional: Zielkonzentration und Zielvolumen (Modus "herstellen")
 *   rhoSol                  Dichte der verdünnten Ziellösung (nur für % (m/m)-Ziele)
 */
export function calcKonzentriert(input, settings = {}) {
  const f = formatter(settings.sig || 4);
  return runCalc((R) => {
    const sub = input.substance || null;
    const mm = resolveMolarMass({ substance: sub, formula: input.formula, M: input.M });
    const purity = readNumber(input.purity, { label: 'Gehalt', field: 'purity', min: 0, max: 100 }) ?? sub?.purity ?? null;
    const rho = readNumber(input.density, { label: 'Dichte', field: 'density', min: 0 }) ?? sub?.density ?? null;
    const z = readNumber(input.z, { label: 'Wertigkeit z', field: 'z', min: 0 }) ?? sub?.z ?? null;
    if (purity === null) throw new CalcError('Bitte den Gehalt in % (m/m) angeben.', 'purity');
    requireParam(rho, 'density');
    requireParam(mm.M, 'M');
    const name = sub ? sub.name : mm.label;
    const w = purity / 100;

    R.steps.push(note(`Gegeben (${name})`, `Gehalt w = ${f.pct(purity)} (m/m); Dichte ρ = ${f.n(rho)} g/mL; M = ${f.M(mm.M)} (${mm.source})`));
    const beta = w * rho * 1000;
    R.steps.push(step('Massenkonzentration', 'β = w · ρ', `${f.n(w)} · ${f.n(rho * 1000)} g/L`, `${f.n(beta)} g/L`));
    const c = beta / mm.M;
    R.steps.push(step('Stoffmengenkonzentration', 'c = β / M', `${f.n(beta)} g/L / ${f.M(mm.M)}`, `${f.n(c)} mol/L`));
    R.values = { beta, c, w, rho, M: mm.M };

    const wantPrepare = input.conc && String(typeof input.conc === 'object' ? input.conc.value ?? '' : input.conc).trim() !== '';
    if (!wantPrepare) {
      R.main.push({ label: 'Konzentration', text: `${f.n(c)} mol/L`, value: c, unit: 'mol/L', primary: true });
      R.main.push({ label: 'Massenkonzentration', text: `${f.n(beta)} g/L`, value: beta, unit: 'g/L' });
      if (z) {
        const ceq = c * z;
        R.steps.push(step('Äquivalentkonzentration', 'c(eq) = z · c', `${f.n(z)} · ${f.n(c)} mol/L`, `${f.n(ceq)} eq/L`));
        R.main.push({ label: 'Normalität', text: `${f.n(ceq)} N`, value: ceq, unit: 'eq/L' });
        R.values.ceq = ceq;
      }
      if (w < 1) {
        const b = (w / ((1 - w) * mm.M)) * 1000;
        R.steps.push(step('Molalität', 'b = w / ((1 − w) · M)', `${f.n(w)} / (${f.n(1 - w)} · ${f.M(mm.M)}) · 1000 g/kg`, `${f.n(b)} mol/kg`));
        R.main.push({ label: 'Molalität', text: `${f.n(b)} mol/kg`, value: b, unit: 'mol/kg' });
        R.values.b = b;
      }
      const perML = c; // mmol/mL = mol/L
      R.main.push({ label: '1 mL enthält', text: `${f.n(perML)} mmol = ${f.mass(beta / 1000)}`, value: perML, unit: 'mmol/mL' });
      return;
    }

    // Herstellen einer verdünnten Lösung aus der konzentrierten
    const conc = readQuantity(input.conc, { kinds: CONC_KINDS, label: 'Zielkonzentration', field: 'conc' });
    const amount = readQuantity(input.amount, { kinds: ['volume', 'massq'], label: 'Zielvolumen', field: 'amount' });
    const rhoSol = readNumber(input.rhoSol, { label: 'Dichte der Ziellösung', field: 'rhoSol', min: 0 });
    if (conc.unit.kind === 'volfrac') throw new CalcError('% (V/V) ist hier nicht sinnvoll – bitte Modus „Verdünnung“ verwenden.', 'conc');
    const ref = resolveReference({ type: 'compound' }, mm, f);
    const V = amount.unit.kind === 'volume' ? amount.base : null;
    const mSol = amount.unit.kind === 'massq' ? amount.base : null;
    const r = pureMassNeeded(R, f, { conc, V, mSol, mm, ref, z, rhoSol });
    const mConc = r.mComp / w;
    R.steps.push(step('Masse konzentrierte Lösung', 'm(konz) = m / w', `${f.g(r.mComp)} / ${f.n(w)}`, f.g(mConc)));
    const Vc = mConc / (rho * 1000);
    R.steps.push(step('Volumen konzentrierte Lösung', 'V(konz) = m(konz) / ρ', `${f.g(mConc)} / ${f.n(rho * 1000)} g/L`, f.vol(Vc)));

    // Gegenprobe über c1·V1 = c2·V2 (bei volumenbezogenen Zielen)
    if (r.V && (conc.unit.kind === 'amount' || conc.unit.kind === 'mass' || conc.unit.kind === 'normality')) {
      const cv = convert(conc.value, conc.unit, 'mol/L', { M: mm.M, z });
      if (cv.ok) {
        const Vcheck = (cv.value * r.V) / c;
        R.steps.push(step('Gegenprobe (c₁·V₁ = c₂·V₂)', 'V(konz) = c₂ · V₂ / c(konz)', `${f.n(cv.value)} mol/L · ${f.L(r.V)} / ${f.n(c)} mol/L`, f.vol(Vcheck)));
        const F = c / cv.value;
        R.values.F = F;
        R.checks.push({ type: 'factor', F });
      }
    }
    R.values = { ...R.values, mPure: r.mComp, mConc, Vconc: Vc, V: r.V };
    R.main.push({ label: 'Konzentrierte Lösung abmessen', text: f.vol(Vc), value: Vc, unit: 'L', primary: true });
    R.main.push({ label: 'oder einwiegen', text: f.mass(mConc), value: mConc, unit: 'g' });
    R.main.push({ label: 'Konzentration der Ausgangslösung', text: `${f.n(c)} mol/L`, value: c, unit: 'mol/L' });
    if (r.V) {
      R.instruction = `Messkolben (${f.vol(r.V)}) etwa zur Hälfte mit Wasser füllen, ${f.vol(Vc)} ${name} zugeben, mischen, auf Raumtemperatur abkühlen lassen und bis zur Marke auffüllen.`;
      R.checks.push({ type: 'flask', L: r.V });
    } else {
      R.instruction = `${f.mass(mConc)} ${name} einwiegen und ${f.mass(r.mSol - mConc)} Wasser zugeben.`;
    }
    R.checks.push({ type: 'pipette', L: Vc, label: 'Volumen konz. Lösung' });
    if (r.V) R.uncertainty = { kind: 'dilution', steps: [{ V1: Vc, V2: r.V }] };
    if (isAcid(sub, name) && w >= 0.1) {
      warn(R, 'Erst das Wasser, dann die Säure! Konzentrierte Säure langsam in vorgelegtes Wasser geben (Wärmeentwicklung).', 'info');
    } else if (sub && sub.cat === 'Base' && w >= 0.2) {
      warn(R, 'Konzentrierte Lauge langsam in vorgelegtes Wasser geben (Wärmeentwicklung).', 'info');
    }
  });
}
