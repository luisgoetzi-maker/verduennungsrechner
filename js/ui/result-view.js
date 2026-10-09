// Darstellung eines Rechenergebnisses: Hauptwert, Anleitung, Warnungen,
// Tabelle, Rechenweg, Aktionen.

(function () {
  'use strict';
  const { h, ICONS } = VR.use('ui/dom.js');
  const { formatNumber } = VR.use('core/numbers.js');
  const { formatAuto, PARAMS } = VR.use('core/units.js');
  const { seriesRows, mixRows } = VR.use('core/export.js');

function msg(level, text) {
  return h('div', { class: `msg ${level}` }, h('div', {}, text));
}

function stepItem(s) {
  if (s.text) return h('li', {}, s.label ? h('span', { class: 'lbl' }, s.label) : null, s.text);
  const parts = [];
  if (s.eq) parts.push(h('span', { class: 'eq' }, s.eq));
  if (s.sub) parts.push(parts.length ? ' = ' : '', h('span', { class: 'eq' }, s.sub));
  if (s.res) parts.push(parts.length ? ' = ' : '', h('span', { class: 'res' }, s.res));
  return h('li', {}, s.label ? h('span', { class: 'lbl' }, s.label) : null, parts);
}

function seriesTable(table, sig) {
  const { headers, rows } = seriesRows(table, sig);
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((cells, i) => {
        const r = table.rows[i];
        const cls = r.intermediate ? 'inter' : (r.notes && r.notes.length ? 'flag' : '');
        return h('tr', { class: cls }, cells.map((c, j) => h('td', { class: j === cells.length - 1 ? 'note' : '' }, c)));
      }))));
}

function mixTable(table) {
  const { headers, rows } = mixRows(table);
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'data mix' },
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((cells, i) => h('tr', { class: table.rows[i].notes.length ? 'flag' : '' },
        cells.map((c, j) => h('td', { class: j === cells.length - 1 ? 'note' : j === 4 ? 'amt' : '' }, c)))))));
}

function convertTable(table, sig) {
  const out = [];
  for (const g of table.groups) {
    if (!g.rows.length && !g.missing.length) continue;
    out.push(h('div', { class: 'group-title' }, g.label));
    if (g.rows.length) {
      out.push(h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('tbody', {},
        g.rows.map((r) => h('tr', { class: g.best && g.best.sym === r.unit.sym ? 'best' : '' },
          h('td', {}, r.unit.sym), h('td', {}, `${formatNumber(r.value, sig)}${r.assumed ? ' *' : ''}`)))))));
    }
    if (g.missing.length) {
      const which = g.missingUnits && g.missingUnits.length && g.rows.length ? ` (${g.missingUnits.map((u) => u.sym).join(', ')})` : '';
      out.push(h('div', { class: 'small muted' }, `Weitere Einheiten${which} brauchen: ${g.missing.map((p) => PARAMS[p]?.label || p).join(', ')}`));
    }
  }
  return out;
}

/**
 * @param {object} R Ergebnis
 * @param {{sig:number, actions?: Array<{label, icon, onClick}>, extra?: Node[]}} opts
 */
function renderResult(R, { sig = 4, actions = [], extra = [] } = {}) {
  const card = h('section', { class: 'card result', 'aria-live': 'polite' });
  if (!R.ok) {
    if (R.missing && R.missing.length) {
      card.append(h('div', { class: 'primary-label' }, 'Angabe fehlt'));
      card.append(msg('warn', `${R.error} Bitte im Formular ergänzen (Feld ist markiert).`));
    } else {
      card.append(h('div', { class: 'primary-label' }, 'Eingabe prüfen'));
      card.append(msg('error', R.error));
    }
    return card;
  }
  const primary = R.main.find((m) => m.primary) || R.main[0];
  if (primary) {
    card.append(h('div', { class: 'primary-label' }, primary.label));
    if (primary.text.length > 34) card.append(h('div', { class: 'summary' }, primary.text));
    else card.append(h('div', { class: 'primary-val' }, primary.text));
  }
  const others = R.main.filter((m) => m !== primary);
  if (others.length) {
    card.append(h('dl', { class: 'kv' }, others.flatMap((m) => [h('dt', {}, m.label), h('dd', {}, m.text)])));
  }
  if (R.instruction) card.append(h('div', { class: 'instruction' }, R.instruction));

  const practice = R.practice || {};
  const warnings = [...R.warnings, ...(practice.warnings || [])];
  warnings.forEach((w) => card.append(msg(w.level === 'error' ? 'error' : w.level === 'info' ? 'info' : 'warn', w.text)));
  if (practice.devices && practice.devices.length) {
    card.append(h('ul', { class: 'devices' }, practice.devices.map((d) => h('li', {}, h('span', { class: 'lbl' }, `${d.label}: `), d.text))));
  }

  if (R.table && R.table.type === 'series') card.append(seriesTable(R.table, sig));
  if (R.table && R.table.type === 'mix') card.append(mixTable(R.table));
  if (R.extraTable) {
    card.append(h('div', { class: 'group-title' }, R.extraTable.title));
    card.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data mix' },
      h('thead', {}, h('tr', {}, R.extraTable.headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, R.extraTable.rows.map((cells) => h('tr', {}, cells.map((c) => h('td', {}, c))))))));
  }
  if (R.table && R.table.type === 'convert') card.append(...convertTable(R.table, sig));

  R.hints.forEach((t) => card.append(msg('info', t)));

  card.append(...extra);

  if (R.steps.length) {
    card.append(h('details', { class: 'steps more', open: true },
      h('summary', {}, 'Rechenweg'),
      h('ol', {}, R.steps.map(stepItem))));
  }
  if (actions.length) {
    card.append(h('div', { class: 'actions no-print' }, actions.map((a) => h('button', { type: 'button', class: `btn small${a.primary ? ' primary' : ''}`, onclick: a.onClick },
      a.icon ? h('span', { html: a.icon, style: { display: 'contents' } }) : null, h('span', {}, a.label)))));
  }
  return card;
}

function emptyResult(text = 'Werte eingeben – das Ergebnis erscheint sofort.') {
  return h('section', { class: 'card result empty' }, text);
}

  VR.provide('ui/result-view.js', { formatAuto, ICONS, renderResult, emptyResult });
}());
