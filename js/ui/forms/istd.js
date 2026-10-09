// Formular Modus F: Interner Standard (Spiking)

(function () {
  'use strict';
  const { h } = VR.use('ui/dom.js');
  const { quantityField, numberField, substancePicker, segmented, checkField, moreSection, extraSubstanceList } = VR.use('ui/components.js');
  const { CONC_KINDS } = VR.use('core/units.js');
  const { formCard, applyHighlights, isBlank, collectState, restoreState, CONC_UNITS, VOLUME_UNITS } = VR.use('ui/forms/common.js');

function createForm({ db, onChange, textMode, settings }) {
  const f = {};
  const change = () => { relabel(); onChange(); };
  f.stock = quantityField({ name: 'stock', label: 'Konzentration der IS-Lösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 1', textMode, onInput: onChange });
  f.target = quantityField({ name: 'target', label: 'IS-Konzentration in der Endlösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'ng/mL', placeholder: 'z. B. 10', textMode, onInput: onChange });
  f.mode = segmented({
    name: 'mode', label: 'Zugabe',
    options: [{ value: 'add', label: 'zur Probe geben' }, { value: 'fill', label: 'auf Endvolumen auffüllen' }],
    value: 'add', onInput: change,
  });
  f.sample = quantityField({ name: 'sample', label: 'Probenvolumen', kinds: ['volume'], units: VOLUME_UNITS, unit: 'mL', placeholder: 'z. B. 1', textMode, onInput: onChange });
  f.n = numberField({ name: 'n', label: 'Anzahl Proben (inkl. Standards, Blanks, QC)', placeholder: 'z. B. 24', integer: true, onInput: onChange });
  f.reserve = numberField({ name: 'reserve', label: 'Reserve', suffix: '%', value: '10', onInput: onChange });
  f.round = checkField({ name: 'round', label: 'Zugabevolumen auf Pipettenauflösung runden', checked: settings.roundPipette, onInput: onChange });
  f.substance = substancePicker({ name: 'formula', label: 'Interner Standard (nur bei unterschiedlichen Einheitenarten nötig)', db, onInput: onChange });
  f.M = numberField({ name: 'M', label: 'Molare Masse', suffix: 'g/mol', onInput: onChange });
  f.rhoSol = numberField({ name: 'rhoSol', label: 'Dichte', suffix: 'g/mL', onInput: onChange });

  const more = moreSection('Umrechnung zwischen Einheitenarten', [f.substance.el, h('div', { class: 'grid2' }, f.M.el, f.rhoSol.el)]);
  const extra = extraSubstanceList({
    db, onChange, textMode, rowTitle: 'IS',
    fields: [
      { key: 'stock', type: 'quantity', label: 'Konzentration der IS-Lösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 1' },
      { key: 'target', type: 'quantity', label: 'IS-Konzentration in der Endlösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'ng/mL', placeholder: 'z. B. 10' },
    ],
    template: () => ({ stock: { value: '', unit: f.stock.get().unit }, target: { value: '', unit: f.target.get().unit } }),
    addLabel: 'Weitere IS-Lösung hinzufügen',
  });
  const el = formCard('F · Interner Standard', 'Zugabevolumen der IS-Lösung je Probe und Gesamtbedarf für eine Charge. Mit ＋ mehrere IS-Lösungen.', [
    f.stock.el, f.target.el, extra.el, f.mode.el, f.sample.el, h('div', { class: 'grid2' }, f.n.el, f.reserve.el), f.round.el, more,
  ]);

  function relabel() {
    const lbl = f.sample.el.querySelector('label');
    lbl.textContent = f.mode.get() === 'add' ? 'Probenvolumen (vor der Zugabe)' : 'Endvolumen je Probe';
  }
  relabel();

  const fields = { stock: f.stock, target: f.target, mode: f.mode, sample: f.sample, n: f.n, reserve: f.reserve, round: f.round, M: f.M, rhoSol: f.rhoSol };
  return {
    el,
    collect() {
      const sel = f.substance.get();
      return {
        stock: f.stock.get(), target: f.target.get(), mode: f.mode.get(), sample: f.sample.get(), n: f.n.get(),
        reserve: f.reserve.get(), round: f.round.get(), substance: sel.substance, formula: sel.formula, M: f.M.get(), rhoSol: f.rhoSol.get(),
        extra: extra.collect(),
      };
    },
    isBlank() { return isBlank(f.stock.get()) && isBlank(f.target.get()) && isBlank(f.sample.get()); },
    highlight(R) { applyHighlights(fields, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState(), extra: extra.getState() }; },
    setState(st) { restoreState(fields, st); if (st) { f.substance.setState(st.substance); extra.setState(st.extra); } relabel(); },
    describe() { return `IS ${f.stock.get().value} ${f.stock.get().unit} → ${f.target.get().value} ${f.target.get().unit}`; },
    substance() { return f.substance.get().substance; },
  };
}

  VR.provide('ui/forms/istd.js', { createForm });
}());
