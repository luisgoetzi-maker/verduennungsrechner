// Verlauf der letzten Berechnungen.

(function () {
  'use strict';

const KEY = 'history';

function newId() {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Eintrag: {id, ts, mode, title, summary, result, state, text, session}
 *   state  Formularzustand (zum Wiederherstellen)
 *   text   Rechenweg als Text (für Export)
 */
class HistoryStore {
  constructor(storage, max = 50) {
    this.storage = storage;
    this.max = max;
  }

  list() {
    return (this.storage.get(KEY) || []).slice().sort((a, b) => b.ts - a.ts);
  }

  get(id) {
    return this.list().find((e) => e.id === id) || null;
  }

  /**
   * Speichert eine Berechnung. Gleiche Eingaben wie der letzte Eintrag
   * desselben Modus werden nicht doppelt gespeichert; Einträge derselben
   * Bearbeitungssitzung (session) innerhalb von 5 Minuten werden ersetzt.
   * @returns {object|null} gespeicherter Eintrag oder null (Duplikat)
   */
  add(entry, now = Date.now()) {
    const list = this.list();
    const stateKey = JSON.stringify(entry.state ?? null);
    const lastSame = list.find((e) => e.mode === entry.mode);
    if (lastSame && JSON.stringify(lastSame.state ?? null) === stateKey) return null;
    const e = { ...entry, id: newId(), ts: now };
    let next = list;
    if (lastSame && entry.session && lastSame.session === entry.session && now - lastSame.ts < 5 * 60 * 1000 && list[0].id === lastSame.id) {
      next = list.filter((x) => x.id !== lastSame.id);
    }
    next = [e, ...next].slice(0, this.max);
    this.storage.set(KEY, next);
    return e;
  }

  remove(id) {
    this.storage.set(KEY, this.list().filter((e) => e.id !== id));
  }

  clear() {
    this.storage.set(KEY, []);
  }

  exportData() {
    return { items: this.list() };
  }

  importData(data, mode = 'merge') {
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('Ungültige Datei: Verlauf fehlt.');
    const base = mode === 'replace' ? [] : this.list();
    const ids = new Set(base.map((e) => e.id));
    const merged = [...base, ...items.filter((e) => e && e.id && !ids.has(e.id) && e.mode)];
    merged.sort((a, b) => b.ts - a.ts);
    this.storage.set(KEY, merged.slice(0, Math.max(this.max, items.length)));
    return { added: merged.length - base.length };
  }
}

  VR.provide('core/history.js', { HistoryStore });
}());
