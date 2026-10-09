// Einheiten-System: Einheiten lesen (Präfix + Basiseinheit), in Basiseinheiten
// umrechnen und zwischen Konzentrationsarten umrechnen.
//
// Basiseinheiten je Größenart:
//   amount    Stoffmengenkonzentration  mol/L
//   mass      Massenkonzentration       g/L
//   massfrac  Massenanteil              g/g   (% (m/m), ppm, mg/kg …)
//   volfrac   Volumenanteil             L/L   (% (V/V), mL/L …)
//   molality  Molalität                 mol/kg
//   normality Äquivalentkonzentration   eq/L
//   volume    Volumen                   L
//   massq     Masse                     g
//   amountq   Stoffmenge                mol
//
// Umrechnungen zwischen Größenarten benötigen Zusatzangaben (Molare Masse,
// Dichte, Wertigkeit). Fehlen sie, wird NICHT geraten, sondern die fehlende
// Angabe in `missing` zurückgegeben.

import { parseNumber, NumberError, formatNumber } from './numbers.js';

export class UnitError extends Error {
  constructor(message, code = null, options = null) {
    super(message);
    this.name = 'UnitError';
    this.code = code;
    this.options = options;
  }
}

export const PREFIXES = Object.freeze({
  f: 1e-15, p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, c: 1e-2, d: 1e-1, '': 1, k: 1e3, M: 1e6,
});
const PREFIX_ALIASES = { u: 'µ', 'μ': 'µ', mc: 'µ' };

export const KINDS = Object.freeze({
  amount: { label: 'Stoffmengenkonzentration', base: 'mol/L' },
  mass: { label: 'Massenkonzentration', base: 'g/L' },
  massfrac: { label: 'Massenanteil', base: 'g/g' },
  volfrac: { label: 'Volumenanteil', base: 'L/L' },
  molality: { label: 'Molalität', base: 'mol/kg' },
  normality: { label: 'Äquivalentkonzentration (Normalität)', base: 'eq/L' },
  volume: { label: 'Volumen', base: 'L' },
  massq: { label: 'Masse', base: 'g' },
  amountq: { label: 'Stoffmenge', base: 'mol' },
});

export const CONC_KINDS = Object.freeze(['amount', 'mass', 'massfrac', 'volfrac', 'molality', 'normality']);

export const PARAMS = Object.freeze({
  M: { label: 'Molare Masse', unit: 'g/mol' },
  rhoSol: { label: 'Dichte der Lösung', unit: 'g/mL' },
  rhoSub: { label: 'Dichte des reinen Stoffes', unit: 'g/mL' },
  z: { label: 'Wertigkeit z', unit: 'eq/mol' },
});

export const HINTS = Object.freeze({
  ppm: 'ppm, ppb und ppt sind Massenanteile (mg/kg, µg/kg, ng/kg). Die Gleichsetzung mit mg/L, µg/L bzw. ng/L gilt nur für verdünnte wässrige Lösungen (Dichte ≈ 1 g/mL).',
  ppmAssumed: 'Für die ppm/ppb/ppt-Umrechnung wurde eine Lösungsdichte von 1 g/mL angenommen (verdünnte wässrige Lösung). Bei anderen Lösungen die Dichte eingeben.',
  ppt: 'ppt bedeutet hier „parts per trillion“ (10⁻¹², ng/kg), nicht „parts per thousand“.',
  volfrac: 'Volumina sind bei Mischungen nicht additiv (z. B. 50 mL Ethanol + 50 mL Wasser ≈ 96 mL). % (V/V) bezieht sich hier auf das Endvolumen: Komponente abmessen und auf das Volumen auffüllen.',
  normality: 'Normalität: c(eq) = z · c. Die Wertigkeit z hängt von der Reaktion ab (z. B. H2SO4 bei vollständiger Neutralisation: z = 2).',
  molality: 'Molalität bezieht sich auf 1 kg Lösungsmittel, nicht auf das Volumen der Lösung.',
  massfrac: 'Massenanteile (% (m/m), mg/kg) beziehen sich auf die Masse der Lösung. Für die Umrechnung in volumenbezogene Konzentrationen wird die Dichte der Lösung benötigt.',
});

