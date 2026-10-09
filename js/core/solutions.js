// Lösungsverwaltung: hergestellte Lösungen mit Ablaufdatum (Ampel).

(function () {
  'use strict';
  const { expiryStatus } = VR.use('core/expiry.js');
  const { normalizeSearch } = VR.use('core/substance-db.js');

const KEY = 'solutions';

function newId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanSolution(d) {
  const s = {
    id: d.id ? String(d.id) : undefined,
    name: String(d.name ?? '').trim(),
    conc: String(d.conc ?? '').trim(),
    substance: String(d.substance ?? '').trim(),
    solvent: String(d.solvent ?? '').trim(),
    made: DATE.test(String(d.made ?? '')) ? String(d.made) : '',
    expires: DATE.test(String(d.expires ?? '')) ? String(d.expires) : '',
    by: String(d.by ?? '').trim(),
    location: String(d.location ?? '').trim(),
    notes: String(d.notes ?? '').trim(),
    calc: String(d.calc ?? ''),
    created: d.created || Date.now(),
  };
  if (!s.id) delete s.id;
  return s;
}

function validateSolution(s) {
  const errors = [];
  if (!s.name) errors.push('Name fehlt.');
  if (s.made && s.expires && s.expires < s.made) errors.push('Das Ablaufdatum liegt vor dem Herstelldatum.');
  return errors;
}

class SolutionStore {
  constructor(storage) {
    this.storage = storage;
  }

  _all() { return this.storage.get(KEY) || []; }
  _save(list) { this.storage.set(KEY, list); }

  /**
   * @param {{query?:string, filter?:'all'|'expired'|'soon'|'ok', warnDays?:number, today?:Date}} opts
   * Sortierung: abgelaufen, bald ablaufend, gültig, ohne Datum; innerhalb nach Ablaufdatum.
   */
  list({ query = '', filter = 'all', warnDays = 14, today = new Date() } = {}) {
    const q = normalizeSearch(query);
    return this._all()
      .map((s) => ({ ...s, status: expiryStatus(s.expires, warnDays, today) }))
      .filter((s) => !q || normalizeSearch([s.name, s.conc, s.substance, s.solvent, s.notes, s.location, s.by].join(' ')).includes(q))
      .filter((s) => filter === 'all'
        || (filter === 'expired' && s.status.color === 'red')
        || (filter === 'soon' && s.status.color === 'yellow')
        || (filter === 'ok' && (s.status.color === 'green' || s.status.color === 'grey')))
      .sort((a, b) => a.status.rank - b.status.rank || (a.expires || '9999').localeCompare(b.expires || '9999') || a.name.localeCompare(b.name, 'de'));
  }

  counts({ warnDays = 14, today = new Date() } = {}) {
    const c = { red: 0, yellow: 0, green: 0, grey: 0 };
    for (const s of this._all()) c[expiryStatus(s.expires, warnDays, today).color]++;
    return c;
  }

  get(id) {
    return this._all().find((s) => s.id === id) || null;
  }

  add(data) {
    const s = cleanSolution(data);
    const errors = validateSolution(s);
    if (errors.length) throw new Error(errors.join(' '));
    s.id = newId();
    this._save([...this._all(), s]);
    return s;
  }

  update(id, data) {
    const list = this._all();
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) throw new Error('Lösung nicht gefunden.');
    const s = cleanSolution({ ...list[i], ...data, id, created: list[i].created });
    const errors = validateSolution(s);
    if (errors.length) throw new Error(errors.join(' '));
    list[i] = s;
    this._save(list);
    return s;
  }

  remove(id) {
    this._save(this._all().filter((s) => s.id !== id));
  }

  exportData() {
    return { items: this._all() };
  }

  importData(data, mode = 'merge') {
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('Ungültige Datei: Lösungsliste fehlt.');
    const list = mode === 'replace' ? [] : this._all();
    const report = { added: 0, updated: 0, errors: [] };
    for (const raw of items) {
      const s = cleanSolution(raw);
      const err = validateSolution(s);
      if (err.length) { report.errors.push(`${s.name || '(ohne Namen)'}: ${err.join(' ')}`); continue; }
      if (!s.id) s.id = newId();
      const i = list.findIndex((x) => x.id === s.id);
      if (i >= 0) { list[i] = s; report.updated++; } else { list.push(s); report.added++; }
    }
    this._save(list);
    return report;
  }
}

  VR.provide('core/solutions.js', { cleanSolution, validateSolution, SolutionStore });
}());
