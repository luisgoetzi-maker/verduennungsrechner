// Speicher-Adapter. Der Rechenkern greift nie direkt auf localStorage zu,
// damit er in Tests (Node) mit einem Speicher im Arbeitsspeicher läuft.
//
// Schnittstelle: get(key) -> Wert|null, set(key, value), remove(key), keys()

(function () {
  'use strict';

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get(key) {
      return data.has(key) ? JSON.parse(data.get(key)) : null;
    },
    set(key, value) {
      data.set(key, JSON.stringify(value));
    },
    remove(key) {
      data.delete(key);
    },
    keys() {
      return [...data.keys()];
    },
  };
}

/**
 * localStorage mit Präfix. Fällt auf einen Arbeitsspeicher zurück, wenn
 * localStorage nicht verfügbar ist (z. B. privater Modus); `persistent`
 * gibt an, ob dauerhaft gespeichert wird.
 */
function createLocalStorage(prefix = 'vr.') {
  let ls = null;
  try {
    ls = globalThis.localStorage;
    const probe = `${prefix}__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch {
    ls = null;
  }
  if (!ls) {
    const mem = createMemoryStorage();
    mem.persistent = false;
    return mem;
  }
  return {
    persistent: true,
    get(key) {
      try {
        const raw = ls.getItem(prefix + key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        ls.setItem(prefix + key, JSON.stringify(value));
      } catch (e) {
        throw new Error(`Speichern fehlgeschlagen (Speicher voll?): ${e.message}`);
      }
    },
    remove(key) {
      try {
        ls.removeItem(prefix + key);
      } catch {
        // ignorieren
      }
    },
    keys() {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
      return out;
    },
  };
}

  VR.provide('core/storage.js', { createMemoryStorage, createLocalStorage });
}());