function mkUnit(sym, kind, f, extra = {}) {
  return Object.freeze({ sym, kind, f, ...extra });
}

// Prozent- und ppm-Schreibweisen (Schlüssel: kleingeschrieben, ohne Leerzeichen)
const PERCENT_UNITS = {
  massfrac: mkUnit('% (m/m)', 'massfrac', 0.01, { pct: 'm/m' }),
  volfrac: mkUnit('% (V/V)', 'volfrac', 0.01, { pct: 'V/V' }),
  mass: mkUnit('% (m/V)', 'mass', 10, { pct: 'm/V' }),
};
const SPECIAL = new Map();
for (const k of ['%(m/m)', '%m/m', '%(w/w)', '%w/w', '%(g/g)', 'gew%', 'gew.%', 'gew.-%', 'gew-%', 'massen%', 'masse%', 'wt%', 'wt.%', '%wt', 'ma%', 'ma.-%']) SPECIAL.set(k, PERCENT_UNITS.massfrac);
for (const k of ['%(v/v)', '%v/v', 'vol%', 'vol.%', 'vol.-%', 'vol-%', '%vol']) SPECIAL.set(k, PERCENT_UNITS.volfrac);
for (const k of ['%(m/v)', '%m/v', '%(w/v)', '%w/v', '%(g/v)', '%g/v', '%(g/ml)']) SPECIAL.set(k, PERCENT_UNITS.mass);
SPECIAL.set('ppm', mkUnit('ppm', 'massfrac', 1e-6, { ppm: true }));
SPECIAL.set('ppb', mkUnit('ppb', 'massfrac', 1e-9, { ppm: true }));
SPECIAL.set('ppt', mkUnit('ppt', 'massfrac', 1e-12, { ppm: true }));

const BASES = [
  ['mol', 'mol'], ['val', 'eq'], ['eq', 'eq'], ['g', 'g'], ['L', 'L'], ['l', 'L'], ['M', 'M'], ['N', 'N'],
];

function resolvePrefix(p) {
  if (p in PREFIXES) return p;
  if (p in PREFIX_ALIASES) return PREFIX_ALIASES[p];
  return null;
}

function parseAtom(atom) {
  for (const [name, base] of BASES) {
    if (atom.endsWith(name)) {
      const prefix = resolvePrefix(atom.slice(0, -name.length));
      if (prefix !== null) return { base, prefix, f: PREFIXES[prefix] };
    }
  }
  return null;
}

const BASE_DISPLAY = { mol: 'mol', eq: 'eq', g: 'g', L: 'L', M: 'M', N: 'N' };

function unknownUnit(str) {
  return new UnitError(`Unbekannte Einheit „${str}“. Beispiele: mg/L, µg/mL, mmol/L, mM, % (m/m), ppm.`, 'unknown');
}

const cache = new Map();

/**
 * Liest eine Einheit. Beispiele: "mg/L", "ug/ml", "µM", "mM", "M", "% (m/m)",
 * "%w/v", "ppb", "mol/kg", "meq/L", "N", "g/100 mL", "mg L-1", "mL".
 * @returns {{sym:string, kind:string, f:number, ppm?:boolean, pct?:string}}
 */
