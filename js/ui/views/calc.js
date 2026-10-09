// Ansicht "Rechner": Tabs für die Modi A–F, Formular, Ergebnis.

import { h, clear, debounce, toast, ICONS } from '../dom.js';
import { MODES, MODE_BY_ID } from '../../core/modes/index.js';
import { renderResult, emptyResult } from '../result-view.js';
import { resultToText } from '../../core/export.js';
import { createForm as formEinwaage } from '../forms/einwaage.js';
import { createForm as formVerduennung } from '../forms/verduennung.js';
import { createForm as formKonzentriert } from '../forms/konzentriert.js';
import { createForm as formReihe } from '../forms/reihe.js';
import { createForm as formUmrechner } from '../forms/umrechner.js';
import { createForm as formIstd } from '../forms/istd.js';
import { createForm as formMischung } from '../forms/mischung.js';

const FORMS = {
  einwaage: formEinwaage,
  verduennung: formVerduennung,
  konzentriert: formKonzentriert,
  reihe: formReihe,
  umrechner: formUmrechner,
  istd: formIstd,
  mischung: formMischung,
};

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/**
 * @param {HTMLElement} root
 * @param {object} app  App-Kontext (storage, db, settings, hooks)
 * @param {string} modeId
 */
export function renderCalc(root, app, modeId) {
  const mode = MODE_BY_ID[modeId] || MODES[0];
  const tabs = h('div', { class: 'mode-tabs', role: 'tablist', 'aria-label': 'Rechenmodus' },
    MODES.map((m) => h('button', {
      type: 'button', class: 'mode-tab', role: 'tab', 'aria-selected': String(m.id === mode.id),
      onclick: () => app.go(`#rechner/${m.id}`),
    }, h('span', { class: 'key' }, m.key), m.label)));
  const resultHost = h('div');
  let current = null;

  const metaFor = () => ({ title: mode.title, sig: app.settings.sig, inputs: [form.describe()].filter(Boolean) });
  const actions = () => {
    const list = [
      { label: 'Kopieren', icon: ICONS.copy, onClick: async () => { const ok = await copyText(resultToText(current, metaFor())); toast(ok ? 'Rechenweg kopiert – im Laborjournal einfügen.' : 'Kopieren nicht möglich.'); } },
    ];
    if (navigator.share) {
      list.push({ label: 'Teilen', icon: ICONS.share, onClick: () => navigator.share({ title: `Verdünnungsrechner – ${mode.title}`, text: resultToText(current, metaFor()) }).catch(() => {}) });
    }
    for (const a of app.hooks.resultActions || []) {
      if (a.when && !a.when({ R: current, mode })) continue;
      list.push({ label: a.label, icon: a.icon, onClick: () => a.onClick({ R: current, mode, form, meta: metaFor() }) });
    }
    return list;
  };

  const compute = () => {
    app.storage.set(`form.${mode.id}`, form.getState());
    clear(resultHost);
    if (form.isBlank()) {
      form.highlight({ ok: true, missing: [] });
      current = null;
      resultHost.append(emptyResult());
      return;
    }
    let R = mode.calc(form.collect(), app.settings);
    if (app.hooks.afterCalc) R = app.hooks.afterCalc(R, { mode, form }) || R;
    current = R;
    form.highlight(R);
    const extra = app.hooks.resultExtra ? app.hooks.resultExtra(R, { mode, form }) : [];
    resultHost.append(renderResult(R, { sig: app.settings.sig, actions: R.ok ? actions() : [], extra }));
    if (app.hooks.onResult) app.hooks.onResult(R, { mode, form, meta: metaFor() });
  };
  const recompute = debounce(compute, 180);

  const form = FORMS[mode.id]({ db: app.db, settings: app.settings, onChange: recompute, textMode: app.settings.textKeyboard });
  form.setState(app.storage.get(`form.${mode.id}`));

  const reset = h('button', {
    type: 'button', class: 'btn small ghost no-print', style: { marginBottom: '10px' },
    onclick: () => { app.storage.remove(`form.${mode.id}`); app.rerender(); },
  }, 'Formular leeren');

  root.append(tabs, form.el, reset, resultHost);
  compute();
  const sel = tabs.querySelector('[aria-selected="true"]');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  return { mode, form, recompute: () => compute() };
}
