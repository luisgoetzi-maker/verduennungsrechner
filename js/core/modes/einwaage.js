// Modus A: Einwaage – Zielkonzentration + Volumen -> abzuwiegende Masse
// (bzw. abzumessendes Volumen bei Flüssigkeiten über die Dichte).

import { CONC_KINDS } from '../units.js';
import {
  runCalc, readQuantity, readNumber, formatter, step, note, addHint, warn,
  resolveMolarMass, resolveReference, requireParam, MissingParam, CalcError,
} from './common.js';

/** Zeigt eine Umrechnung in kohärente Einheiten an, wenn nötig. */
function coherent(R, f, qty, baseSym, symbol) {
  if (qty.unit.sym !== baseSym && Math.abs(qty.unit.f - 1) > 1e-12) {
    R.steps.push(step('Einheit umrechnen', `${symbol} = ${f.q(qty)}`, null, `${f.n(qty.base)} ${baseSym}`));
  }
}

/**
 * Masse des reinen Stoffes (Einwaageform, 100 %) für eine Zielkonzentration.
 * Wird auch von Modus C (konzentrierte Lösung) verwendet.
 * @param {object} p {conc, V (L|null), mSol (g|null), mm, ref, z, rhoSol}
 * @returns {{mComp:number, V:number|null, mSol:number|null, n?:number}}
 */
