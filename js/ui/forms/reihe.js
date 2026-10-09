// Formular Modus D: Verdünnungs-/Kalibrierreihe

import { h } from '../dom.js';
import { quantityField, numberField, textField, selectField, substancePicker, segmented, checkField, moreSection } from '../components.js';
import { CONC_KINDS } from '../../core/units.js';
import { formCard, applyHighlights, isBlank, collectState, restoreState, CONC_UNITS, VOLUME_UNITS } from './common.js';

export function createForm({ db, onChange, textMode, settings }) {
  const f = {};
  const change = () => { toggle(); onChange(); };
  f.stock = quantityField({ name: 'stock', label: 'Stammlösung', kinds: CONC_KINDS, units: CONC_UNITS, unit: 'µg/mL', placeholder: 'z. B. 10', textMode, onInput: onChange });
  f.mode = segmented({ name: 'mode', label: 'Verdünnungsart', options: [{ value: 'parallel', label: 'parallel (aus Stamm)' }, { value: 'serial', label: 'seriell (aus Vorgänger)' }], value: 'parallel', onInput: change });
  f.serialHow = segmented({ name: 'serialHow', options: [{ value: 'factor', label: 'feste Schritte' }, { value: 'list', label: 'eigene Liste' }], value: 'factor', onInput: change });
  f.targets = textField({ name: 'targets', label: 'Zielkonzentrationen', multiline: true, placeholder: 'z. B. 100; 50; 20; 10; 5; 1', help: 'Getrennt durch Semikolon, Zeilenumbruch oder „, “. Dezimalkomma erlaubt.', onInput: onChange });
  f.targetUnit = selectField({ name: 'targetUnit', label: 'Einheit der Zielkonzentrationen', options: CONC_UNITS.map((u) => ({ value: u, label: u })), value: 'ng/mL', onInput: onChange });
  f.serialFactor = numberField({ name: 'serialFactor', label: 'Faktor je Schritt', placeholder: '10', onInput: onChange });
  f.serialCount = numberField({ name: 'serialCount', label: 'Anzahl Schritte', placeholder: '5', integer: true, onInput: onChange });
  f.Vstd = quantityField({ name: 'Vstd', label: 'Volumen je Standard', kinds: ['volume'], units: VOLUME_UNITS, unit: 'mL', placeholder: 'z. B. 10', textMode, onInput: onChange });
  f.round = checkField({ name: 'round', label: 'Pipettiervolumina auf Geräteauflösung runden (zeigt tatsächliche Konzentrationen)', checked: settings.roundPipette, onInput: onChange });
  f.useIntermediate = checkField({ name: 'useIntermediate', label: 'Vorgeschlagene Zwischenverdünnung verwenden', onInput: onChange });
  f.compensate = checkField({ name: 'compensate', label: 'Entnahme ausgleichen (jedem Standard bleibt das volle Volumen)', onInput: onChange });
  f.substance = substancePicker({ name: 'formula', label: 'Stoff (nur nötig bei unterschiedlichen Einheitenarten)', db, onInput: onChange });
  f.M = numberField({ name: 'M', label: 'Molare Masse', suffix: 'g/mol', onInput: onChange });
  f.rhoSol = numberField({ name: 'rhoSol', label: 'Dichte der Lösung', suffix: 'g/mL', onInput: onChange });
  f.z = numberField({ name: 'z', label: 'Wertigkeit z', suffix: 'eq/mol', onInput: onChange });

  const listBox = h('div', {}, f.targets.el, f.targetUnit.el);
  const factorBox = h('div', { class: 'grid2' }, f.serialFactor.el, f.serialCount.el);
  const more = moreSection('Umrechnung zwischen Einheitenarten', [f.substance.el, h('div', { class: 'grid2' }, f.M.el, f.z.el), f.rhoSol.el]);
  const el = formCard('D · Verdünnungsreihe', 'Stammlösung + Zielkonzentrationen + Volumen je Standard → Pipettierplan.', [
    f.stock.el, f.mode.el, f.serialHow.el, listBox, factorBox, f.Vstd.el, f.round.el, f.useIntermediate.el, f.compensate.el, more,
  ]);

  function toggle() {
    const serial = f.mode.get() === 'serial';
    const useFactor = serial && f.serialHow.get() === 'factor';
    f.serialHow.show(serial);
    listBox.classList.toggle('hidden', useFactor);
    factorBox.classList.toggle('hidden', !useFactor);
    f.useIntermediate.show(!serial);
    f.compensate.show(serial);
  }
  toggle();

  const fields = {
    stock: f.stock, mode: f.mode, serialHow: f.serialHow, targets: f.targets, targetUnit: f.targetUnit, serialFactor: f.serialFactor,
    serialCount: f.serialCount, Vstd: f.Vstd, round: f.round, useIntermediate: f.useIntermediate, compensate: f.compensate, M: f.M, rhoSol: f.rhoSol, z: f.z,
  };
  return {
    el,
    collect() {
      const serial = f.mode.get() === 'serial';
      const useFactor = serial && f.serialHow.get() === 'factor';
      const sel = f.substance.get();
      return {
        stock: f.stock.get(), mode: f.mode.get(), targets: f.targets.get(), targetUnit: f.targetUnit.get(),
        serialFactor: useFactor ? f.serialFactor.get() : '', serialCount: useFactor ? f.serialCount.get() : '',
        Vstd: f.Vstd.get(), round: f.round.get(), useIntermediate: f.useIntermediate.get(), compensate: f.compensate.get(),
        substance: sel.substance, formula: sel.formula, M: f.M.get(), rhoSol: f.rhoSol.get(), z: f.z.get(),
      };
    },
    isBlank() { return isBlank(f.stock.get()) && isBlank(f.targets.get()) && isBlank(f.Vstd.get()); },
    highlight(R) { applyHighlights(fields, R); },
    getState() { return { ...collectState(fields), substance: f.substance.getState() }; },
    setState(st) { restoreState(fields, st); if (st) f.substance.setState(st.substance); toggle(); },
    describe() { return `Stamm ${f.stock.get().value} ${f.stock.get().unit}, ${f.mode.get() === 'serial' ? 'seriell' : 'parallel'}`; },
    substance() { return f.substance.get().substance; },
  };
}
