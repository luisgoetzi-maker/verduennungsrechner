// Formel-Parser: liest Summenformeln und berechnet die Molare Masse.
//
// Unterstützt:
//  - Groß-/Kleinschreibung (Co = Cobalt, CO = Kohlenmonoxid)
//  - verschachtelte Klammern ( ), [ ], { } mit Indizes: Ca(OH)2, K4[Fe(CN)6]
//  - Hydrate/Addukte mit ·, •, ., * als Trennzeichen: CuSO4·5H2O, CaSO4·0.5H2O,
//    CaSO4·½H2O, Tris·HCl
//  - tiefgestellte Ziffern (H₂O)
//  - Isotope: [13C], ^13C, ¹³C sowie D (Deuterium) und T (Tritium)
//  - Ladungen am Ende: SO4^2-, SO4(2-), SO4 2-, SO4-2, SO₄²⁻, NH4+, Fe3+ (als Fe³⁺)
//
// Die Masse der Elektronen wird bei Ionen nicht berücksichtigt
// (< 0,0006 g/mol pro Ladung, wie in üblichen Tabellen und PubChem).

(function () {
  'use strict';
  const { ELEMENTS, ISOTOPES, ISOTOPE_ALIASES, isElementSymbol } = VR.use('core/elements.js');
  const { fromSuperscript, toSuperscript } = VR.use('core/numbers.js');

class FormulaError extends Error {
  constructor(message, pos = null, input = '') {
    super(message);
    this.name = 'FormulaError';
    this.pos = pos;
    this.input = input;
  }
}

const SUBSCRIPTS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUB_DIGITS = Object.fromEntries(Object.entries(SUBSCRIPTS).map(([k, v]) => [v, k]));
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const SEPARATORS = new Set(['·', '•', '∙', '⋅', '.', '*']);
const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

const WATER_MASS = 2 * ELEMENTS.H.mass + ELEMENTS.O.mass;

function signValue(signs) {
  const ch = signs[0];
  if (![...signs].every((c) => c === ch)) throw new FormulaError(`Ungültige Ladungsangabe „${signs}“.`);
  return ch === '+' ? signs.length : -signs.length;
}

/**
 * Trennt eine Ladungsangabe vom Ende der Formel ab.
 * Liefert { body, charge, note } – note erklärt eine heuristische Deutung.
 */
function splitCharge(str) {
  let s = str.replace(/[−–]/g, '-');
  let m;

  // ^2-, ^{2-}, ^-, ^+3, ^{-2}
  m = s.match(/\^\{?\s*(\d*)\s*([+-]+)\s*\}?$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(m[2]) * (m[1] ? Number(m[1]) : 1) };
  m = s.match(/\^\{?\s*([+-])\s*(\d+)\s*\}?$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(m[1]) * Number(m[2]) };

  // Hochgestellt: ²⁻, ⁺, ³⁺, ⁻²
  m = s.match(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻]+)$/);
  if (m) {
    const digits = fromSuperscript(m[1]);
    return { body: s.slice(0, m.index), charge: signValue(fromSuperscript(m[2])) * (digits ? Number(digits) : 1) };
  }
  m = s.match(/([⁺⁻])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(fromSuperscript(m[1])) * Number(fromSuperscript(m[2])) };

  // In Klammern: (2-), (+), (-2)
  m = s.match(/\(\s*(\d*)\s*([+-]+)\s*\)$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(m[2]) * (m[1] ? Number(m[1]) : 1) };
  m = s.match(/\(\s*([+-])\s*(\d+)\s*\)$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(m[1]) * Number(m[2]) };

  // Mit Leerzeichen abgesetzt: "SO4 2-", "NH4 +"
  m = s.match(/\s+(\d*)([+-]+)$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(m[2]) * (m[1] ? Number(m[1]) : 1) };

  // Vorzeichen gefolgt von Zahl am Ende: "SO4-2", "Fe+3"
  m = s.match(/([+-])(\d+)$/);
  if (m) return { body: s.slice(0, m.index), charge: signValue(m[1]) * Number(m[2]) };

  // Nur Vorzeichen am Ende: NH4+, SO42-, Fe3+, [Fe(CN)6]4-
  m = s.match(/([+-]+)$/);
  if (m) {
    const count = signValue(m[1]);
    let body = s.slice(0, m.index);
    const dm = body.match(/(\d+)$/);
    if (!dm || Math.abs(count) > 1) return { body, charge: count };
    const digits = dm[1];
    const before = body.slice(0, dm.index);
    const sign = count > 0 ? '+' : '-';
    // Einatomiges Ion: Fe3+ -> Fe³⁺
    if (/^[A-Z][a-z]?$/.test(before) && isElementSymbol(before)) {
      return {
        body: before,
        charge: Math.sign(count) * Number(digits),
        note: `Ladung als ${digits}${sign} gelesen (eindeutig: ${before}^${digits}${sign}).`,
      };
    }
    // Nach einer Klammer: [Fe(CN)6]4- -> Ladung 4-
    if (/[)\]}]$/.test(before) && digits.length === 1) {
      return {
        body: before,
        charge: Math.sign(count) * Number(digits),
        note: `Ladung als ${digits}${sign} gelesen (eindeutig: ${before}^${digits}${sign}).`,
      };
    }
    // Mehrstellige Zahl: letzte Ziffer = Ladung (SO42- -> SO4 mit 2-)
    if (digits.length >= 2) {
      const idx = digits.slice(0, -1);
      const ch = digits.slice(-1);
      return {
        body: before + idx,
        charge: Math.sign(count) * Number(ch),
        note: `Ladung als ${ch}${sign} gelesen, Index ${idx} (eindeutig: ${before}${idx}^${ch}${sign}).`,
      };
    }
    // Einstellig: Index, Ladung ±1 (NH4+ -> NH4⁺)
    return { body, charge: count };
  }
  return { body: s, charge: 0 };
}

