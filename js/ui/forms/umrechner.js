// Formular Modus E: Einheiten-Umrechner

import { h } from '../dom.js';
import { quantityField, numberField, substancePicker, moreSection } from '../components.js';
import { CONC_KINDS } from '../../core/units.js';
import { formCard, applyHighlights, fromDb, isBlank, collectState, restoreState, CONC_UNITS } from './common.js';

export function createForm({ db, onChange }) {
  const f = {};
  f.quantity = quantityField({
    name: 'quantity', label: 'Wert mit Einheit', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'ng/mL',
    placeholder: 'z. B. 10 ng/mL', textMode: true, onInput: onChange, help: 'Freitext wie „5 µg/mL“, „0,1 M“ oder „37 % (m/m)“ – oder Zahl + Einheit wählen.',
  });
  f.substance = substancePicker({ name: 'formula', label: 'Stoff (für mol/L)', db, onInput: () => { updatePlaceholders(); onChange(); } });
  f.M = numberField({ name: 'M', label: 'Molare Masse manuell', suffix: 'g/mol', onInput: onChange });
  f.rhoSol = numberField({ name: 'rhoSol', label: 'Dichte der Lösung', suffix: 'g/mL', onInput: onChange, help: 'Für % (m/m), mg/kg, Molalität.' });
  f.rhoSub = numberField({ name: 'rhoSub', label: 'Dichte des reinen Stoffes', suffix: 'g/mL', onInput: onChange, help: 'Für % (V/V).' });
  f.z = numberField({ name: 'z', label: 'Wertigkeit z', suffix: 'eq/mol', onInput: onChange, help: 'Für eq/L.' });

  const more = moreSection('Zusatzangaben für weitere Einheiten', [h('div', { class: 'grid2' }, f.M.el, f.z.el), h('div', { class: 'grid2' }, f.rhoSol.el, f.rhoSub.el)]);
  const el = formCard('E · Einheiten-Umrechner', 'Ein Wert in allen sinnvollen Einheiten.', [f.quantity.el, f.substance.el, more]);

  function updatePlaceholders() {
    const s = f.substance.get().substance;
    f.rhoSub.setPlaceholder(s ? fromDb(s.density, '') : '');
    f.z.setPlaceholder(s ? fromDb(s.z, '') : '');
  }
  const fields = { quantity: f.quantity, M: f.M, rhoSol: f.rhoSol, rhoSub: f.rhoSub, z: f.z };
  return {
    el,
    collect() {
      const sel = f.substance.get();
      return { quantity: f.quantity.get(), substance: sel.substance, formula: sel.formula, M: f.M.get(), rhoSol: f.rhoSol.get(), rhoSub: f.rhoSub.get(), z: f.z.get() };
    },
    isBlank() { return isBlank(f.quantity.get()); },
    highlight(R) { applyHighlights(fields, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState() }; },
    setState(st) { restoreState(fields, st); if (st) f.substance.setState(st.substance); updatePlaceholders(); },
    describe() { const q = f.quantity.get(); return `${q.value} ${/[a-zµ%]/i.test(q.value) ? '' : q.unit}`.trim(); },
    substance() { return f.substance.get().substance; },
  };
}