export function pureMassNeeded(R, f, { conc, V, mSol, mm, ref, z, rhoSol }) {
  const kind = conc.unit.kind;
  const Mc = mm.M;
  const name = mm.label || 'Stoff';
  if (kind === 'amount' || kind === 'normality' || kind === 'molality' || !ref.isCompound) requireParam(Mc, 'M');

  const refToComp = (mRef) => {
    if (ref.isCompound) return mRef;
    const mComp = (mRef * Mc) / (ref.k * ref.Mref);
    R.steps.push(step(`Umrechnung Bezug ${ref.label} → ${name}`, 'm(Einwaage) = m(Bezug) · M(Einwaage) / (k · M(Bezug))',
      `${f.g(mRef)} · ${f.M(Mc)} / (${f.n(ref.k)} · ${f.M(ref.Mref)})`, f.g(mComp)));
    return mComp;
  };
  const volumeFromMass = () => {
    requireParam(rhoSol, 'rhoSol');
    const v = mSol / (rhoSol * 1000);
    R.steps.push(step('Volumen der Lösung', 'V = m(Lsg) / ρ(Lsg)', `${f.g(mSol)} / ${f.n(rhoSol * 1000)} g/L`, f.L(v)));
    return v;
  };

  switch (kind) {
    case 'amount':
    case 'normality': {
      let c = conc.base;
      if (kind === 'normality') {
        requireParam(z, 'z');
        coherent(R, f, conc, 'eq/L', 'c(eq)');
        c = conc.base / z;
        R.steps.push(step('Äquivalent- in Stoffmengenkonzentration', 'c = c(eq) / z', `${f.n(conc.base)} eq/L / ${f.n(z)}`, `${f.n(c)} mol/L`));
        addHint(R, 'normality');
      } else {
        coherent(R, f, conc, 'mol/L', 'c');
      }
      let vol = V;
      if (vol === null) vol = volumeFromMass();
      const nRef = c * vol;
      R.steps.push(step(ref.isCompound ? 'Stoffmenge' : `Stoffmenge ${ref.label}`, 'n = c · V', `${f.n(c)} mol/L · ${f.L(vol)}`, f.mol(nRef)));
      let n = nRef;
      if (!ref.isCompound && ref.k !== 1) {
        n = nRef / ref.k;
        R.steps.push(step('Stoffmenge Einwaageform', 'n(Einwaage) = n(Bezug) / k', `${f.mol(nRef)} / ${f.n(ref.k)}`, f.mol(n)));
      }
      const mComp = n * Mc;
      R.steps.push(step('Masse (100 %)', 'm = n · M', `${f.mol(n)} · ${f.M(Mc)}`, f.g(mComp)));
      return { mComp, V: vol, mSol, n };
    }
    case 'mass': {
      coherent(R, f, conc, 'g/L', 'β');
      let vol = V;
      if (vol === null) vol = volumeFromMass();
      const mRef = conc.base * vol;
      R.steps.push(step(ref.isCompound ? 'Masse (100 %)' : `Masse ${ref.label}`, 'm = β · V', `${f.n(conc.base)} g/L · ${f.L(vol)}`, f.g(mRef)));
      return { mComp: refToComp(mRef), V: vol, mSol };
    }
    case 'massfrac': {
      if (conc.unit.ppm) addHint(R, 'ppm');
      coherent(R, f, conc, 'g/g', 'w');
      let m = mSol;
      if (m === null) {
        let rho = rhoSol;
        if (!rho) {
          if (!conc.unit.ppm) throw new MissingParam('rhoSol');
          rho = 1;
          addHint(R, 'ppmAssumed');
        }
        m = V * rho * 1000;
        R.steps.push(step('Masse der Lösung', 'm(Lsg) = V · ρ(Lsg)', `${f.L(V)} · ${f.n(rho * 1000)} g/L`, f.g(m)));
      }
      const mRef = conc.base * m;
      R.steps.push(step(ref.isCompound ? 'Masse (100 %)' : `Masse ${ref.label}`, 'm = w · m(Lsg)', `${f.n(conc.base)} · ${f.g(m)}`, f.g(mRef)));
      return { mComp: refToComp(mRef), V, mSol: m };
    }
    case 'molality': {
      addHint(R, 'molality');
      const Meff = Mc / ref.k; // Masse Einwaageform je mol Bezug
      let nRef;
      if (mSol !== null) {
        R.steps.push(note('Hinweis', 'Bei Molalität wird die eingegebene Masse als Masse des Lösungsmittels verwendet.'));
        nRef = conc.base * (mSol / 1000);
        R.steps.push(step('Stoffmenge', 'n = b · m(LM)', `${f.n(conc.base)} mol/kg · ${f.n(mSol / 1000)} kg`, f.mol(nRef)));
      } else {
        requireParam(rhoSol, 'rhoSol');
        const c = (conc.base * rhoSol * 1000) / (1000 + conc.base * Meff);
        R.steps.push(step('Molalität → Stoffmengenkonzentration', 'c = b · ρ / (1000 g/kg + b · M)',
          `${f.n(conc.base)} mol/kg · ${f.n(rhoSol * 1000)} g/L / (1000 g/kg + ${f.n(conc.base)} mol/kg · ${f.M(Meff)})`, `${f.n(c)} mol/L`));
        nRef = c * V;
        R.steps.push(step('Stoffmenge', 'n = c · V', `${f.n(c)} mol/L · ${f.L(V)}`, f.mol(nRef)));
      }
      const n = nRef / ref.k;
      if (ref.k !== 1) R.steps.push(step('Stoffmenge Einwaageform', 'n(Einwaage) = n(Bezug) / k', `${f.mol(nRef)} / ${f.n(ref.k)}`, f.mol(n)));
      const mComp = n * Mc;
      R.steps.push(step('Masse (100 %)', 'm = n · M', `${f.mol(n)} · ${f.M(Mc)}`, f.g(mComp)));
      return { mComp, V, mSol, n };
    }
    default:
      throw new CalcError('Für diese Konzentrationsart ist keine Einwaage berechenbar.', 'conc');
  }
}

/**
 * @param {object} input
 *   substance   Stoffeintrag (angereichert) oder null
 *   formula, M  alternativ Formel bzw. Molare Masse (Vorrang vor dem Stoffeintrag)
 *   conc        Zielkonzentration {value, unit} oder "0,1 M"
 *   amount      Volumen (oder Masse) der herzustellenden Lösung
 *   purity      Reinheit/Gehalt in % (Standard: Stoffeintrag bzw. 100)
 *   density     Dichte des Stoffes/Produkts in g/mL (für Volumen statt Masse)
 *   rhoSol      Dichte der fertigen Lösung (nur für % (m/m) usw.)
 *   z           Wertigkeit (für eq/L)
 *   reference   Bezugsform {type:'compound'|'anhydrous'|'element'|'formula', element, formula, count}
 */