class Parser {
  constructor(src) {
    this.s = src;
    this.pos = 0;
    this.warnings = new Set();
  }

  peek() { return this.s[this.pos]; }

  error(msg, pos = this.pos) {
    throw new FormulaError(msg, pos, this.s);
  }

  parse() {
    const segments = [];
    if (this.s.length === 0) this.error('Bitte eine Summenformel eingeben.', 0);
    for (;;) {
      const segStart = this.pos;
      const coef = this.parseCoefficient();
      const counts = this.parseGroup(null);
      if (Object.keys(counts).length === 0) {
        this.error(coef !== 1 ? 'Nach dem Faktor fehlt ein Formelteil.' : 'Leerer Formelteil.', segStart);
      }
      segments.push({ coef, counts, text: this.s.slice(segStart, this.pos) });
      if (this.pos >= this.s.length) break;
      if (SEPARATORS.has(this.peek())) {
        this.pos++;
        if (this.pos >= this.s.length) this.error('Nach dem Trennzeichen fehlt ein Formelteil.');
        continue;
      }
      this.error(`Unerwartetes Zeichen „${this.peek()}“.`);
    }
    return segments;
  }

  // Faktor am Anfang eines Formelteils: 5, 0.5, 0,5, 1/2, ½
  parseCoefficient() {
    const ch = this.peek();
    if (ch in FRACTIONS) {
      this.pos++;
      return FRACTIONS[ch];
    }
    const m = this.s.slice(this.pos).match(/^(\d+)(?:([.,])(\d+)|\/(\d+))?/);
    if (!m) return 1;
    // Ein Punkt gehört nur zum Faktor, wenn Ziffern folgen (CaSO4.0.5H2O);
    // sonst ist er ein Hydrat-Trennzeichen.
    this.pos += m[0].length;
    let value;
    if (m[3] !== undefined) value = Number(`${m[1]}.${m[3]}`);
    else if (m[4] !== undefined) {
      if (Number(m[4]) === 0) this.error('Division durch null im Faktor.');
      value = Number(m[1]) / Number(m[4]);
    } else value = Number(m[1]);
    if (!(value > 0)) this.error('Der Faktor muss größer als 0 sein.');
    if (this.peek() in FRACTIONS) {
      value += FRACTIONS[this.peek()];
      this.pos++;
    }
    return value;
  }

