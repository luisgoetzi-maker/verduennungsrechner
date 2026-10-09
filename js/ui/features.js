// Praxisfunktionen (Etappe 3), werden vor dem Start in die App eingehängt:
//  - Plausibilitätswarnungen und Gerätevorschläge im Ergebnis
//  - Messunsicherheit (aufklappbar)
//  - Export als PDF / Drucken, "Als Lösung speichern"
//  - Lösungsverwaltung und Verlauf (eigene Ansichten)

(function () {
  'use strict';
  const { h, clear, toast, debounce, ICONS } = VR.use('ui/dom.js');
  const { evaluatePractice } = VR.use('core/practice.js');
  const { estimateUncertainty } = VR.use('core/uncertainty.js');
  const { resultToText } = VR.use('core/export.js');
  const { downloadPdf } = VR.use('ui/pdf-export.js');
  const { SolutionStore } = VR.use('core/solutions.js');
  const { HistoryStore } = VR.use('core/history.js');
  const { formatNumber } = VR.use('core/numbers.js');
  const { renderSolutions, openSolutionEditor } = VR.use('ui/views/solutions.js');
  const { renderHistory } = VR.use('ui/views/history.js');
  const { numberField } = VR.use('ui/components.js');

const pct = (x) => `${formatNumber(x * 100, 2)} %`;

/** Aufklappbarer Bereich "Messunsicherheit". */
function uncertaintyBlock(R, app) {
  if (!R.ok || !R.uncertainty) return [];
  const isWeighing = R.uncertainty.kind === 'weighing';
  const key = isWeighing ? 'unc.purity' : 'unc.stock';
  const input = numberField({
    name: 'unc', label: isWeighing ? 'Unsicherheit der Reinheit (Standardunsicherheit)' : 'Unsicherheit der Ausgangslösung (Standardunsicherheit)',
    suffix: '%', value: app.storage.get(key) ?? '', placeholder: '0 (z. B. aus dem Zertifikat)',
  });
  const out = h('div');
  const render = () => {
    clear(out);
    const v = Number(String(input.get()).replace(',', '.')) / 100;
    const urel = Number.isFinite(v) && v > 0 ? v : 0;
    app.storage.set(key, input.get());
    const res = estimateUncertainty(R.uncertainty, { settings: app.settings, stockUrel: isWeighing ? 0 : urel, purityUrel: isWeighing ? urel : 0 });
    R.uncertaintyResult = res;
    if (!res.ok) { out.append(h('div', { class: 'small muted' }, 'Keine Abschätzung möglich.')); return; }
    out.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Beitrag'), h('th', {}, 'Gerät / Annahme'), h('th', {}, 'u (rel.)'))),
      h('tbody', {}, res.rows.map((r) => h('tr', { class: r.alt ? 'inter' : '' }, h('td', {}, r.label), h('td', { style: { whiteSpace: 'normal', textAlign: 'left' } }, r.device), h('td', {}, pct(r.urel))))))));
    let abs = '';
    if (R.values && R.values.c2 && R.values.cUnit && R.uncertainty.kind === 'dilution') {
      abs = ` → c₂ = ${formatNumber(R.values.c2, app.settings.sig)} ± ${formatNumber(R.values.c2 * res.U, 2)} ${R.values.cUnit}`;
    }
    const label = res.perStandard ? 'ungünstigster Standard' : 'kombiniert';
    out.append(h('div', { class: 'msg info' }, h('div', {}, `${label}: u = ${pct(res.urel)}; erweiterte Unsicherheit U (k = 2, ca. 95 %) = ${pct(res.U)}${abs}`)));
    out.append(h('p', { class: 'small muted' }, 'Abschätzung nur aus Gerätetoleranzen (Klasse A, ISO 8655) als Rechteckverteilung; Temperatur, Bedienung, Reinheit/Molare Masse nicht enthalten, sofern nicht angegeben.'));
  };
  input.input.addEventListener('input', debounce(render, 200));
  render();
  return [h('details', { class: 'more', style: { marginTop: '10px' } }, h('summary', {}, 'Messunsicherheit (Abschätzung)'), h('div', { class: 'inner' }, input.el, out))];
}

