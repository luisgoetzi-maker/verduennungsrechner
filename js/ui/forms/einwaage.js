// Formular Modus A: Einwaage

import { h } from '../dom.js';
import { quantityField, numberField, selectField, textField, substancePicker, moreSection } from '../components.js';
import { CONC_KINDS } from '../../core/units.js';
import { formCard, applyHighlights, fromDb, isBlank, collectState, restoreState, CONC_UNITS, AMOUNT_UNITS } from './common.js';

export function createForm({ db, onChange, textMode }) {
  const f = {};
  f.substance = substancePicker({ name: 'formula', label: 'Stoff (Name, Formel oder CAS)', db, onInput: () => { updatePlaceholders(); onChange(); } });
  f.conc = quantityField({ name: 'conc', label: 'Zielkonzentration', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'mol/L', placeholder: 'z. B. 0,1', textMode, onInput: onChange });
  f.amount = quantityField({ name: 'amount', label: 'Volumen der Lösung (oder Masse bei % (m/m))', kinds: ['volume', 'massq'], units: AMOUNT_UNITS, unit: 'mL', placeholder: 'z. B. 250', textMode, onInput: onChange });
  f.purity = numberField({ name: 'purity', label: 'Reinheit / Gehalt', suffix: '%', placeholder: '100', onInput: onChange, help: 'Laut Etikett bzw. Analysenzertifikat.' });
  f.reference = selectField({
    name: 'reference', label: 'Konzentration bezogen auf',
    options: [
      { value: 'compound', label: 'den Stoff wie eingewogen (inkl. Kristallwasser)' },
      { value: 'anhydrous', label: 'die wasserfreie Form' },
      { value: 'element', label: 'ein Element (z. B. Cu, Na)' },
      { value: 'formula', label: 'eine andere Formel (z. B. Anion)' },
    ],
    value: 'compound',
    onInput: () => { toggleRef(); onChange(); },
  });
  f.refElement = textField({ name: 'refElement', label: 'Element', placeholder: 'z. B. Cu', onInput: onChange });
  f.refFormula = textField({ name: 'refFormula', label: 'Bezugsformel', placeholder: 'z. B. C8F17O3S-', onInput: onChange });
  f.refCount = numberField({ name: 'refCount', label: 'Anzahl je Formeleinheit', placeholder: '1', onInput: onChange });
  f.density = numberField({ name: 'density', label: 'Dichte des Stoffes / Produkts', suffix: 'g/mL', onInput: onChange, help: 'Für Flüssigkeiten: Ergebnis zusätzlich als Volumen.' });
  f.rhoSol = numberField({ name: 'rhoSol', label: 'Dichte der fertigen Lösung', suffix: 'g/mL', onInput: onChange, help: 'Nur für % (m/m), mg/kg, Molalität mit Volumen.' });
  f.z = numberField({ name: 'z', label: 'Wertigkeit z', suffix: 'eq/mol', onInput: onChange, help: 'Nur für eq/L bzw. N.' });
  f.M = numberField({ name: 'M', label: 'Molare Masse manuell', suffix: 'g/mol', onInput: onChange, help: 'Überschreibt den Wert aus Formel/Datenbank.' });

  const refExtra = h('div', {}, f.refElement.el, f.refFormula.el, f.refCount.el);
  const more = moreSection('Weitere Angaben (Bezugsform, Dichte, Wertigkeit …)', [
    f.reference.el, refExtra, h('div', { class: 'grid2' }, f.density.el, f.rhoSol.el), h('div', { class: 'grid2' }, f.z.el, f.M.el),
  ]);
  const el = formCard('A · Einwaage', 'Zielkonzentration und Volumen → abzuwiegende Masse (bei Flüssigkeiten zusätzlich das Volumen).', [
    f.substance.el, f.conc.el, f.amount.el, f.purity.el, more,
  ]);

  function toggleRef() {
    const t = f.reference.get();
    f.refElement.show(t === 'element');
    f.refFormula.show(t === 'formula');
    f.refCount.show(t === 'formula');
  }
  function updatePlaceholders() {
    const s = f.substance.get().substance;
    f.purity.setPlaceholder(s ? fromDb(s.purity, '100') : '100');
    f.density.setPlaceholder(s ? fromDb(s.density, '') : '');
    f.z.setPlaceholder(s ? fromDb(s.z, '') : '');
  }
  toggleRef();

  const fields = { ...f };
  delete fields.substance;
  return {
    el,
    collect() {
      const sel = f.substance.get();
      return {
        substance: sel.substance, formula: sel.formula,
        conc: f.conc.get(), amount: f.amount.get(), purity: f.purity.get(),
        density: f.density.get(), rhoSol: f.rhoSol.get(), z: f.z.get(), M: f.M.get(),
        reference: { type: f.reference.get(), element: f.refElement.get(), formula: f.refFormula.get(), count: f.refCount.get() },
      };
    },
    isBlank() { return isBlank(f.conc.get()) && isBlank(f.amount.get()); },
    highlight(R) { applyHighlights({ ...fields, formula: f.substance, rhoSub: f.density }, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState() }; },
    setState(st) { restoreState(fields, st); if (st) f.substance.setState(st.substance); toggleRef(); updatePlaceholders(); },
    describe(R) {
      const sel = f.substance.get();
      const name = sel.substance ? sel.substance.name : sel.formula || '';
      const c = f.conc.get();
      const a = f.amount.get();
      return `${name ? `${name}: ` : ''}${c.value} ${c.unit} in ${a.value} ${a.unit}`;
    },
    substance() { return f.substance.get().substance; },
  };
}