export function calcEinwaage(input, settings = {}) {
  const f = formatter(settings.sig || 4);
  return runCalc((R) => {
    const conc = readQuantity(input.conc, { kinds: CONC_KINDS, label: 'Zielkonzentration', field: 'conc' });
    const amount = readQuantity(input.amount, { kinds: ['volume', 'massq'], label: 'Menge der Lösung', field: 'amount' });
    const sub = input.substance || null;
    const mm = resolveMolarMass({ substance: sub, formula: input.formula, M: input.M });
    const purityIn = readNumber(input.purity, { label: 'Reinheit', field: 'purity', min: 0, max: 100 });
    const purity = purityIn ?? sub?.purity ?? 100;
    const rhoProduct = readNumber(input.density, { label: 'Dichte des Stoffes', field: 'density', min: 0 }) ?? sub?.density ?? null;
    const rhoSol = readNumber(input.rhoSol, { label: 'Dichte der Lösung', field: 'rhoSol', min: 0 });
    const z = readNumber(input.z, { label: 'Wertigkeit z', field: 'z', min: 0 }) ?? sub?.z ?? null;
    const ref = resolveReference(input.reference, mm, f);
    const name = sub ? sub.name : mm.label || 'Stoff';

    const given = [`Zielkonzentration ${f.q(conc)}`, `${amount.unit.kind === 'volume' ? 'Volumen' : 'Masse'} ${f.q(amount)}`];
    if (mm.M) given.push(`M = ${f.M(mm.M)} (${mm.source})`);
    if (purity < 100) given.push(`Reinheit/Gehalt ${f.pct(purity)}`);
    if (rhoProduct) given.push(`Dichte ${f.n(rhoProduct)} g/mL`);
    if (!ref.isCompound) given.push(`Bezug: ${ref.label}`);
    R.steps.push(note(`Gegeben (${name})`, given.join('; ')));
    if (mm.parsed && mm.parsed.waterCount > 0 && mm.M) {
      R.steps.push(note('Kristallwasser', `${mm.parsed.pretty} enthält ${f.n(mm.parsed.waterCount)} H₂O je Formeleinheit; M = ${f.M(mm.M)} (wasserfrei ${f.M(mm.parsed.anhydrousMass)}). Die Einwaage bezieht sich auf das Hydrat.`));
    }

    const V = amount.unit.kind === 'volume' ? amount.base : null;
    const mSol = amount.unit.kind === 'massq' ? amount.base : null;

    // Volumenanteil: Reinstoff abmessen
    if (conc.unit.kind === 'volfrac') {
      if (!ref.isCompound) throw new CalcError('Bei % (V/V) ist nur der Bezug auf den Stoff selbst möglich.', 'reference');
      addHint(R, 'volfrac');
      let vol = V;
      if (vol === null) {
        requireParam(rhoSol, 'rhoSol');
        vol = mSol / (rhoSol * 1000);
        R.steps.push(step('Volumen der Lösung', 'V = m(Lsg) / ρ(Lsg)', `${f.g(mSol)} / ${f.n(rhoSol * 1000)} g/L`, f.L(vol)));
      }
      coherent(R, f, conc, 'L/L', 'φ');
      const Vs = conc.base * vol;
      R.steps.push(step('Volumen Reinstoff', 'V(Stoff) = φ · V(Lsg)', `${f.n(conc.base)} · ${f.L(vol)}`, f.vol(Vs)));
      R.main.push({ label: 'Abmessen', text: f.vol(Vs), value: Vs, unit: 'L', primary: true });
      if (rhoProduct) {
        const m = Vs * rhoProduct * 1000;
        R.steps.push(step('entspricht Masse', 'm = V · ρ', `${f.L(Vs)} · ${f.n(rhoProduct * 1000)} g/L`, f.g(m)));
        R.main.push({ label: 'oder einwiegen', text: f.mass(m), value: m, unit: 'g' });
        R.checks.push({ type: 'mass', g: m, label: 'Einwaage' });
      }
      if (purity < 100) warn(R, `Die Reinheit (${f.pct(purity)}) wird bei % (V/V) nicht berücksichtigt.`, 'info');
      R.instruction = `${f.vol(Vs)} ${name} abmessen und mit Lösungsmittel auf ${f.vol(vol)} auffüllen.`;
      R.values = { Vsubstance: Vs, V: vol };
      R.checks.push({ type: 'pipette', L: Vs, label: 'Volumen Stoff' }, { type: 'flask', L: vol });
      return;
    }

    const r = pureMassNeeded(R, f, { conc, V, mSol, mm, ref, z, rhoSol });
    let mWeigh = r.mComp;
    if (purity < 100) {
      mWeigh = r.mComp / (purity / 100);
      R.steps.push(step('Reinheit/Gehalt berücksichtigen', 'm(Einwaage) = m(100 %) / w', `${f.g(r.mComp)} / ${f.n(purity / 100)}`, f.g(mWeigh)));
    }
    R.values = { mPure: r.mComp, mWeigh, V: r.V, mSol: r.mSol, purity, M: mm.M };

    let Vp = null;
    if (rhoProduct) {
      Vp = mWeigh / (rhoProduct * 1000);
      R.steps.push(step('Volumen über die Dichte', 'V = m / ρ', `${f.g(mWeigh)} / ${f.n(rhoProduct * 1000)} g/L`, f.vol(Vp)));
      R.values.Vproduct = Vp;
    }
    const liquid = Vp !== null && (sub ? sub.state === 'l' : true);
    if (liquid) {
      R.main.push({ label: 'Abmessen', text: f.vol(Vp), value: Vp, unit: 'L', primary: true });
      R.main.push({ label: 'oder einwiegen', text: f.mass(mWeigh), value: mWeigh, unit: 'g' });
    } else {
      R.main.push({ label: 'Einwaage', text: f.mass(mWeigh), value: mWeigh, unit: 'g', primary: true });
      if (Vp !== null) R.main.push({ label: 'entspricht', text: f.vol(Vp), value: Vp, unit: 'L' });
    }
    if (purity < 100) R.main.push({ label: 'davon reiner Stoff', text: f.mass(r.mComp), value: r.mComp, unit: 'g' });

    const what = liquid ? `${f.vol(Vp)} (${f.mass(mWeigh)}) ${name}` : `${f.mass(mWeigh)} ${name}`;
    if (amount.unit.kind === 'volume') {
      R.instruction = `${what} in einen ${f.vol(r.V)}-Messkolben geben, lösen und bis zur Marke auffüllen.`;
      R.checks.push({ type: 'flask', L: r.V });
    } else if (conc.unit.kind === 'molality') {
      R.instruction = `${what} in ${f.mass(mSol)} Lösungsmittel lösen.`;
    } else {
      const solvent = r.mSol - mWeigh;
      R.instruction = `${what} einwiegen und ${f.mass(solvent)} Lösungsmittel zugeben (Gesamtmasse ${f.mass(r.mSol)}).`;
      R.main.push({ label: 'Lösungsmittel', text: f.mass(solvent), value: solvent, unit: 'g' });
      if (solvent <= 0) throw new CalcError('Die Einwaage ist größer als die Gesamtmasse – Konzentration oder Gehalt prüfen.', 'conc');
    }
    R.checks.push({ type: 'mass', g: mWeigh, label: 'Einwaage' });
    if (Vp !== null && liquid) R.checks.push({ type: 'pipette', L: Vp, label: 'Volumen Stoff' });
  });
}