export function parseUnit(input) {
  if (input && typeof input === 'object' && input.kind) return input;
  const original = String(input ?? '').trim();
  if (!original) throw new UnitError('Keine Einheit angegeben.', 'empty');
  if (cache.has(original)) return cache.get(original);

  let s = original.replace(/μ/g, 'µ').replace(/[−–]/g, '-');
  const compact = s.toLowerCase().replace(/\s+/g, '');
  if (compact === '%' || compact === 'prozent') {
    throw new UnitError('„%“ ist mehrdeutig. Bitte angeben: % (m/m), % (m/V) oder % (V/V).', 'percent-ambiguous',
      [PERCENT_UNITS.massfrac, PERCENT_UNITS.mass, PERCENT_UNITS.volfrac]);
  }
  if (SPECIAL.has(compact)) {
    const u = SPECIAL.get(compact);
    cache.set(original, u);
    return u;
  }

  // "mg L-1", "mg·L⁻¹", "mg L^-1" -> "mg/L"
  s = s.replace(/⁻¹/g, '^-1').replace(/[\s·*]+([A-Za-zµ]+)\^?-1$/, '/$1').replace(/\s+/g, '');
  const parts = s.split('/');
  let unit;
  if (parts.length === 1) {
    const a = parseAtom(parts[0]);
    if (!a) throw unknownUnit(original);
    const sym = a.prefix + BASE_DISPLAY[a.base];
    switch (a.base) {
      case 'g': unit = mkUnit(sym, 'massq', a.f); break;
      case 'mol': unit = mkUnit(sym, 'amountq', a.f); break;
      case 'L': unit = mkUnit(sym, 'volume', a.f); break;
      case 'M': unit = mkUnit(sym, 'amount', a.f); break;
      case 'N': unit = mkUnit(sym, 'normality', a.f); break;
      default: throw unknownUnit(original);
    }
  } else if (parts.length === 2) {
    const num = parseAtom(parts[0]);
    const dm = parts[1].match(/^(\d+(?:[.,]\d+)?)?(.+)$/);
    const denFactor = dm && dm[1] ? Number(dm[1].replace(',', '.')) : 1;
    const den = dm ? parseAtom(dm[2]) : null;
    if (!num || !den || !(denFactor > 0)) throw unknownUnit(original);
    const denText = (dm[1] ? `${dm[1]} ` : '') + den.prefix + BASE_DISPLAY[den.base];
    const sym = `${num.prefix}${BASE_DISPLAY[num.base]}/${denText}`;
    const pair = `${num.base}/${den.base}`;
    const denF = den.f * denFactor;
    switch (pair) {
      case 'g/L': unit = mkUnit(sym, 'mass', num.f / denF); break;
      case 'mol/L': unit = mkUnit(sym, 'amount', num.f / denF); break;
      case 'eq/L': unit = mkUnit(sym, 'normality', num.f / denF); break;
      case 'g/g': unit = mkUnit(sym, 'massfrac', num.f / denF); break;
      case 'L/L': unit = mkUnit(sym, 'volfrac', num.f / denF); break;
      // Molalität: Nenner in kg
      case 'mol/g': unit = mkUnit(sym, 'molality', num.f / (denF / 1000)); break;
      default: throw unknownUnit(original);
    }
  } else {
    throw unknownUnit(original);
  }
  cache.set(original, unit);
  return unit;
}

export function tryParseUnit(input) {
  try {
    return parseUnit(input);
  } catch (e) {
    if (e instanceof UnitError) return null;
    throw e;
  }
}

