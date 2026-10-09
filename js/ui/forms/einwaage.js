// Formular Modus A: Einwaage – ein Stoff oder (über ＋) mehrere Stoffe in einer Lösung

import { h, ICONS } from '../dom.js';
import { quantityField, numberField, selectField, textField, substancePicker, moreSection } from '../components.js';
import { CONC_KINDS } from '../../core/units.js';
import { formCard, applyHighlights, fromDb, isBlank, collectState, restoreState, CONC_UNITS, AMOUNT_UNITS } from './common.js';

/** Weiterer Stoff derselben Lösung: Stoff/Formel, Zielkonzentration, Reinheit. */
function createExtra({ db, onChange, textMode, onRemove, concTemplate }) {
  const e = {};
  e.substance = substancePicker({ name: 'formula', label: 'Stoff (Name, Formel oder CAS)', db, onInput: () => { updatePlaceholder(); onChange(); } });
  e.conc = quantityField({ name: 'conc', label: 'Zielkonzentration', kinds: CONC_KINDS, units: CONC_UNITS, unit: concTemplate.unit || 'mol/L', value: concTemplate.value || '', placeholder: 'z. B. 0,1', textMode, onInput: onChange });
  e.purity = numberField({ name: 'purity', label: 'Reinheit / Gehalt', suffix: '%', placeholder: '100', onInput: onChange });
  const title = h('strong', { class: 'grow' }, 'Stoff');
  const el = h('div', { class: 'comp' },
    h('div', { class: 'row', style: { alignItems: 'center', marginBottom: '8px' } }, title,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Stoff entfernen', html: ICONS.trash, onclick: () => onRemove(api) })),
    e.substance.el, e.conc.el, e.purity.el);
  function updatePlaceholder() {
    const s = e.substance.get().substance;
    e.purity.setPlaceholder(s ? fromDb(s.purity, '100') : '100');
  }
  const api = {
    el,
    setNumber(n) { title.textContent = `Stoff ${n}`; },
    collect() {
      const sel = e.substance.get();
      return { substance: sel.substance, formula: sel.formula, conc: e.conc.get(), purity: e.purity.get() };
    },
    isBlank() { const sel = e.substance.get(); return !sel.substance && !sel.formula; },
    getState() { return { substance: e.substance.getState(), conc: e.conc.get(), purity: e.purity.get() }; },
    setState(st) {
      if (!st) return;
      e.substance.setState(st.substance);
      if (st.conc) e.conc.set(st.conc);
      e.purity.set(st.purity ?? '');
      updatePlaceholder();
    },
    name() { const sel = e.substance.get(); return sel.substance ? sel.substance.name : sel.formula || ''; },
    focus() { const i = el.querySelector('input'); if (i) i.focus(); },
  };
  return api;
}

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

  // Weitere Stoffe derselben Lösung (＋)
  let extras = [];
  const extraList = h('div');
  const mainTitle = h('strong', { class: 'hidden', style: { display: 'block', marginBottom: '8px' } }, 'Stoff 1');
  const renumber = () => {
    extras.forEach((x, i) => x.setNumber(i + 2));
    mainTitle.classList.toggle('hidden', extras.length === 0);
  };
  const removeExtra = (x) => {
    extras = extras.filter((y) => y !== x);
    x.el.remove();
    renumber();
    onChange();
  };
  const addExtra = (state = null) => {
    const x = createExtra({ db, onChange, textMode, onRemove: removeExtra, concTemplate: f.conc.get() });
    if (state) x.setState(state);
    extras.push(x);
    extraList.append(x.el);
    renumber();
    return x;
  };
  const plus = h('button', {
    type: 'button', class: 'btn add-btn', 'aria-label': 'Weiteren Stoff hinzufügen',
    onclick: () => { const x = addExtra(); x.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); x.focus(); onChange(); },
  }, h('span', { html: ICONS.plus, style: { display: 'contents' } }), 'Weiteren Stoff hinzufügen');

  const refExtra = h('div', {}, f.refElement.el, f.refFormula.el, f.refCount.el);
  const more = moreSection('Weitere Angaben (Bezugsform, Dichte, Wertigkeit …)', [
    f.reference.el, refExtra, h('div', { class: 'grid2' }, f.density.el, f.rhoSol.el), h('div', { class: 'grid2' }, f.z.el, f.M.el),
  ]);
  const el = formCard('A · Einwaage', 'Zielkonzentration und Volumen → abzuwiegende Masse. Mit ＋ weitere Stoffe für dieselbe Lösung hinzufügen.', [
    mainTitle, f.substance.el, f.conc.el, f.purity.el, extraList, plus, f.amount.el, more,
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
        extra: extras.map((x) => x.collect()),
      };
    },
    isBlank() { return isBlank(f.conc.get()) && isBlank(f.amount.get()); },
    highlight(R) { applyHighlights({ ...fields, formula: f.substance, rhoSub: f.density }, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState(), extra: extras.map((x) => x.getState()) }; },
    setState(st) {
      restoreState(fields, st);
      if (st) f.substance.setState(st.substance);
      extras.forEach((x) => x.el.remove());
      extras = [];
      if (st && Array.isArray(st.extra)) st.extra.forEach((x) => addExtra(x));
      renumber();
      toggleRef();
      updatePlaceholders();
    },
    describe() {
      const sel = f.substance.get();
      const names = [sel.substance ? sel.substance.name : sel.formula || '', ...extras.map((x) => x.name())].filter(Boolean);
      const c = f.conc.get();
      const a = f.amount.get();
      if (names.length > 1) return `${names.join(', ')} in ${a.value} ${a.unit}`;
      return `${names[0] ? `${names[0]}: ` : ''}${c.value} ${c.unit} in ${a.value} ${a.unit}`;
    },
    substance() { return extras.some((x) => !x.isBlank()) ? null : f.substance.get().substance; },
  };
}
