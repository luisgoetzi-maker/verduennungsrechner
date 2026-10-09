// Abschätzung der Messunsicherheit aus Gerätetoleranzen (Fehlerfortpflanzung).
//
// Annahmen (siehe ANNAHMEN.md):
//  - Toleranzen von Messkolben/Vollpipetten (Klasse A) als Rechteckverteilung: u = T/√3
//  - Kolbenhubpipetten (ISO 8655-2): systematische Abweichung e (Rechteck) und
//    zufällige Abweichung s am Nennvolumen, absolut auch für Teilvolumina:
//    u = √((e/√3)² + s²)
//  - Waage: Standardunsicherheit 0,1 mg je Wägung (einstellbar über opts)
//  - Relative Unsicherheiten werden quadratisch addiert (Produkte/Quotienten)

import { DEFAULT_SETTINGS } from './settings.js';
import { formatNumber } from './numbers.js';
import { formatAuto } from './units.js';

// Messkolben Klasse A, DIN EN ISO 1042: Nennvolumen mL -> Toleranz ± mL
export const FLASK_TOL = { 5: 0.025, 10: 0.025, 20: 0.04, 25: 0.04, 50: 0.06, 100: 0.1, 200: 0.15, 250: 0.15, 500: 0.25, 1000: 0.4, 2000: 0.6 };
// Vollpipetten Klasse A, DIN EN ISO 648: mL -> ± mL
export const VOLPIP_TOL = { 1: 0.008, 2: 0.01, 5: 0.015, 10: 0.02, 20: 0.03, 25: 0.03, 50: 0.05, 100: 0.08 };
// Kolbenhubpipetten ISO 8655-2: Nennvolumen µL -> [systematisch %, zufällig %]
export const PIPETTE_TOL = { 2: [12, 6], 10: [1.2, 0.8], 20: [1, 0.5], 100: [0.8, 0.3], 200: [0.8, 0.3], 1000: [0.8, 0.3], 5000: [0.8, 0.3], 10000: [0.6, 0.3] };

const SQ3 = Math.sqrt(3);
const near = (a, b) => Math.abs(a - b) / b < 1e-6;

function pipetteTol(nominalUL) {
  if (PIPETTE_TOL[nominalUL]) return PIPETTE_TOL[nominalUL];
  // nächstgelegenes Nennvolumen (konservativ: das kleinere)
  const keys = Object.keys(PIPETTE_TOL).map(Number).sort((a, b) => a - b);
  const k = keys.filter((x) => x <= nominalUL).pop() || keys[0];
  return PIPETTE_TOL[k];
}

/**
 * Standardunsicherheit eines abgemessenen Volumens.
 * @param {number} L Volumen in Litern
 * @param {'auto'|'flask'|'pipette'} role  'flask' = Endvolumen (Messkolben)
 * @returns {{L, u, urel, device}}  u in Litern
 */
export function volumeUncertainty(L, role = 'pipette', settings = DEFAULT_SETTINGS) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const mL = L * 1000;
  const uL = L * 1e6;
  if (role === 'flask') {
    const fl = Object.keys(FLASK_TOL).map(Number).find((v) => near(v, mL));
    if (fl) {
      const u = FLASK_TOL[fl] / SQ3 / 1000;
      return { L, u, urel: u / L, device: `Messkolben ${fl} mL (± ${formatNumber(FLASK_TOL[fl], 3)} mL)` };
    }
  }
  const vp = (S.volPipettesML || []).find((v) => near(v, mL) && VOLPIP_TOL[v]);
  if (vp) {
    const u = VOLPIP_TOL[vp] / SQ3 / 1000;
    return { L, u, urel: u / L, device: `Vollpipette ${vp} mL (± ${formatNumber(VOLPIP_TOL[vp], 3)} mL)` };
  }
  const pips = (S.pipettesUL || DEFAULT_SETTINGS.pipettesUL).slice().sort((a, b) => a - b);
  const pip = pips.find((p) => uL <= p * (1 + 1e-9));
  if (pip) {
    const [e, s] = pipetteTol(pip);
    const uAbs = Math.sqrt(((e / 100) * pip / SQ3) ** 2 + ((s / 100) * pip) ** 2) * 1e-6;
    return { L, u: uAbs, urel: uAbs / L, device: `Kolbenhubpipette ${pip} µL (±${formatNumber(e, 2)} %, s ${formatNumber(s, 2)} %)` };
  }
  // größer als die größte Pipette: mehrere Hübe der größten
  const maxP = pips[pips.length - 1];
  const strokes = Math.ceil(uL / maxP - 1e-9);
  if (strokes <= 10) {
    const [e, s] = pipetteTol(maxP);
    const u1 = Math.sqrt(((e / 100) * maxP / SQ3) ** 2 + ((s / 100) * maxP) ** 2) * 1e-6;
    const uAbs = u1 * Math.sqrt(strokes);
    return { L, u: uAbs, urel: uAbs / L, device: `${strokes} × Kolbenhubpipette ${maxP} µL` };
  }
  // Messzylinder (grobe Annahme ±1 % vom Volumen)
  const uAbs = (0.01 * L) / SQ3;
  return { L, u: uAbs, urel: uAbs / L, device: 'Messzylinder (±1 % angenommen)' };
}

