// Formular Modus G: Mischstandard – mehrere Stoffe in einer Lösung

(function () {
  'use strict';
  const { h, ICONS } = VR.use('ui/dom.js');
  const { quantityField, numberField, selectField, textField, substancePicker, segmented, checkField } = VR.use('ui/components.js');
  const { CONC_KINDS } = VR.use('core/units.js');
  const { formCard, applyHighlights, isBlank, CONC_UNITS, VOLUME_UNITS } = VR.use('ui/forms/common.js');

/** Eine Komponente (Stoff + Quelle + Konzentration). */
function createComponent({ db, onChange, textMode, onRemove }) {
  const c = {};
  c.substance = substancePicker({ name: 'formula', label: 'Stoff (Name, Formel oder CAS)', db, onInput: onChange });
  c.source = segmented({
    name: 'source', options: [{ value: 'stock', label: 'aus Stammlösung' }, { value: 'solid', label: 'als Feststoff einwiegen' }],
    value: 'stock', onInput: () => { toggle(); onChange(); },
  });
  c.conc = quantityField({ name: 'conc', label: 'Zielkonzentration in der Mischung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 1', textMode, onInput: onChange });
  c.stock = quantityField({ name: 'stock', label: 'Konzentration der Stammlösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 50', textMode, onInput: onChange });
  c.purity = numberField({ name: 'purity', label: 'Reinheit', suffix: '%', placeholder: '100', onInput: onChange });
  c.reference = selectField({
    name: 'reference', label: 'Konzentration bezogen auf',
    options: [
      { value: 'compound', label: 'den Stoff wie eingewogen' },
      { value: 'anhydrous', label: 'die wasserfreie Form' },
      { value: 'element', label: 'ein Element' },
      { value: 'formula', label: 'eine andere Formel (z. B. Anion)' },
    ],
    value: 'compound', onInput: () => { toggle(); onChange(); },
  });
  c.refText = textField({ name: 'refText', label: 'Element bzw. Bezugsformel', placeholder: 'z. B. Cu oder C8F17O3S-', onInput: onChange });

  const title = h('strong', { class: 'grow' }, 'Komponente');
  const solidBox = h('div', {}, c.purity.el, c.reference.el, c.refText.el);
  const el = h('div', { class: 'comp' },
    h('div', { class: 'row', style: { alignItems: 'center', marginBottom: '8px' } }, title,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Komponente entfernen', html: ICONS.trash, onclick: () => onRemove(api) })),
    c.substance.el, c.source.el, c.conc.el, c.stock.el, solidBox);

  function toggle() {
    const solid = c.source.get() === 'solid';
    c.stock.show(!solid);
    solidBox.classList.toggle('hidden', !solid);
    const ref = c.reference.get();
    c.refText.show(ref === 'element' || ref === 'formula');
  }
  toggle();

  const api = {
    el,
    setNumber(n) { title.textContent = `Komponente ${n}`; },
    setCommon(on) { c.conc.show(!on); },
    collect() {
      const sel = c.substance.get();
      const ref = c.reference.get();
      return {
        substance: sel.substance, formula: sel.formula, source: c.source.get(), conc: c.conc.get(), stock: c.stock.get(), purity: c.purity.get(),
        reference: { type: ref, element: ref === 'element' ? c.refText.get() : '', formula: ref === 'formula' ? c.refText.get() : '' },
      };
    },
    isBlank() {
      const sel = c.substance.get();
      return !sel.substance && !sel.formula && isBlank(c.conc.get()) && isBlank(c.stock.get());
    },
    getState() {
      return { substance: c.substance.getState(), source: c.source.get(), conc: c.conc.get(), stock: c.stock.get(), purity: c.purity.get(), reference: c.reference.get(), refText: c.refText.get() };
    },
    setState(st) {
      if (!st) return;
      c.substance.setState(st.substance);
      if (st.source) c.source.set(st.source);
      if (st.conc) c.conc.set(st.conc);
      if (st.stock) c.stock.set(st.stock);
      c.purity.set(st.purity ?? '');
      if (st.reference) c.reference.set(st.reference);
      c.refText.set(st.refText ?? '');
      toggle();
    },
    /** Vorlage für die nächste Komponente: Quelle und Einheiten übernehmen. */
    template() {
      return { source: c.source.get(), conc: { value: '', unit: c.conc.get().unit }, stock: { value: '', unit: c.stock.get().unit } };
    },
    name() {
      const sel = c.substance.get();
      return sel.substance ? sel.substance.name : sel.formula || '';
    },
  };
  return api;
}

function createForm({ db, onChange, textMode }) {
  const f = {};
  f.amount = quantityField({ name: 'amount', label: 'Endvolumen der Mischung (Messkolben)', kinds: ['volume'], units: VOLUME_UNITS, unit: 'mL', placeholder: 'z. B. 10', textMode, onInput: onChange });
  f.useCommon = checkField({ name: 'useCommon', label: 'Gleiche Zielkonzentration für alle Komponenten', checked: true, onInput: () => { applyCommon(); onChange(); } });
  f.commonConc = quantityField({ name: 'commonConc', label: 'Zielkonzentration je Komponente', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 1', textMode, onInput: onChange });

  const list = h('div');
  let comps = [];
  const renumber = () => comps.forEach((c, i) => c.setNumber(i + 1));
  const applyCommon = () => {
    const on = f.useCommon.get();
    f.commonConc.show(on);
    comps.forEach((c) => c.setCommon(on));
  };
  const remove = (comp) => {
    comps = comps.filter((c) => c !== comp);
    comp.el.remove();
    if (!comps.length) add();
    renumber();
    onChange();
  };
  const add = (state = null) => {
    const comp = createComponent({ db, onChange, textMode, onRemove: remove });
    const last = comps[comps.length - 1];
    if (state) comp.setState(state);
    else if (last) comp.setState(last.template());
    comps.push(comp);
    list.append(comp.el);
    renumber();
    applyCommon();
    return comp;
  };
  const addBtn = h('button', {
    type: 'button', class: 'btn', style: { width: '100%' },
    onclick: () => { const c = add(); c.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); onChange(); },
  }, h('span', { html: ICONS.plus, style: { display: 'contents' } }), 'Komponente hinzufügen');

  const el = formCard('G · Mischstandard', 'Mehrere Stoffe in einer Lösung: je Komponente Pipettiervolumen aus einer Stammlösung oder Einwaage als Feststoff.', [
    f.amount.el, f.useCommon.el, f.commonConc.el, list, addBtn,
  ]);
  add();
  add();

  return {
    el,
    collect() {
      return { amount: f.amount.get(), useCommon: f.useCommon.get(), commonConc: f.commonConc.get(), components: comps.map((c) => c.collect()) };
    },
    isBlank() { return isBlank(f.amount.get()) && comps.every((c) => c.isBlank()); },
    highlight(R) { applyHighlights({ amount: f.amount, commonConc: f.commonConc }, R); },
    getState() {
      return { amount: f.amount.get(), useCommon: f.useCommon.get(), commonConc: f.commonConc.get(), components: comps.map((c) => c.getState()) };
    },
    setState(st) {
      if (!st) return;
      if (st.amount) f.amount.set(st.amount);
      if ('useCommon' in st) f.useCommon.set(st.useCommon);
      if (st.commonConc) f.commonConc.set(st.commonConc);
      if (Array.isArray(st.components) && st.components.length) {
        comps.forEach((c) => c.el.remove());
        comps = [];
        st.components.forEach((cs) => add(cs));
      }
      applyCommon();
    },
    describe() {
      const names = comps.map((c) => c.name()).filter(Boolean);
      const a = f.amount.get();
      return `${names.length} Komponenten (${names.join(', ')}) in ${a.value} ${a.unit}`;
    },
    substance() { return null; },
    names() { return comps.map((c) => c.name()).filter(Boolean); },
  };
}

  VR.provide('ui/forms/mischung.js', { createForm });
}());
