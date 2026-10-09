// Ansicht "Verlauf": die letzten Berechnungen, wiederherstellen oder exportieren.

import { h, clear, toast, confirmBox, ICONS, formatDateTime } from '../dom.js';
import { MODE_BY_ID } from '../../core/modes/index.js';
import { copyText } from './calc.js';
import { downloadPdf } from '../pdf-export.js';

export function renderHistory(root, app) {
  const listEl = h('ul', { class: 'list' });
  const render = () => {
    clear(listEl);
    const items = app.history.list();
    if (!items.length) {
      listEl.append(h('li', { class: 'empty-state' }, 'Noch keine Berechnungen. Ergebnisse werden automatisch gespeichert, sobald sie ein paar Sekunden unverändert stehen.'));
      return;
    }
    for (const e of items) {
      const mode = MODE_BY_ID[e.mode];
      const restore = () => {
        app.storage.set(`form.${e.mode}`, e.state);
        app.go(`#rechner/${e.mode}`);
      };
      listEl.append(h('li', { class: 'card', style: { padding: '12px 14px' } },
        h('div', { class: 'row', style: { alignItems: 'center' } },
          h('span', { class: 'tag' }, mode ? `${mode.key} · ${mode.label}` : e.mode),
          h('span', { class: 'small muted grow', style: { textAlign: 'right' } }, formatDateTime(e.ts))),
        h('div', { style: { marginTop: '6px', fontWeight: 600 } }, e.result || ''),
        e.summary ? h('div', { class: 'small muted' }, e.summary) : null,
        h('div', { class: 'btn-row', style: { marginTop: '10px' } },
          h('button', { type: 'button', class: 'btn small primary', onclick: restore }, 'Öffnen'),
          h('button', { type: 'button', class: 'btn small', onclick: async () => { const ok = await copyText(e.text || ''); toast(ok ? 'Kopiert.' : 'Kopieren nicht möglich.'); } }, h('span', { html: ICONS.copy, style: { display: 'contents' } }), 'Text'),
          h('button', { type: 'button', class: 'btn small', onclick: () => downloadPdf(e.text || '', e.title || 'Berechnung', e.ts) }, h('span', { html: ICONS.pdf, style: { display: 'contents' } }), 'PDF'),
          h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Eintrag löschen', onclick: () => { app.history.remove(e.id); render(); } }, h('span', { html: ICONS.trash, style: { display: 'contents' } })))));
    }
  };
  root.append(
    h('div', { class: 'row', style: { alignItems: 'center', margin: '4px 0 12px' } },
      h('div', { class: 'grow small muted' }, `Die letzten ${app.settings.historyMax} Berechnungen (lokal gespeichert).`),
      h('button', { type: 'button', class: 'btn small danger', onclick: () => { if (confirmBox('Gesamten Verlauf löschen?')) { app.history.clear(); render(); } } }, 'Leeren')),
    listEl,
  );
  render();
}