// Zahl am Anfang einer Mengenangabe
const NUM_RE = /^\s*([+\-−]?(?:10\s*\^\s*[+\-−]?\d+|(?:\d+(?:[.,]\d+)*|[.,]\d+)(?:\s*(?:[eE][+\-−]?\d+|[·•*×xX]\s*10\s*(?:\^\s*\(?\s*[+\-−]?\d+\s*\)?|[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))(?![a-zA-Z]))?))/;

/**
 * Liest eine Mengenangabe wie "5 µg/mL", "0,1 M", "2,4·10⁻⁸ mol/L", "250 mL".
 * @param {string} text
 * @param {{defaultUnit?: string|object, kinds?: string[]}} opts
 * @returns {{value:number, unit:object|null, unitText:string}}
 */
export function parseQuantity(text, opts = {}) {
  const s = String(text ?? '').trim();
  if (!s) throw new NumberError('Bitte einen Wert eingeben.');
  const m = s.match(NUM_RE);
  if (!m) throw new NumberError(`„${s}“ beginnt nicht mit einer Zahl.`);
  const value = parseNumber(m[1]);
  const unitText = s.slice(m[0].length).trim();
  let unit = null;
  if (unitText) unit = parseUnit(unitText);
  else if (opts.defaultUnit) unit = parseUnit(opts.defaultUnit);
  if (unit && opts.kinds && !opts.kinds.includes(unit.kind)) {
    throw new UnitError(`Die Einheit „${unit.sym}“ (${KINDS[unit.kind].label}) passt hier nicht. Erwartet: ${opts.kinds.map((k) => KINDS[k].label).join(', ')}.`, 'wrong-kind');
  }
  return { value, unit, unitText };
}

/** Wert in Basiseinheit der Größenart. */
export function toBase(value, unit) {
  return value * parseUnit(unit).f;
}

/** Wert aus Basiseinheit in Zieleinheit. */
export function fromBase(value, unit) {
  return value / parseUnit(unit).f;
}

// Umrechnungsgraph zwischen Konzentrationsarten (Werte in Basiseinheiten,
// Dichten in g/mL -> intern ×1000 = g/L).
const EDGES = {
  amount: {
    mass: { needs: ['M'], fn: (c, p) => c * p.M },
    normality: { needs: ['z'], fn: (c, p) => c * p.z },
    molality: { needs: ['M', 'rhoSol'], fn: (c, p) => (1000 * c) / (p.rhoSol * 1000 - c * p.M) },
  },
  mass: {
    amount: { needs: ['M'], fn: (c, p) => c / p.M },
    massfrac: { needs: ['rhoSol'], fn: (c, p) => c / (p.rhoSol * 1000) },
    volfrac: { needs: ['rhoSub'], fn: (c, p) => c / (p.rhoSub * 1000) },
  },
  normality: {
    amount: { needs: ['z'], fn: (c, p) => c / p.z },
  },
  massfrac: {
    mass: { needs: ['rhoSol'], fn: (w, p) => w * p.rhoSol * 1000 },
  },
  volfrac: {
    mass: { needs: ['rhoSub'], fn: (phi, p) => phi * p.rhoSub * 1000 },
  },
  molality: {
    amount: { needs: ['M', 'rhoSol'], fn: (b, p) => (b * p.rhoSol * 1000) / (1000 + b * p.M) },
  },
};

function findPath(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const k = queue.shift();
    for (const next of Object.keys(EDGES[k] || {})) {
      if (next in prev) continue;
      prev[next] = k;
      if (next === to) {
        const path = [to];
        let cur = to;
        while (prev[cur] !== null) { cur = prev[cur]; path.unshift(cur); }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function validParam(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Rechnet einen Wert von einer Einheit in eine andere um.
 * @param {number} value
 * @param {string|object} from
 * @param {string|object} to
 * @param {{M?:number, rhoSol?:number, rhoSub?:number, z?:number}} params
 * @returns {{ok:boolean, value?:number, missing:string[], hints:string[], assumptions:string[], used:string[]}}
 */
export function convert(value, from, to, params = {}) {
  const fu = parseUnit(from);
  const tu = parseUnit(to);
  const hints = new Set();
  const assumptions = new Set();
  for (const u of [fu, tu]) {
    if (u.ppm) hints.add('ppm');
    if (u.sym === 'ppt') hints.add('ppt');
    if (u.kind === 'volfrac') hints.add('volfrac');
    if (u.kind === 'normality') hints.add('normality');
    if (u.kind === 'molality') hints.add('molality');
  }
  if (fu.kind === tu.kind) {
    return { ok: true, value: (value * fu.f) / tu.f, missing: [], hints: [...hints], assumptions: [], used: [] };
  }
  const path = findPath(fu.kind, tu.kind);
  if (!path) {
    throw new UnitError(`${KINDS[fu.kind].label} kann nicht in ${KINDS[tu.kind].label} umgerechnet werden.`, 'incompatible');
  }
  const p = { ...params };
  const needed = new Set();
  for (let i = 0; i < path.length - 1; i++) for (const n of EDGES[path[i]][path[i + 1]].needs) needed.add(n);
  // ppm/ppb/ppt: verdünnte wässrige Lösung (ρ = 1 g/mL), wenn keine Dichte angegeben ist
  if (needed.has('rhoSol') && !validParam(p.rhoSol) && (fu.ppm || tu.ppm)) {
    p.rhoSol = 1;
    assumptions.add('ppmAssumed');
  }
  const missing = [...needed].filter((n) => !validParam(p[n]));
  if (missing.length) return { ok: false, missing, hints: [...hints], assumptions: [...assumptions], used: [...needed] };
  let v = value * fu.f;
  for (let i = 0; i < path.length - 1; i++) v = EDGES[path[i]][path[i + 1]].fn(v, p);
  if (!Number.isFinite(v) || v < 0) {
    throw new UnitError('Die Umrechnung ergibt keinen sinnvollen Wert (Angaben prüfen, z. B. Dichte zu klein für diese Konzentration).', 'invalid');
  }
  return { ok: true, value: v / tu.f, missing: [], hints: [...hints], assumptions: [...assumptions], used: [...needed] };
}

/** Prüft, ob zwei Einheiten ohne Zusatzangaben ineinander umrechenbar sind. */
export function sameKind(a, b) {
  return parseUnit(a).kind === parseUnit(b).kind;
}

// Auswahllisten für die Oberfläche
export const UNIT_LISTS = Object.freeze({
  amount: ['mol/L', 'mmol/L', 'µmol/L', 'nmol/L', 'pmol/L', 'M', 'mM', 'µM', 'nM', 'pM'],
  mass: ['g/L', 'mg/mL', 'mg/L', 'µg/mL', 'µg/L', 'ng/mL', 'ng/L', 'pg/mL', 'µg/µL', 'ng/µL', '% (m/V)'],
  massfrac: ['% (m/m)', 'g/kg', 'mg/kg', 'µg/kg', 'ng/kg', 'mg/g', 'µg/g', 'ng/g', 'ppm', 'ppb', 'ppt'],
  volfrac: ['% (V/V)', 'mL/L', 'µL/L', 'µL/mL'],
  molality: ['mol/kg', 'mmol/kg', 'µmol/kg'],
  normality: ['N', 'mN', 'eq/L', 'meq/L'],
  volume: ['L', 'mL', 'µL', 'nL'],
  massq: ['kg', 'g', 'mg', 'µg', 'ng'],
  amountq: ['mol', 'mmol', 'µmol', 'nmol'],
});

// Für die Umrechner-Übersicht: je Größenart eine sinnvolle Auswahl
export const OVERVIEW_UNITS = Object.freeze({
  amount: ['mol/L', 'mmol/L', 'µmol/L', 'nmol/L', 'pmol/L'],
  mass: ['g/L', 'mg/mL', 'mg/L', 'µg/mL', 'µg/L', 'ng/mL', 'ng/L', 'pg/mL', '% (m/V)'],
  massfrac: ['% (m/m)', 'ppm', 'ppb', 'ppt', 'g/kg', 'mg/kg', 'µg/kg', 'ng/kg'],
  volfrac: ['% (V/V)', 'mL/L', 'µL/L'],
  molality: ['mol/kg', 'mmol/kg', 'µmol/kg'],
  normality: ['eq/L', 'meq/L'],
});

// Bevorzugte Einheiten für die Zusammenfassungszeile
const SUMMARY_UNITS = {
  amount: ['mol/L', 'mmol/L', 'µmol/L', 'nmol/L', 'pmol/L'],
  mass: ['g/L', 'mg/L', 'µg/L', 'ng/L', 'pg/mL'],
  massfrac: ['% (m/m)', 'ppm', 'ppb', 'ppt'],
  volfrac: ['% (V/V)', 'mL/L', 'µL/L'],
  molality: ['mol/kg', 'mmol/kg', 'µmol/kg'],
  normality: ['eq/L', 'meq/L'],
};

/**
 * Wählt aus `candidates` die Einheit, in der der Wert am besten lesbar ist
 * (bevorzugt 1 ≤ x < 1000).
 */
export function bestUnit(baseValue, candidates) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const u = parseUnit(c);
    const v = Math.abs(baseValue / u.f);
    if (v === 0) return u;
    const lg = Math.log10(v);
    const score = lg >= 0 && lg < 3 ? 0 : lg < 0 ? -lg : lg - 3 + 0.0001;
    if (score < bestScore) { best = u; bestScore = score; }
  }
  return best;
}

/** Sinnvolle Volumeneinheit (µL / mL / L) für einen Wert in L. */
export function autoVolume(liters) {
  const a = Math.abs(liters);
  if (a === 0) return parseUnit('mL');
  if (a < 1e-6) return parseUnit('nL');
  if (a < 1e-3) return parseUnit('µL');
  if (a < 10) return parseUnit('mL');
  return parseUnit('L');
}

/** Sinnvolle Masseneinheit (µg / mg / g / kg) für einen Wert in g. */
export function autoMass(grams) {
  const a = Math.abs(grams);
  if (a === 0) return parseUnit('g');
  if (a < 1e-6) return parseUnit('ng');
  if (a < 1e-3) return parseUnit('µg');
  if (a < 1) return parseUnit('mg');
  if (a < 1000) return parseUnit('g');
  return parseUnit('kg');
}

/** Formatiert einen Wert (Basiseinheit) mit automatisch gewählter Einheit. */
export function formatAuto(baseValue, kind, sig = 4) {
  let u;
  if (kind === 'volume') u = autoVolume(baseValue);
  else if (kind === 'massq') u = autoMass(baseValue);
  else u = bestUnit(baseValue, SUMMARY_UNITS[kind] || UNIT_LISTS[kind]);
  return `${formatNumber(baseValue / u.f, sig)} ${u.sym}`;
}

/**
 * Rechnet einen Wert in alle sinnvollen Einheiten um (Umrechner-Übersicht).
 * @returns {{groups: Array<{kind, label, rows: Array<{unit, value}>, best, missing: string[]}>, hints:string[], assumptions:string[]}}
 */
export function convertAll(value, from, params = {}) {
  const fu = parseUnit(from);
  if (!CONC_KINDS.includes(fu.kind)) throw new UnitError('Bitte eine Konzentrationseinheit angeben.', 'not-conc');
  const hints = new Set();
  const assumptions = new Set();
  const groups = [];
  for (const kind of CONC_KINDS) {
    const rows = [];
    const missing = new Set();
    const missingUnits = [];
    let error = null;
    for (const sym of OVERVIEW_UNITS[kind]) {
      const u = parseUnit(sym);
      let r;
      try {
        r = convert(value, fu, u, params);
      } catch (e) {
        if (e instanceof UnitError) { error = e.message; break; }
        throw e;
      }
      if (!r.ok) {
        r.missing.forEach((m) => missing.add(m));
        missingUnits.push(u);
        continue;
      }
      r.hints.forEach((h) => hints.add(h));
      r.assumptions.forEach((a) => assumptions.add(a));
      // ppm-Annahme nur dort markieren, wo sie verwendet wurde
      rows.push({ unit: u, value: r.value, assumed: r.assumptions.includes('ppmAssumed') });
    }
    let best = null;
    const exact = rows.filter((r) => !r.assumed);
    const pool = exact.length ? exact : rows;
    if (pool.length) {
      const baseVal = pool[0].value * pool[0].unit.f;
      const candidates = SUMMARY_UNITS[kind].filter((s) => pool.some((r) => r.unit.sym === s));
      best = candidates.length ? bestUnit(baseVal, candidates) : pool[0].unit;
    }
    groups.push({ kind, label: KINDS[kind].label, rows, best, missing: [...missing], missingUnits, error });
  }
  return { groups, hints: [...hints], assumptions: [...assumptions] };
}
