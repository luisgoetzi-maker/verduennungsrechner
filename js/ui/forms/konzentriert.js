// Formular Modus C: Konzentrierte Lösung

import { h } from '../dom.js';
import { quantityField, numberField, substancePicker, segmented, moreSection } from '../components.js';
import { CONC_KINDS } from '../../core/units.js';
import { formCard, applyHighlights, fromDb, isBlank, collectState, restoreState, CONC_UNITS, AMOUNT_UNITS } from './common.js';

export function createForm({ db, onChange, textMode }) {
  const f = {};
  f.substance = substancePicker({ name: 'formula', label: 'Konzentrierte Säure/Lauge (z. B. „HCl 37“)', db, onInput: () => { updatePlaceholders(); onChange(); } });
  f.purity = numberField({ name: 'purity', label: 'Gehalt', suffix: '% (m/m)', onInput: onChange });
  f.density = numberField({ name: 'density', label: 'Dichte', suffix: 'g/mL', onInput: onChange });
  f.task = segmented({
    name: 'task', options: [{ value: 'info', label: 'Konzentration berechnen' }, { value: 'prepare', label: 'Lösung herstellen' }],
    value: 'info', onInput: () => { toggle(); onChange(); },
  });
  f.conc = quantityField({ name: 'conc', label: 'Zielkonzentration', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'mol/L', placeholder: 'z. B. 0,1', textMode, onInput: onChange });
  f.amount = quantityField({ name: 'amount', label: 'Zielvolumen', kinds: ['volume', 'massq'], units: AMOUNT_UNITS, unit: 'mL', placeholder: 'z. B. 1000', textMode, onInput: onChange });
  f.M = numberField({ name: 'M', label: 'Molare Masse manuell', suffix: 'g/mol', onInput: onChange });
  f.z = numberField({ name: 'z', label: 'Wertigkeit z', suffix: 'eq/mol', onInput: onChange });
  f.rhoSol = numberField({ name: 'rhoSol', label: 'Dichte der Ziellösung', suffix: 'g/mL', onInput: onChange, help: 'Nur für Ziele in % (m/m).' });

  const prep = h('div', {}, f.conc.el, f.amount.el);
  const more = moreSection('Weitere Angaben', [h('div', { class: 'grid2' }, f.M.el, f.z.el), f.rhoSol.el]);
  const el = formCard('C · Konzentrierte Lösung', 'Gehalt % (m/m) + Dichte → mol/L. Oder: Wie viel mL der konzentrierten Lösung für eine verdünnte Lösung?', [
    f.substance.el, h('div', { class: 'grid2' }, f.purity.el, f.density.el), f.task.el, prep, more,
  ]);

  function toggle() { prep.classList.toggle('hidden', f.task.get() !== 'prepare'); }
  function updatePlaceholders() {
    const s = f.substance.get().substance;
    f.purity.setPlaceholder(s ? fromDb(s.purity, '') : 'z. B. 37');
    f.density.setPlaceholder(s ? fromDb(s.density, '') : 'z. B. 1,19');
    f.z.setPlaceholder(s ? fromDb(s.z, '') : '');
  }
  toggle();
  updatePlaceholders();

  const fields = { purity: f.purity, density: f.density, task: f.task, conc: f.conc, amount: f.amount, M: f.M, z: f.z, rhoSol: f.rhoSol };
  return {
    el,
    collect() {
      const sel = f.substance.get();
      const prepare = f.task.get() === 'prepare';
      return {
        substance: sel.substance, formula: sel.formula, purity: f.purity.get(), density: f.density.get(),
        M: f.M.get(), z: f.z.get(), rhoSol: f.rhoSol.get(),
        conc: prepare ? f.conc.get() : '', amount: prepare ? f.amount.get() : '',
      };
    },
    isBlank() {
      const sel = f.substance.get();
      return !sel.substance && !sel.formula && isBlank(f.purity.get()) && isBlank(f.density.get());
    },
    highlight(R) { applyHighlights({ ...fields, formula: f.substance }, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState() }; },
    setState(st) { restoreState(fields, st); if (st) f.substance.setState(st.substance); toggle(); updatePlaceholders(); },
    describe() {
      const sel = f.substance.get();
      return sel.substance ? sel.substance.name : sel.formula || '';
    },
    substance() { return f.substance.get().substance; },
  };
}
