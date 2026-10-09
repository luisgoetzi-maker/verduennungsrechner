// Stoffdatenbank: Startliste + eigene Stoffe, Suche, Validierung,
// Export/Import.
//
// Eigene Daten werden getrennt von der Startliste gespeichert:
//   substances.user       eigene Stoffe
//   substances.overrides  bearbeitete Einträge der Startliste (vollständiger Eintrag)
//   substances.hidden     gelöschte Einträge der Startliste (IDs)
// So kann die Startliste mit App-Updates verbessert werden, ohne eigene
// Änderungen zu überschreiben.

(function () {
  'use strict';
  const { SEED_SUBSTANCES } = VR.use('core/substances-seed.js');
  const { tryParseFormula } = VR.use('core/formula.js');

const KEY_USER = 'substances.user';
const KEY_OVERRIDES = 'substances.overrides';
const KEY_HIDDEN = 'substances.hidden';

const CATEGORIES = [
  'Säure', 'Base', 'Salz', 'Puffer', 'Urtiter', 'Lösungsmittel', 'Komplexbildner', 'Indikator',
  'Oxidationsmittel', 'Reduktionsmittel', 'PFAS', 'Isotopenstandard', 'Sonstige',
];

// Gespeicherte Felder eines Stoffeintrags
const FIELDS = [
  'id', 'name', 'aliases', 'formula', 'cas', 'cat', 'state', 'density', 'purity', 'z',
  'notes', 'molarMass', 'opened', 'expires',
];

/** Prüft eine CAS-Nummer (Format und Prüfziffer). */
function validateCAS(cas) {
  const s = String(cas ?? '').trim();
  if (!s) return { valid: true, empty: true };
  const m = s.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!m) return { valid: false, error: 'CAS-Format: 2–7 Ziffern-2 Ziffern-Prüfziffer (z. B. 7732-18-5).' };
  const digits = (m[1] + m[2]).split('').reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  if (sum % 10 !== Number(m[3])) {
    return { valid: false, error: `CAS-Prüfziffer stimmt nicht (berechnet: ${sum % 10}).` };
  }
  return { valid: true };
}

/** Vereinheitlicht Text für die Suche (Umlaute, Groß/Klein, Sonderzeichen). */
function normalizeSearch(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function stripOxidationStates(s) {
  return String(s ?? '').replace(/\((?:I|II|III|IV|V|VI|VII|VIII)\)/g, '');
}

function normalizeFormulaText(f) {
  return String(f ?? '').replace(/\s+/g, '').replace(/[·•∙⋅.*]/g, '·');
}

function words(s) {
  return String(s ?? '').split(/[\s\-,/()]+/).map(normalizeSearch).filter(Boolean);
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Bereinigt einen Eintrag (nur bekannte Felder, Typen). */
function cleanEntry(data) {
  const e = {};
  e.id = data.id ? String(data.id) : undefined;
  e.name = String(data.name ?? '').trim();
  let aliases = data.aliases ?? [];
  if (typeof aliases === 'string') aliases = aliases.split(/[;,\n]/);
  e.aliases = [...new Set(aliases.map((a) => String(a).trim()).filter(Boolean))];
  e.formula = String(data.formula ?? '').trim();
  e.cas = String(data.cas ?? '').trim();
  e.cat = data.cat ? String(data.cat) : 'Sonstige';
  e.state = data.state === 'l' || data.state === 's' || data.state === 'g' ? data.state : (num(data.density) ? 'l' : 's');
  for (const k of ['density', 'purity', 'z', 'molarMass']) {
    const v = num(data[k]);
    if (v !== null) e[k] = v;
  }
  e.notes = String(data.notes ?? '').trim();
  for (const k of ['opened', 'expires']) {
    if (data[k] && /^\d{4}-\d{2}-\d{2}$/.test(String(data[k]))) e[k] = String(data[k]);
  }
  if (!e.id) delete e.id;
  return e;
}

/**
 * Prüft einen Eintrag.
 * @returns {{errors: string[], warnings: string[]}}
 */
function validateSubstance(entry) {
  const errors = [];
  const warnings = [];
  if (!entry.name || !String(entry.name).trim()) errors.push('Name fehlt.');
  const hasFormula = entry.formula && String(entry.formula).trim();
  if (hasFormula) {
    const r = tryParseFormula(entry.formula);
    if (!r.ok) errors.push(`Formel: ${r.error}`);
    else {
      r.warnings.forEach((w) => warnings.push(`Formel: ${w}`));
      if (entry.molarMass) {
        const diff = Math.abs(entry.molarMass - r.molarMass) / r.molarMass;
        if (diff > 0.001) warnings.push(`Eigene Molare Masse (${entry.molarMass} g/mol) weicht von der Formel (${r.molarMass.toFixed(3)} g/mol) um ${(diff * 100).toFixed(2)} % ab.`);
      }
    }
  } else if (!entry.molarMass) {
    warnings.push('Weder Formel noch Molare Masse angegeben – Umrechnungen über die Stoffmenge sind nicht möglich.');
  }
  if (entry.molarMass !== undefined && !(entry.molarMass > 0)) errors.push('Molare Masse muss größer als 0 sein.');
  const cas = validateCAS(entry.cas);
  if (!cas.valid) errors.push(cas.error);
  if (entry.density !== undefined && !(entry.density > 0.3 && entry.density < 25)) errors.push('Dichte unplausibel (erwartet 0,3–25 g/mL).');
  if (entry.purity !== undefined && !(entry.purity > 0 && entry.purity <= 100)) errors.push('Reinheit/Gehalt muss zwischen 0 und 100 % liegen.');
  if (entry.z !== undefined && !(entry.z > 0 && entry.z <= 10)) errors.push('Wertigkeit z unplausibel (erwartet 1–10).');
  if (entry.state === 'l' && entry.density === undefined) warnings.push('Flüssigkeit ohne Dichte – Volumenberechnung nicht möglich.');
  if (entry.purity !== undefined && entry.purity < 100 && entry.state === 'l' && entry.density === undefined) {
    warnings.push('Lösung mit Gehalt, aber ohne Dichte.');
  }
  return { errors, warnings };
}

/** Ergänzt berechnete Felder (Molare Masse, Anzeigeformel, Hydratwasser). */
function enrich(entry, source = 'user', modified = false) {
  const out = { ...entry, source, modified };
  out.mwCalc = null;
  out.formulaError = null;
  if (entry.formula) {
    const r = tryParseFormula(entry.formula);
    if (r.ok) {
      out.mwCalc = r.molarMass;
      out.pretty = r.pretty;
      out.hill = r.hill;
      out.waterCount = r.waterCount;
      out.anhydrousMass = r.anhydrousMass;
      out.counts = r.counts;
      out.charge = r.charge;
    } else {
      out.formulaError = r.error;
    }
  }
  if (entry.molarMass > 0) {
    out.mw = entry.molarMass;
    out.mwSource = 'manual';
  } else if (out.mwCalc) {
    out.mw = out.mwCalc;
    out.mwSource = 'formula';
  } else {
    out.mw = null;
    out.mwSource = null;
  }
  return out;
}

function newId() {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sameContent(a, b) {
  const ca = cleanEntry(a);
  const cb = cleanEntry(b);
  return JSON.stringify(FIELDS.map((k) => ca[k] ?? null)) === JSON.stringify(FIELDS.map((k) => cb[k] ?? null));
}

class SubstanceDB {
  constructor(storage, seed = SEED_SUBSTANCES) {
    this.storage = storage;
    this.seed = seed;
    this.seedById = new Map(seed.map((s) => [s.id, s]));
    this._cache = null;
  }

  _user() { return this.storage.get(KEY_USER) || []; }
  _overrides() { return this.storage.get(KEY_OVERRIDES) || {}; }
  _hidden() { return this.storage.get(KEY_HIDDEN) || []; }
  _invalidate() { this._cache = null; }

  /** Alle sichtbaren Stoffe (angereichert), alphabetisch. */
  list() {
    if (this._cache) return this._cache;
    const overrides = this._overrides();
    const hidden = new Set(this._hidden());
    const out = [];
    for (const s of this.seed) {
      if (hidden.has(s.id)) continue;
      if (overrides[s.id]) out.push(enrich({ ...overrides[s.id], id: s.id }, 'seed', true));
      else out.push(enrich(s, 'seed', false));
    }
    for (const u of this._user()) out.push(enrich(u, 'user', false));
    out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const e of out) {
      e._keys = {
        name: normalizeSearch(e.name),
        nameNoOx: normalizeSearch(stripOxidationStates(e.name)),
        aliases: (e.aliases || []).map(normalizeSearch),
        words: [...words(e.name), ...words(stripOxidationStates(e.name))],
        formula: normalizeFormulaText(e.formula),
        all: normalizeSearch([e.name, stripOxidationStates(e.name), ...(e.aliases || []), e.formula, e.cas, e.cat].join(' ')),
      };
    }
    this._cache = out;
    return out;
  }

  get(id) {
    return this.list().find((e) => e.id === id) || null;
  }

  isSeed(id) {
    return this.seedById.has(id);
  }

  /**
   * Sucht nach Name, Alias, Formel oder CAS-Nummer.
   * Mehrdeutige Namen (z. B. "EDTA") liefern alle passenden Varianten.
   * @returns {Array<{entry, score, match}>}
   */
  search(query, { limit = 30, category = null } = {}) {
    const q = String(query ?? '').trim();
    let list = this.list();
    if (category) list = list.filter((e) => e.cat === category);
    if (!q) return list.slice(0, limit).map((entry) => ({ entry, score: 0, match: '' }));
    const nq = normalizeSearch(q);
    const fq = normalizeFormulaText(q);
    const tokens = q.split(/\s+/).map(normalizeSearch).filter(Boolean);
    let hill = null;
    if (/[A-Z]/.test(q) && !/\s/.test(q)) {
      const r = tryParseFormula(q);
      if (r.ok) hill = r.hill;
    }
    const results = [];
    for (const e of list) {
      const k = e._keys;
      let score = 0;
      let match = '';
      const hit = (s, m) => { if (s > score) { score = s; match = m; } };
      if (nq) {
        if (k.name === nq || k.nameNoOx === nq) hit(100, 'Name');
        // Erster Alias = gebräuchliche Abkürzung (z. B. PFOA bei der freien Säure) zuerst
        if (k.aliases[0] === nq) hit(97, 'Alias');
        else if (k.aliases.includes(nq)) hit(95, 'Alias');
        if (k.name.startsWith(nq) || k.nameNoOx.startsWith(nq)) hit(70, 'Name');
        if (k.aliases.some((a) => a.startsWith(nq))) hit(65, 'Alias');
        if (k.words.some((w) => w.startsWith(nq))) hit(55, 'Name');
        if (k.name.includes(nq) || k.nameNoOx.includes(nq)) hit(45, 'Name');
        if (k.aliases.some((a) => a.includes(nq))) hit(40, 'Alias');
      }
      if (e.cas && e.cas === q) hit(95, 'CAS');
      if (e.formula && k.formula === fq) hit(92, 'Formel');
      if (hill && e.hill === hill) hit(80, 'Summenformel');
      if (!score && tokens.length > 1 && tokens.every((t) => k.all.includes(t))) hit(30, 'Text');
      if (score) results.push({ entry: e, score, match });
    }
    results.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'de'));
    return results.slice(0, limit);
  }

  /** Legt einen eigenen Stoff an. Wirft bei Validierungsfehlern. */
  add(data) {
    const entry = cleanEntry(data);
    const { errors } = validateSubstance(entry);
    if (errors.length) throw new Error(errors.join(' '));
    entry.id = entry.id && !this.seedById.has(entry.id) && !this._user().some((u) => u.id === entry.id) ? entry.id : newId();
    const user = this._user();
    user.push(entry);
    this.storage.set(KEY_USER, user);
    this._invalidate();
    return this.get(entry.id);
  }

  /** Ändert einen Stoff (eigener Stoff oder Eintrag der Startliste). */
  update(id, data) {
    const entry = cleanEntry({ ...data, id });
    const { errors } = validateSubstance(entry);
    if (errors.length) throw new Error(errors.join(' '));
    if (this.seedById.has(id)) {
      const overrides = this._overrides();
      if (sameContent(entry, this.seedById.get(id))) delete overrides[id];
      else overrides[id] = entry;
      this.storage.set(KEY_OVERRIDES, overrides);
    } else {
      const user = this._user();
      const i = user.findIndex((u) => u.id === id);
      if (i < 0) throw new Error('Stoff nicht gefunden.');
      user[i] = entry;
      this.storage.set(KEY_USER, user);
    }
    this._invalidate();
    return this.get(id);
  }

  /** Löscht einen Stoff (Einträge der Startliste werden ausgeblendet). */
  remove(id) {
    if (this.seedById.has(id)) {
      const hidden = new Set(this._hidden());
      hidden.add(id);
      this.storage.set(KEY_HIDDEN, [...hidden]);
      const overrides = this._overrides();
      if (overrides[id]) {
        delete overrides[id];
        this.storage.set(KEY_OVERRIDES, overrides);
      }
    } else {
      this.storage.set(KEY_USER, this._user().filter((u) => u.id !== id));
    }
    this._invalidate();
  }

  /** Setzt einen Eintrag der Startliste auf den Originalzustand zurück. */
  restoreSeed(id) {
    if (!this.seedById.has(id)) return;
    const overrides = this._overrides();
    delete overrides[id];
    this.storage.set(KEY_OVERRIDES, overrides);
    this.storage.set(KEY_HIDDEN, this._hidden().filter((h) => h !== id));
    this._invalidate();
  }

  /** Stellt alle gelöschten Einträge der Startliste wieder her. */
  restoreAllHidden() {
    this.storage.set(KEY_HIDDEN, []);
    this._invalidate();
  }

  hiddenCount() {
    return this._hidden().length;
  }

  /** Daten für das Backup (alle sichtbaren Stoffe + ausgeblendete IDs). */
  exportData() {
    return {
      entries: this.list().map((e) => ({ ...cleanEntry(e), source: e.source })),
      hidden: this._hidden(),
    };
  }

  /**
   * Importiert Stoffe aus einem Backup.
   * mode 'merge': vorhandene eigene Stoffe bleiben erhalten, gleiche IDs werden überschrieben.
   * mode 'replace': eigene Stoffe, Änderungen und Ausblendungen werden ersetzt.
   */
  importData(data, mode = 'merge') {
    if (!data || !Array.isArray(data.entries)) throw new Error('Ungültige Datei: Stoffliste fehlt.');
    const report = { added: 0, updated: 0, unchanged: 0, errors: [] };
    const user = mode === 'replace' ? [] : this._user();
    const overrides = mode === 'replace' ? {} : this._overrides();
    const hidden = new Set(mode === 'replace' ? [] : this._hidden());
    for (const raw of data.entries) {
      const entry = cleanEntry(raw);
      const { errors } = validateSubstance(entry);
      if (errors.length) {
        report.errors.push(`${entry.name || '(ohne Namen)'}: ${errors.join(' ')}`);
        continue;
      }
      if (entry.id && this.seedById.has(entry.id)) {
        if (sameContent(entry, this.seedById.get(entry.id))) {
          if (overrides[entry.id]) { delete overrides[entry.id]; report.updated++; } else report.unchanged++;
        } else {
          overrides[entry.id] = entry;
          report.updated++;
        }
        continue;
      }
      if (!entry.id) entry.id = newId();
      const i = user.findIndex((u) => u.id === entry.id);
      if (i >= 0) { user[i] = entry; report.updated++; } else { user.push(entry); report.added++; }
    }
    if (Array.isArray(data.hidden)) data.hidden.filter((id) => this.seedById.has(id)).forEach((id) => hidden.add(id));
    this.storage.set(KEY_USER, user);
    this.storage.set(KEY_OVERRIDES, overrides);
    this.storage.set(KEY_HIDDEN, [...hidden]);
    this._invalidate();
    return report;
  }

  /** Löscht alle eigenen Stoffe und Änderungen (Startliste wieder original). */
  resetAll() {
    this.storage.remove(KEY_USER);
    this.storage.remove(KEY_OVERRIDES);
    this.storage.remove(KEY_HIDDEN);
    this._invalidate();
  }
}

  VR.provide('core/substance-db.js', { CATEGORIES, FIELDS, validateCAS, normalizeSearch, cleanEntry, validateSubstance, enrich, SubstanceDB });
}());
