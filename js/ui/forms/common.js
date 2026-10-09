// Gemeinsames für die Formulare der Rechenmodi.

(function () {
  'use strict';
  const { h } = VR.use('ui/dom.js');
  const { formatNumber } = VR.use('core/numbers.js');

// Einheitenlisten für Konzentrationsfelder (häufige zuerst)
const CONC_UNITS = [
  'mol/L', 'mmol/L', 'µmol/L', 'nmol/L', 'M', 'mM', 'µM', 'nM',
  'g/L', 'mg/mL', 'mg/L', 'µg/mL', 'µg/L', 'ng/mL', 'ng/L', 'pg/mL', '% (m/V)',
  '% (m/m)', 'ppm', 'ppb', 'ppt', 'mg/kg', 'µg/kg',
  '% (V/V)', 'mL/L', 'eq/L', 'meq/L', 'N', 'mol/kg', 'mmol/kg',
];
const VOLUME_UNITS = ['mL', 'L', 'µL'];
const AMOUNT_UNITS = ['mL', 'L', 'µL', 'g', 'kg'];

/** Karte mit Titel und Beschreibung. */
function formCard(title, description, children) {
  return h('form', { class: 'card', onsubmit: (e) => e.preventDefault(), autocomplete: 'off' },
    h('h2', {}, title),
    description ? h('p', { class: 'sub' }, description) : null,
    children);
}

/**
 * Markiert Felder für fehlende Angaben (R.missing) und das fehlerhafte Feld
 * (R.field); öffnet zugeklappte Bereiche, in denen ein markiertes Feld liegt.
 */
function applyHighlights(fields, R) {
  for (const f of Object.values(fields)) {
    if (f && f.highlight) f.highlight(false);
    if (f && f.invalid) f.invalid(false);
  }
  const reveal = (f) => {
    let p = f.el.parentElement;
    while (p) {
      if (p.tagName === 'DETAILS') p.open = true;
      p = p.parentElement;
    }
  };
  for (const m of R.missing || []) {
    if (m.optional) continue;
    const f = fields[m.param];
    if (f) { f.highlight(true); reveal(f); }
  }
  if (!R.ok && R.field && fields[R.field]) {
    fields[R.field].invalid(true);
    reveal(fields[R.field]);
  }
}

/** Platzhalter aus dem Stoffeintrag, z. B. "37 (aus Datenbank)". */
function fromDb(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return `${formatNumber(value, 6)} (aus Datenbank)`;
}

function isBlank(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'object') return v.value === undefined || String(v.value).trim() === '';
  return String(v).trim() === '';
}

/** Zustand aller Felder (für Speichern/Verlauf). */
function collectState(fields, picker = null) {
  const st = {};
  for (const [k, f] of Object.entries(fields)) {
    if (!f || f === picker) continue;
    if (typeof f.get === 'function' && !f.getState) st[k] = f.get();
  }
  if (picker) st.substance = picker.getState();
  return st;
}

function restoreState(fields, st, picker = null) {
  if (!st) return;
  for (const [k, f] of Object.entries(fields)) {
    if (!f || f === picker || !(k in st)) continue;
    if (typeof f.set === 'function') f.set(st[k]);
  }
  if (picker && 'substance' in st) picker.setState(st.substance);
}

  VR.provide('ui/forms/common.js', { CONC_UNITS, VOLUME_UNITS, AMOUNT_UNITS, formCard, applyHighlights, fromDb, isBlank, collectState, restoreState });
}());