/** Vorbelegung für "Als Lösung speichern". */
function solutionPrefill(R, mode, form, meta) {
  const input = form.collect();
  const sub = form.substance ? form.substance() : null;
  const qText = (q) => {
    if (!q) return '';
    const v = String(q.value ?? q).trim();
    return /[a-zA-Zµ%]/.test(v.replace(/e[+-]?\d/i, '')) ? v : `${v} ${q.unit || ''}`.trim();
  };
  let conc = '';
  if (mode.id === 'einwaage' || mode.id === 'konzentriert') conc = qText(input.conc);
  if (mode.id === 'verduennung' && R.values) conc = `${formatNumber(R.values.c2, 4)} ${R.values.cUnit}`;
  if (R.table && R.table.type === 'mix' && R.values) {
    conc = R.values.components.map((c) => `${c.name} ${c.target}`).join('; ');
    return { name: `Mischstandard (${R.values.components.map((c) => c.name).join(', ')})`.slice(0, 120), conc, substance: '', calc: resultToText(R, meta) };
  }
  const name = [sub ? sub.name : (input.formula || ''), conc].filter(Boolean).join(' ');
  return { name, conc, substance: sub ? sub.name : (input.formula || ''), calc: resultToText(R, meta) };
}

function install(app) {
  app.solutions = new SolutionStore(app.storage);
  app.history = new HistoryStore(app.storage, app.settings.historyMax);
  app.views.loesungen = renderSolutions;
  app.views.verlauf = renderHistory;
  app.nav = [
    { hash: '#rechner', label: 'Rechner', icon: ICONS.calc },
    { hash: '#stoffe', label: 'Stoffe', icon: ICONS.flask },
    { hash: '#loesungen', label: 'Lösungen', icon: ICONS.bottle },
    { hash: '#verlauf', label: 'Verlauf', icon: ICONS.history },
    { hash: '#einstellungen', label: 'Mehr', icon: ICONS.settings },
  ];

  app.hooks.afterCalc = (R) => {
    if (R.ok) R.practice = evaluatePractice(R, app.settings);
    return R;
  };
  app.hooks.resultExtra = (R) => uncertaintyBlock(R, app);
  app.hooks.resultActions = [
    { label: 'PDF', icon: ICONS.pdf, onClick: ({ R, meta }) => downloadPdf(resultToText(R, meta), meta.title) },
    { label: 'Drucken', icon: ICONS.print, onClick: () => window.print() },
    {
      label: 'Als Lösung speichern', icon: ICONS.bottle,
      when: ({ R, mode }) => ['einwaage', 'verduennung', 'mischung'].includes(mode.id) || (mode.id === 'konzentriert' && !!R.instruction),
      onClick: ({ R, mode, form, meta }) => {
        openSolutionEditor(app, null, () => toast('Lösung gespeichert – siehe „Lösungen“.'), solutionPrefill(R, mode, form, meta));
      },
    },
  ];

  // Verlauf: speichern, wenn ein Ergebnis 2,5 s unverändert stehen bleibt
  let session = 1;
  let lastMode = null;
  window.addEventListener('hashchange', () => { session++; });
  const save = debounce(({ R, mode, form, meta }) => {
    if (!R.ok || !app.history) return;
    if (mode.id !== lastMode) { session++; lastMode = mode.id; }
    const primary = R.main.find((m) => m.primary) || R.main[0];
    app.history.add({
      mode: mode.id, title: mode.title, summary: form.describe(), result: primary ? `${primary.label}: ${primary.text}` : '',
      state: form.getState(), text: resultToText(R, meta), session: `${mode.id}-${session}`,
    });
  }, 2500);
  app.hooks.onResult = (R, ctx) => save({ R, ...ctx });

  // Hinweis auf abgelaufene Lösungen beim Start
  const c = app.solutions.counts({ warnDays: app.settings.expiryWarnDays });
  if (c.red) setTimeout(() => toast(`${c.red} ${c.red === 1 ? 'Lösung ist' : 'Lösungen sind'} abgelaufen – siehe „Lösungen“.`, 4000), 800);
}

  VR.provide('ui/features.js', { install });
}());
