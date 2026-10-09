// Formular Modus B: Verdünnung c1·V1 = c2·V2

(function () {
  'use strict';
  const { h } = VR.use('ui/dom.js');
  const { quantityField, numberField, substancePicker, segmented, moreSection, extraSubstanceList } = VR.use('ui/components.js');
  const { CONC_KINDS } = VR.use('core/units.js');
  const { formCard, applyHighlights, isBlank, collectState, restoreState, CONC_UNITS, VOLUME_UNITS } = VR.use('ui/forms/common.js');

function createForm({ db, onChange, textMode }) {
  const f = {};
  const change = () => { applySolve(); onChange(); };
  f.solveFor = segmented({
    name: 'solveFor', label: 'Gesucht',
    options: [{ value: 'V1', label: 'V₁' }, { value: 'c2', label: 'c₂' }, { value: 'V2', label: 'V₂' }, { value: 'c1', label: 'c₁' }],
    value: 'V1', onInput: change,
  });
  f.c1 = quantityField({ name: 'c1', label: 'c₁ – Konzentration der Stammlösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 1000', textMode, onInput: onChange });
  f.V1 = quantityField({ name: 'V1', label: 'V₁ – Volumen Stammlösung', kinds: ['volume'], units: ['µL', 'mL', 'L'], unit: 'mL', placeholder: 'z. B. 5', textMode, onInput: onChange });
  f.c2 = quantityField({ name: 'c2', label: 'c₂ – Zielkonzentration', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 100', textMode, onInput: onChange });
  f.V2 = quantityField({ name: 'V2', label: 'V₂ – Endvolumen (Messkolben)', kinds: ['volume'], units: VOLUME_UNITS, unit: 'mL', placeholder: 'z. B. 50', textMode, onInput: onChange });
  f.substance = substancePicker({ name: 'formula', label: 'Stoff (nur nötig, wenn c₁ und c₂ verschiedene Größenarten haben)', db, onInput: onChange });
  f.M = numberField({ name: 'M', label: 'Molare Masse', suffix: 'g/mol', onInput: onChange });
  f.rhoSol = numberField({ name: 'rhoSol', label: 'Dichte der Lösung', suffix: 'g/mL', onInput: onChange });
  f.z = numberField({ name: 'z', label: 'Wertigkeit z', suffix: 'eq/mol', onInput: onChange });
  f.rhoSub = numberField({ name: 'rhoSub', label: 'Dichte des reinen Stoffes', suffix: 'g/mL', onInput: onChange });

  const more = moreSection('Umrechnung zwischen Einheitenarten (Molare Masse, Dichte …)', [
    f.substance.el, h('div', { class: 'grid2' }, f.M.el, f.z.el), h('div', { class: 'grid2' }, f.rhoSol.el, f.rhoSub.el),
  ]);
  const extra = extraSubstanceList({
    db, onChange, textMode,
    fields: [{ key: 'c1', type: 'quantity', label: 'Konzentration in der Stammlösung (c₁)', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 500' }],
    template: () => ({ c1: { value: '', unit: f.c1.get().unit } }),
    addLabel: 'Weiteren Stoff der Stammlösung hinzufügen',
  });
  const el = formCard('B · Verdünnung', 'c₁ · V₁ = c₂ · V₂ – drei Größen eingeben, die gesuchte wird berechnet. Mit ＋ weitere Stoffe derselben Stammlösung.', [
    f.solveFor.el, f.c1.el, f.V1.el, f.c2.el, f.V2.el, extra.el, more,
  ]);

  function applySolve() {
    const s = f.solveFor.get();
    for (const k of ['c1', 'V1', 'c2', 'V2']) f[k].setDisabled(k === s);
  }
  applySolve();

  const fields = { solveFor: f.solveFor, c1: f.c1, V1: f.V1, c2: f.c2, V2: f.V2, M: f.M, rhoSol: f.rhoSol, z: f.z, rhoSub: f.rhoSub };
  return {
    el,
    collect() {
      const sel = f.substance.get();
      const s = f.solveFor.get();
      const val = (k) => (k === s ? { value: '', unit: f[k].get().unit } : f[k].get());
      return {
        solveFor: s, c1: val('c1'), V1: val('V1'), c2: val('c2'), V2: val('V2'),
        substance: sel.substance, formula: sel.formula, M: f.M.get(),
        rhoSol: f.rhoSol.get(), z: f.z.get(), rhoSub: f.rhoSub.get(),
        extra: extra.collect(),
      };
    },
    isBlank() { return ['c1', 'V1', 'c2', 'V2'].filter((k) => k !== f.solveFor.get()).every((k) => isBlank(f[k].get())); },
    highlight(R) { applyHighlights(fields, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState(), extra: extra.getState() }; },
    setState(st) { restoreState(fields, st); if (st) { f.substance.setState(st.substance); extra.setState(st.extra); } applySolve(); },
    describe() {
      const s = f.solveFor.get();
      const sym = { c1: 'c₁', V1: 'V₁', c2: 'c₂', V2: 'V₂' };
      return ['c1', 'V1', 'c2', 'V2'].filter((k) => k !== s).map((k) => `${sym[k]} = ${f[k].get().value} ${/[a-zµ%]/i.test(f[k].get().value) ? '' : f[k].get().unit}`.trim()).join(', ');
    },
    substance() { return f.substance.get().substance; },
  };
}

  VR.provide('ui/forms/verduennung.js', { createForm });
}());
