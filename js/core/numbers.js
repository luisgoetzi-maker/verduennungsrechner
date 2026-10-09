// Zahlen lesen (deutsche und englische Schreibweise) und formatieren
// (signifikante Stellen, Dezimalkomma, wissenschaftliche Notation mit ·10ⁿ).

export class NumberError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NumberError';
  }
}

const SUP_TO_ASCII = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
};
const ASCII_TO_SUP = Object.fromEntries(Object.entries(SUP_TO_ASCII).map(([k, v]) => [v, k]));

export function toSuperscript(str) {
  return String(str).split('').map((c) => ASCII_TO_SUP[c] ?? c).join('');
}

export function fromSuperscript(str) {
  return String(str).split('').map((c) => SUP_TO_ASCII[c] ?? c).join('');
}

/**
 * Normalisiert eine Mantisse mit Dezimal- und evtl. Tausendertrennzeichen.
 * Regeln: Kommen "," und "." vor, ist das zuletzt stehende Zeichen das
 * Dezimaltrennzeichen. Kommt nur eines vor, ist es das Dezimaltrennzeichen
 * (mehrfach vorkommend: Tausendertrennzeichen).
 */
function normalizeMantissa(m) {
  const hasComma = m.includes(',');
  const hasDot = m.includes('.');
  if (hasComma && hasDot) {
    const decimal = m.lastIndexOf(',') > m.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    return m.split(thousands).join('').replace(decimal, '.');
  }
  const sep = hasComma ? ',' : hasDot ? '.' : null;
  if (!sep) return m;
  const parts = m.split(sep);
  if (parts.length === 2) return parts.join('.');
  // mehrfach: Tausendertrennzeichen, z. B. 1.000.000
  if (parts.slice(1).every((p) => p.length === 3)) return parts.join('');
  throw new NumberError(`Ungültige Zahl „${m}“.`);
}

/**
 * Liest eine Zahl. Akzeptiert z. B. "0,1", "0.1", "1e-3", "2,4·10^-8",
 * "2,4×10⁻⁸", "10^-3", "−5".
 */
export function parseNumber(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new NumberError('Ungültige Zahl.');
    return input;
  }
  let s = String(input ?? '').trim();
  if (!s) throw new NumberError('Bitte eine Zahl eingeben.');
  s = s.replace(/[−‒–]/g, '-').replace(/\s+/g, '');
  // Hochgestellte Exponenten: 10⁻⁸ -> 10^-8
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => '^' + fromSuperscript(m));
  s = s.replace(/\^\((.*)\)$/, '^$1');

  let m = s.match(/^10\^([+-]?\d+)$/);
  if (m) return Math.pow(10, Number(m[1]));

  m = s.match(/^([+-]?[\d.,]+)(?:[·•*×xX]10\^?([+-]?\d+)|[eE]([+-]?\d+))?$/);
  if (!m || !/\d/.test(m[1])) throw new NumberError(`„${input}“ ist keine gültige Zahl.`);
  const mantissa = Number(normalizeMantissa(m[1]));
  const exp = m[2] ?? m[3];
  const value = exp !== undefined ? mantissa * Math.pow(10, Number(exp)) : mantissa;
  if (!Number.isFinite(value)) throw new NumberError(`„${input}“ ist keine gültige Zahl.`);
  return value;
}

/** Wie parseNumber, liefert aber null statt eines Fehlers bei leerer Eingabe. */
export function parseOptionalNumber(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (String(input).trim() === '') return null;
  return parseNumber(input);
}

export function roundSig(x, sig) {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(Math.max(1, Math.min(15, sig))));
}

function trimZeros(str) {
  if (!str.includes('.')) return str;
  return str.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Formatiert eine Zahl mit `sig` signifikanten Stellen.
 * Optionen:
 *  - trim (Standard true): Nullen am Ende des Nachkommateils weglassen
 *  - sciMin/sciMax: Bereich, außerhalb dessen ·10ⁿ-Schreibweise verwendet wird
 *  - ascii: "e"-Schreibweise statt ·10ⁿ (für reine Textausgabe)
 *  - decimal: Dezimaltrennzeichen (Standard ",")
 */
export function formatNumber(x, sig = 4, opts = {}) {
  const { trim = true, sciMin = 1e-3, sciMax = 1e6, ascii = false, decimal = ',' } = opts;
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '-∞';
  if (x === 0) return '0';
  const r = roundSig(x, sig);
  const abs = Math.abs(r);
  const neg = r < 0 ? '-' : '';
  let out;
  if (abs >= sciMin && abs < sciMax) {
    const exp = Math.floor(Math.log10(abs));
    const decimals = Math.max(0, sig - 1 - exp);
    out = abs.toFixed(decimals);
    if (trim) out = trimZeros(out);
  } else {
    let exp = Math.floor(Math.log10(abs));
    let mant = abs / Math.pow(10, exp);
    mant = Number(mant.toPrecision(sig));
    if (mant >= 10) { mant /= 10; exp += 1; }
    let ms = mant.toFixed(Math.max(0, sig - 1));
    if (trim) ms = trimZeros(ms);
    ms = ms.replace('.', decimal);
    if (ascii) return `${neg}${ms}e${exp}`;
    return `${neg}${ms}·10${toSuperscript(String(exp))}`;
  }
  return neg + out.replace('.', decimal);
}

/** Zahl + Einheit, z. B. "0,1 mol/L". */
export function formatQuantity(value, unit, sig = 4, opts = {}) {
  const n = formatNumber(value, sig, opts);
  return unit ? `${n} ${unit}` : n;
}

/** Prozentwert (0..1 -> "37 %"). */
export function formatPercent(fraction, sig = 3) {
  return `${formatNumber(fraction * 100, sig)} %`;
}