const pct = (x) => `${formatNumber(x * 100, 2)} %`;

/**
 * Schätzt die relative Unsicherheit des Ergebnisses.
 * @param {object} spec  R.uncertainty eines Rechenmodus
 * @param {{settings?, stockUrel?:number, balanceMg?:number, purityUrel?:number}} opts  stockUrel/purityUrel relativ (0,005 = 0,5 %)
 * @returns {{ok:boolean, rows:Array<{label, device, urel}>, urel:number, U:number, lines:string[], perStandard?:Array}}
 */
export function estimateUncertainty(spec, opts = {}) {
  const S = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const stockUrel = opts.stockUrel || 0;
  if (!spec) return { ok: false, rows: [], urel: 0, U: 0, lines: [] };
  const rows = [];
  const add = (label, device, urel) => rows.push({ label, device, urel });

  if (spec.kind === 'weighing') {
    const uM = (opts.balanceMg ?? 0.1) / 1000;
    add('Einwaage', `Waage, u = ${formatNumber(opts.balanceMg ?? 0.1, 2)} mg`, uM / spec.m);
    if (opts.purityUrel) add('Reinheit', 'laut Zertifikat', opts.purityUrel);
    if (spec.V) {
      const v = volumeUncertainty(spec.V, 'flask', S);
      add('Endvolumen', v.device, v.urel);
    }
    if (spec.Vproduct) {
      const v = volumeUncertainty(spec.Vproduct, 'pipette', S);
      rows.push({ label: '(alternativ Volumen statt Wägung)', device: v.device, urel: v.urel, alt: true });
    }
  } else if (spec.kind === 'dilution' || spec.kind === 'spike') {
    if (stockUrel) add('Stammlösung', 'Angabe', stockUrel);
    for (const st of spec.steps || []) {
      const v1 = volumeUncertainty(st.V1, 'pipette', S);
      add(`Volumen ${formatAuto(st.V1, 'volume', 3)}`, v1.device, v1.urel);
      if (st.V2) {
        const v2 = volumeUncertainty(st.V2, st.fill === false ? 'pipette' : 'flask', S);
        add(`Endvolumen ${formatAuto(st.V2, 'volume', 3)}`, v2.device, v2.urel);
      }
    }
  } else if (spec.kind === 'parallel' || spec.kind === 'serial') {
    // je Standard; seriell kumuliert
    // Quelle je Standard: Stamm, Zwischenverdünnung (Z) oder vorheriger Standard (seriell)
    const per = [];
    const byKey = {};
    for (const st of spec.steps) {
      const v1 = volumeUncertainty(st.V1, 'pipette', S);
      const v2 = volumeUncertainty(st.V2, 'flask', S);
      const src = st.src && st.src !== 'Stamm' ? byKey[st.src] : undefined;
      const base2 = src !== undefined ? src ** 2 : stockUrel ** 2;
      const urel = Math.sqrt(base2 + v1.urel ** 2 + v2.urel ** 2);
      if (st.key) byKey[st.key] = urel;
      per.push({ label: st.label, urel, devices: `${v1.device}; ${v2.device}` });
    }
    const worst = per.reduce((a, b) => (b.urel > a.urel ? b : a), per[0]);
    const lines = per.map((p) => `Std ${p.label}: u = ${pct(p.urel)}, U (k=2) = ${pct(2 * p.urel)}`);
    return { ok: true, rows: per.map((p) => ({ label: `Std ${p.label}`, device: p.devices, urel: p.urel })), urel: worst.urel, U: 2 * worst.urel, perStandard: per, lines };
  } else {
    return { ok: false, rows: [], urel: 0, U: 0, lines: [] };
  }
  const urel = Math.sqrt(rows.filter((r) => !r.alt).reduce((s, r) => s + r.urel ** 2, 0));
  const lines = rows.map((r) => `${r.label}: ${r.device} -> u_rel = ${pct(r.urel)}`);
  lines.push(`kombiniert: u = ${pct(urel)}; erweitert U (k = 2, ca. 95 %) = ${pct(2 * urel)}`);
  return { ok: true, rows, urel, U: 2 * urel, lines };
}