  parseIndex() {
    const m = this.s.slice(this.pos).match(/^\d+/);
    if (!m) return 1;
    const n = Number(m[0]);
    if (n === 0) this.error('Index 0 ist nicht erlaubt.');
    this.pos += m[0].length;
    return n;
  }

  parseGroup(closing) {
    const counts = {};
    const add = (key, n) => { counts[key] = (counts[key] || 0) + n; };
    while (this.pos < this.s.length) {
      const ch = this.peek();
      if (SEPARATORS.has(ch)) {
        if (closing) this.error(`Trennzeichen „${ch}“ innerhalb einer Klammer ist nicht erlaubt.`);
        return counts;
      }
      if (CLOSE.has(ch)) {
        if (!closing) this.error(`Klammer „${ch}“ ohne öffnende Klammer.`);
        if (ch !== closing) this.error(`Klammer „${ch}“ passt nicht – erwartet „${closing}“.`);
        return counts;
      }
      if (ch === '[') {
        // Isotopenmarkierung [13C]
        const iso = this.s.slice(this.pos).match(/^\[(\d+)([A-Z][a-z]?)\]/);
        if (iso) {
          const start = this.pos;
          this.pos += iso[0].length;
          const key = this.isotopeKey(iso[1], iso[2], start);
          add(key, this.parseIndex());
          continue;
        }
      }
      if (ch in OPEN) {
        const start = this.pos;
        this.pos++;
        const inner = this.parseGroup(OPEN[ch]);
        if (this.pos >= this.s.length) this.error(`Klammer „${ch}“ wird nicht geschlossen.`, start);
        this.pos++; // schließende Klammer
        if (Object.keys(inner).length === 0) this.error('Leere Klammer.', start);
        const n = this.parseIndex();
        for (const [k, v] of Object.entries(inner)) add(k, v * n);
        continue;
      }
      if (/[A-Z]/.test(ch)) {
        const start = this.pos;
        const m = this.s.slice(this.pos).match(/^[A-Z][a-z]*/);
        const sym = m[0];
        this.pos += sym.length;
        let key;
        if (isElementSymbol(sym)) {
          key = sym;
          if (ELEMENTS[sym].noStd) this.warnings.add(`${sym} hat kein Standardatomgewicht; verwendet wird die Massenzahl ${ELEMENTS[sym].mass} des langlebigsten Isotops.`);
        } else if (ISOTOPE_ALIASES[sym]) {
          key = ISOTOPE_ALIASES[sym];
        } else {
          let hint = '';
          if (sym.length > 2 && isElementSymbol(sym.slice(0, 2))) hint = ` Meinten Sie „${sym.slice(0, 2)}“ gefolgt von weiteren Elementen? Jedes Elementsymbol beginnt mit einem Großbuchstaben.`;
          else if (sym.length > 1 && isElementSymbol(sym[0])) hint = ` Für mehrere Elemente Großbuchstaben verwenden (z. B. „${sym[0]}${sym.slice(1).toUpperCase()}“).`;
          this.error(`Unbekanntes Elementsymbol „${sym}“.${hint}`, start);
        }
        add(key, this.parseIndex());
        continue;
      }
      if (ch === '^') {
        const iso = this.s.slice(this.pos).match(/^\^(\d+)([A-Z][a-z]?)/);
        if (iso) {
          const start = this.pos;
          this.pos += iso[0].length;
          add(this.isotopeKey(iso[1], iso[2], start), this.parseIndex());
          continue;
        }
        this.error('„^“ wird nur für Isotope (^13C) oder Ladungen am Ende (^2-) verwendet.');
      }
      if (/[a-z]/.test(ch)) {
        this.error(`Elementsymbole beginnen mit einem Großbuchstaben („${ch}“ an Stelle ${this.pos + 1}). Beachte: Co = Cobalt, CO = Kohlenmonoxid.`);
      }
      if (/\d/.test(ch)) {
        this.error(`Unerwartete Zahl an Stelle ${this.pos + 1}. Faktoren sind nur am Anfang eines Formelteils erlaubt (z. B. CuSO4·5H2O).`);
      }
      if (ch === '+' || ch === '-') {
        this.error('Ladungen nur am Ende angeben, z. B. SO4^2- oder NH4+.');
      }
      this.error(`Unerwartetes Zeichen „${ch}“.`);
    }
    if (closing) this.error(`Klammer wird nicht geschlossen – erwartet „${closing}“.`);
    return counts;
  }

