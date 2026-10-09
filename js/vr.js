// Modul-Registry: Die Programmteile sind normale Skripte (keine JavaScript-Module),
// damit die App auch beim Öffnen von index.html per Doppelklick läuft.
// Jede Datei meldet ihre Funktionen mit VR.provide an und holt sich andere mit VR.use.
// Die Ladereihenfolge steht in index.html (Abhängigkeiten zuerst).

(function (g) {
  'use strict';
  const mods = {};
  g.VR = {
    provide(name, exports) {
      mods[name] = exports;
    },
    use(name) {
      if (!mods[name]) throw new Error(`Programmteil ${name} fehlt – Reihenfolge der Skripte in index.html prüfen.`);
      return mods[name];
    },
  };
}(typeof window !== 'undefined' ? window : globalThis));
