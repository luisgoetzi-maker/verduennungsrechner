// Gemeinsame Hilfsfunktionen der Rechenmodi: Eingaben lesen, Ergebnis-
// Struktur, Rechenweg-Schritte, Formatierung.
//
// Jeder Rechenmodus liefert ein Ergebnisobjekt:
// {
//   ok: boolean,
//   error: string|null, field: string|null,   // Eingabefehler
//   missing: [{param, label, unit}],          // fehlende Zusatzangaben (nicht geraten!)
//   main: [{label, text, value?, unit?, primary?}],  // Hauptergebnisse
//   instruction: string|null,                 // Handlungsanweisung ("X mL auf Y mL auffüllen")
//   steps: [{label, eq?, sub?, res?, text?}], // Rechenweg mit eingesetzten Zahlen
//   warnings: [{level, text}], hints: [string],
//   checks: [{type, ...}],                    // Mengen für Plausibilitätsprüfung/Geräte (Etappe 3)
//   table: {...} | undefined, values: {...}
// }

(function () {
  'use strict';
  const { parseQuantity, parseUnit, KINDS, PARAMS, HINTS, UnitError, autoVolume, autoMass, bestUnit, UNIT_LISTS } = VR.use('core/units.js');
  const { parseNumber, formatNumber, NumberError } = VR.use('core/numbers.js');
  const { tryParseFormula, atomicMass, elementCounts, WATER_MOLAR_MASS } = VR.use('core/formula.js');

class CalcError extends Error {
  constructor(message, field = null, cause = null) {
    super(message);
    this.name = 'CalcError';
    this.field = field;
    if (cause && cause.code) this.code = cause.code;
    if (cause && cause.options) this.options = cause.options;
  }
}

/** Signal: Zusatzangabe fehlt (wird zu result.missing). */
class MissingParam extends Error {
  constructor(params) {
    super('missing');
    this.params = Array.isArray(params) ? params : [params];
  }
}

function newResult() {
  return {
    ok: true, error: null, field: null, code: null, options: null,
    missing: [], main: [], instruction: null, steps: [], warnings: [], hints: [], checks: [], values: {},
  };
}

/** Führt eine Rechenfunktion aus und wandelt Fehler in ein Ergebnisobjekt um. */
function runCalc(fn) {
  const R = newResult();
  try {
    fn(R);
  } catch (e) {
    if (e instanceof MissingParam) {
      R.ok = false;
      R.missing = e.params.map((p) => ({ param: p, ...(PARAMS[p] || { label: p, unit: '' }) }));
      R.error = `Für diese Berechnung fehlt: ${R.missing.map((m) => m.label).join(', ')}.`;
    } else if (e instanceof CalcError) {
      R.ok = false;
      R.error = e.message;
      R.field = e.field;
      R.code = e.code || null;
      R.options = e.options || null;
    } else {
      throw e;
    }
  }
  R.hints = [...new Set(R.hints)];
  return R;
}

function isEmpty(input) {
  if (input === null || input === undefined) return true;
  if (typeof input === 'string') return input.trim() === '';
  if (typeof input === 'object' && 'value' in input) return input.value === null || input.value === undefined || String(input.value).trim() === '';
  return false;
}

/**
 * Liest eine Mengenangabe. Akzeptiert "5 mL" oder {value: "5", unit: "mL"};
 * steht im Wert bereits eine Einheit ("5 µg/mL"), hat diese Vorrang.
 * @returns {{value:number, unit:object, base:number}|null}
 */
function readQuantity(input, { kinds = null, label = 'Wert', field = null, required = true, allowZero = false } = {}) {
  if (isEmpty(input)) {
    if (required) throw new CalcError(`${label}: bitte einen Wert eingeben.`, field);
    return null;
  }
  const text = typeof input === 'string' || typeof input === 'number' ? String(input) : String(input.value);
  const defaultUnit = typeof input === 'object' && input !== null ? input.unit : undefined;
  let q;
  try {
    q = parseQuantity(text, { defaultUnit: defaultUnit || undefined });
  } catch (e) {
    if (e instanceof NumberError || e instanceof UnitError) throw new CalcError(`${label}: ${e.message}`, field, e);
    throw e;
  }
  if (!q.unit) throw new CalcError(`${label}: Einheit fehlt.`, field);
  if (kinds && !kinds.includes(q.unit.kind)) {
    throw new CalcError(`${label}: Die Einheit „${q.unit.sym}“ (${KINDS[q.unit.kind].label}) passt hier nicht – erwartet ${kinds.map((k) => KINDS[k].label).join(' oder ')}.`, field);
  }
  if (q.value < 0 || (!allowZero && q.value === 0)) throw new CalcError(`${label}: Der Wert muss größer als 0 sein.`, field);
  return { value: q.value, unit: q.unit, base: q.value * q.unit.f };
}

/** Liest eine Zahl (optional). */
function readNumber(input, { label = 'Wert', field = null, required = false, min = null, max = null, minExclusive = true } = {}) {
  if (isEmpty(input)) {
    if (required) throw new CalcError(`${label}: bitte einen Wert eingeben.`, field);
    return null;
  }
  let v;
  try {
    v = parseNumber(typeof input === 'object' && 'value' in input ? input.value : input);
  } catch (e) {
    throw new CalcError(`${label}: ${e.message}`, field);
  }
  if (min !== null && (minExclusive ? v <= min : v < min)) throw new CalcError(`${label}: Der Wert muss größer als ${min} sein.`, field);
  if (max !== null && v > max) throw new CalcError(`${label}: Der Wert darf höchstens ${max} sein.`, field);
  return v;
}

/** Formatierungshelfer für eine Rechnung. */
function formatter(sig = 4) {
  const n = (v) => formatNumber(v, sig);
  const withUnit = (v, unit) => `${n(v)} ${typeof unit === 'string' ? unit : unit.sym}`;
  return {
    sig,
    n,
    /** Wert in Basiseinheit -> Text in gegebener Einheit */
    u: (base, unit) => {
      const uu = parseUnit(unit);
      return withUnit(base / uu.f, uu);
    },
    /** Eingabegröße so, wie sie eingegeben wurde */
    q: (qty) => withUnit(qty.value, qty.unit),
    vol: (L) => {
      const u = autoVolume(L);
      return withUnit(L / u.f, u);
    },
    mass: (g) => {
      const u = autoMass(g);
      return withUnit(g / u.f, u);
    },
    conc: (base, kind, prefer = null) => {
      const u = prefer ? parseUnit(prefer) : bestUnit(base, UNIT_LISTS[kind]);
      return withUnit(base / u.f, u);
    },
    L: (L) => `${n(L)} L`,
    g: (g) => `${n(g)} g`,
    mol: (x) => `${n(x)} mol`,
    M: (M) => `${formatNumber(M, Math.max(sig, Math.floor(Math.log10(Math.abs(M) || 1)) + 3))} g/mol`,
    pct: (p) => `${n(p)} %`,
  };
}

function step(label, eq, sub, res) {
  return { label, eq, sub, res };
}

function note(label, text) {
  return { label, text };
}

/** Rechenweg-Schritt als einzeiliger Text. */
function stepText(s) {
  if (s.text) return s.label ? `${s.label}: ${s.text}` : s.text;
  const parts = [s.eq, s.sub, s.res].filter(Boolean);
  return `${s.label ? `${s.label}: ` : ''}${parts.join(' = ')}`;
}

function addHint(R, key) {
  if (HINTS[key]) R.hints.push(HINTS[key]);
}

/**
 * Ermittelt die Molare Masse und Formelinformationen.
 * Vorrang: manuelle Eingabe M > eingegebene Formel > Stoffeintrag.
 * @returns {{M:number|null, parsed:object|null, label:string, source:string}}
 */
function resolveMolarMass({ substance = null, formula = null, M = null }) {
  let parsed = null;
  let label = '';
  const f = formula && String(formula).trim();
  if (f) {
    const r = tryParseFormula(f);
    if (!r.ok) throw new CalcError(`Formel: ${r.error}`, 'formula');
    parsed = r;
    label = r.pretty;
  } else if (substance && substance.formula) {
    const r = tryParseFormula(substance.formula);
    if (r.ok) parsed = r;
    label = substance.name;
  } else if (substance) {
    label = substance.name;
  }
  const manual = M !== null && M !== undefined && M !== '' ? readNumber(M, { label: 'Molare Masse', field: 'M', min: 0 }) : null;
  if (manual) return { M: manual, parsed, label: label || 'Stoff', source: 'manuell eingegeben' };
  if (parsed && f) return { M: parsed.molarMass, parsed, label, source: `aus Formel ${parsed.pretty}` };
  if (substance && substance.mw) {
    return {
      M: substance.mw, parsed, label,
      source: substance.mwSource === 'manual' ? 'aus Stoffeintrag (manuell)' : `aus Formel ${parsed ? parsed.pretty : substance.formula}`,
    };
  }
  return { M: null, parsed, label: label || 'Stoff', source: '' };
}

/**
 * Bezugsform der Konzentration (z. B. "1000 mg/L Cu" aus CuSO4·5H2O).
 * type: 'compound' (wie Formel) | 'anhydrous' (ohne Kristallwasser) | 'element' | 'formula'
 * @returns {{Mref:number, k:number, label:string, isCompound:boolean}}
 */
function resolveReference(ref, mm, f) {
  const type = (ref && ref.type) || 'compound';
  if (type === 'compound') return { Mref: mm.M, k: 1, label: mm.label, isCompound: true };
  if (!mm.M) throw new MissingParam('M');
  if (type === 'anhydrous') {
    const water = mm.parsed ? mm.parsed.waterCount : 0;
    if (!water) throw new CalcError('Bezug „wasserfrei“: Der Stoff enthält laut Formel kein Kristallwasser.', 'reference');
    const Mref = mm.M - water * WATER_MOLAR_MASS;
    return { Mref, k: 1, label: `wasserfreie Form (ohne ${f.n(water)} H₂O)`, isCompound: false };
  }
  if (type === 'element') {
    const sym = String(ref.element || '').trim();
    if (!sym) throw new CalcError('Bezug „Element“: bitte ein Elementsymbol angeben (z. B. Cu).', 'reference');
    if (!mm.parsed) throw new CalcError('Bezug „Element“ braucht eine Summenformel.', 'reference');
    let Ma;
    try {
      Ma = atomicMass(sym);
    } catch (e) {
      throw new CalcError(e.message, 'reference');
    }
    const counts = elementCounts(mm.parsed.counts);
    const k = counts[sym] || 0;
    if (!k) throw new CalcError(`Bezug „${sym}“: Das Element kommt in der Formel nicht vor.`, 'reference');
    return { Mref: Ma, k, label: `${sym} (${f.n(k)} je Formeleinheit)`, isCompound: false };
  }
  if (type === 'formula') {
    const r = tryParseFormula(ref.formula || '');
    if (!r.ok) throw new CalcError(`Bezugsformel: ${r.error}`, 'reference');
    const k = ref.count ? readNumber(ref.count, { label: 'Anzahl je Formeleinheit', min: 0 }) : 1;
    return { Mref: r.molarMass, k, label: `${r.pretty}${k !== 1 ? ` (${f.n(k)} je Formeleinheit)` : ''}`, isCompound: false };
  }
  throw new CalcError('Unbekannte Bezugsform.', 'reference');
}

function requireParam(value, name) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) throw new MissingParam(name);
  return value;
}

function warn(R, text, level = 'warn') {
  R.warnings.push({ level, text });
}

/** Weitere Stoffe (＋ im Formular): nur Einträge mit Stoff oder Formel zählen. */
function activeExtras(input) {
  return (Array.isArray(input && input.extra) ? input.extra : [])
    .filter((e) => e && (e.substance || String(e.formula || '').trim()));
}

/** Anzeigename eines Stoffes (Datenbankeintrag, Formel oder "Stoff n"). */
function componentName(e, nr) {
  if (e && e.substance && e.substance.name) return e.substance.name;
  const fml = e && String(e.formula || '').trim();
  if (fml) {
    const r = tryParseFormula(fml);
    return r.ok ? r.pretty : fml;
  }
  return `Stoff ${nr}`;
}

  VR.provide('core/modes/common.js', { CalcError, MissingParam, newResult, runCalc, readQuantity, readNumber, formatter, step, note, stepText, addHint, resolveMolarMass, resolveReference, requireParam, warn, activeExtras, componentName });
}());