  isotopeKey(massNumber, sym, pos) {
    const resolved = ISOTOPE_ALIASES[sym] ? ISOTOPE_ALIASES[sym].replace(/^\d+/, '') : sym;
    if (!isElementSymbol(resolved)) this.error(`Unbekanntes Elementsymbol „${sym}“ in der Isotopenangabe.`, pos);
    const key = `${Number(massNumber)}${resolved}`;
    if (!(key in ISOTOPES)) {
      this.error(`Isotopenmasse für ${key} ist nicht hinterlegt. Bitte die Molare Masse manuell eingeben.`, pos);
    }
    return key;
  }
}

function atomMass(key) {
  if (key in ISOTOPES) return ISOTOPES[key];
  return ELEMENTS[key].mass;
}

function massOf(counts) {
  let m = 0;
  for (const [k, n] of Object.entries(counts)) m += atomMass(k) * n;
  return m;
}

function isWater(counts) {
  const keys = Object.keys(counts);
  return keys.length === 2 && counts.H === 2 && counts.O === 1;
}

function elementOfKey(key) {
  const m = key.match(/^(\d+)([A-Z][a-z]?)$/);
  return m ? m[2] : key;
}

function fmtCount(n) {
  if (n === 1) return '';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

/** Hill-Notation (C, H, dann alphabetisch; Isotope als [13C]n). */
function hillFormula(counts) {
  const keys = Object.keys(counts);
  const elements = [...new Set(keys.map(elementOfKey))];
  let order;
  if (elements.includes('C')) {
    order = ['C', ...(elements.includes('H') ? ['H'] : []), ...elements.filter((k) => k !== 'C' && k !== 'H').sort()];
  } else {
    order = [...elements].sort();
  }
  let out = '';
  for (const el of order) {
    // zuerst das Element mit natürlicher Isotopenverteilung, dann markierte Isotope
    if (counts[el]) out += el + fmtCount(counts[el]);
    keys.filter((k) => k !== el && elementOfKey(k) === el)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .forEach((k) => { out += `[${k}]${fmtCount(counts[k])}`; });
  }
  return out;
}

/** Zusammengefasste Anzahl je Element (Isotope werden ihrem Element zugeordnet). */
function elementCounts(counts) {
  const out = {};
  for (const [k, n] of Object.entries(counts)) {
    const el = elementOfKey(k);
    out[el] = (out[el] || 0) + n;
  }
  return out;
}

/** Ladung als hochgestellter Text, z. B. 2- -> "²⁻". */
function chargeText(charge) {
  if (!charge) return '';
  const abs = Math.abs(charge);
  return toSuperscript((abs === 1 ? '' : String(abs)) + (charge > 0 ? '+' : '-'));
}

/** Formel mit tiefgestellten Indizes für die Anzeige: "CuSO₄·5H₂O". */
function prettyFormula(body, charge = 0) {
  // Isotope [13C] -> ¹³C (hochgestellte Ziffern werden unten nicht tiefgestellt)
  const s = body.replace(/\[(\d+)([A-Z][a-z]?)\]/g, (_, a, el) => toSuperscript(a) + el);
  let out = '';
  let i = 0;
  let segStart = true;
  while (i < s.length) {
    if (segStart) {
      // Faktor am Anfang eines Formelteils bleibt normal: 5H₂O, 0,5H₂O
      const m = s.slice(i).match(/^\d+(?:[.,]\d+|\/\d+)?/);
      if (m) {
        out += m[0].replace('.', ',');
        i += m[0].length;
      }
      segStart = false;
      continue;
    }
    const ch = s[i];
    if (SEPARATORS.has(ch)) {
      out += '·';
      segStart = true;
    } else {
      out += /\d/.test(ch) ? SUB_DIGITS[ch] : ch;
    }
    i++;
  }
  return out + chargeText(charge);
}

function preprocess(input) {
  let s = String(input ?? '').trim();
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUBSCRIPTS[c]);
  // Hochgestellte Isotopenzahl vor Element: ¹³C -> [13C]
  s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([A-Z][a-z]?)/g, (_, d, el) => `[${fromSuperscript(d)}${el}]`);
  return s;
}

/**
 * Liest eine Summenformel.
 * @returns {{
 *   input: string, body: string, pretty: string, charge: number,
 *   counts: Object<string, number>, segments: Array<{coef:number, counts:Object, mass:number, text:string, water:boolean}>,
 *   molarMass: number, anhydrousMass: number, waterCount: number,
 *   hill: string, warnings: string[], notes: string[]
 * }}
 */
function parseFormula(input) {
  const raw = preprocess(input);
  if (!raw) throw new FormulaError('Bitte eine Summenformel eingeben.', 0, '');
  const { body: withSpaces, charge, note } = splitCharge(raw);
  let body = withSpaces.replace(/\s+/g, '');
  // ^13C innerhalb der Formel -> [13C]
  body = body.replace(/\^(\d+)([A-Z][a-z]?)/g, '[$1$2]');
  if (!body) throw new FormulaError('Bitte eine Summenformel eingeben.', 0, raw);

  const parser = new Parser(body);
  const segs = parser.parse();
  const counts = {};
  let waterCount = 0;
  const segments = segs.map((seg) => {
    const water = isWater(seg.counts);
    const mass = massOf(seg.counts) * seg.coef;
    for (const [k, n] of Object.entries(seg.counts)) counts[k] = (counts[k] || 0) + n * seg.coef;
    if (water && segs.length > 1) waterCount += seg.coef;
    return { coef: seg.coef, counts: seg.counts, mass, text: seg.text, water: water && segs.length > 1 };
  });
  const molarMass = massOf(counts);
  const notes = [];
  if (note) notes.push(note);
  if (segments[0].coef !== 1) {
    notes.push(`Die Zahl am Anfang wurde als Faktor gelesen (${segments[0].coef} × ${segments[0].text.replace(/^[\d.,/½¼¾⅓⅔]+/, '')}). Isotope bitte als [13C] oder ¹³C schreiben.`);
  }
  return {
    input: String(input),
    body,
    pretty: prettyFormula(body, charge),
    charge,
    counts,
    segments,
    molarMass,
    anhydrousMass: molarMass - waterCount * WATER_MASS,
    waterCount,
    hill: hillFormula(counts) + (charge ? (charge > 0 ? '+' : '-') + (Math.abs(charge) > 1 ? Math.abs(charge) : '') : ''),
    warnings: [...parser.warnings],
    notes,
  };
}

/** Molare Masse in g/mol (wirft FormulaError bei ungültiger Formel). */
function molarMass(formula) {
  return parseFormula(formula).molarMass;
}

/** Wie parseFormula, liefert aber { ok:false, error } statt einer Ausnahme. */
function tryParseFormula(input) {
  try {
    return { ok: true, ...parseFormula(input) };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message, pos: e.pos };
    throw e;
  }
}

/** Masse eines Elements (bzw. Isotops) in g/mol. */
function atomicMass(symbol) {
  if (symbol in ISOTOPES) return ISOTOPES[symbol];
  if (ISOTOPE_ALIASES[symbol]) return ISOTOPES[ISOTOPE_ALIASES[symbol]];
  if (!isElementSymbol(symbol)) throw new FormulaError(`Unbekanntes Elementsymbol „${symbol}“.`);
  return ELEMENTS[symbol].mass;
}

const WATER_MOLAR_MASS = WATER_MASS;

  VR.provide('core/formula.js', { FormulaError, hillFormula, elementCounts, chargeText, prettyFormula, parseFormula, molarMass, tryParseFormula, atomicMass, WATER_MOLAR_MASS });
}());
