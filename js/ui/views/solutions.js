// Ansicht "Lösungen": hergestellte Lösungen mit Ampel nach Ablaufdatum.

import { h, clear, debounce, toast, sheet, confirmBox, ICONS, todayISO, formatDate } from '../dom.js';
import { textField, numberField } from '../components.js';
import { addDays } from '../../core/expiry.js';
import { copyText } from './calc.js';

export function renderSolutions(root, app) {
  let filter = 'all';
  const search = h('input', { type: 'search', placeholder: 'Suchen: Name, Konzentration, Lösungsmittel …', autocomplete: 'off' });
  const filters = h('div', { class: 'filters' });
  const listEl = h('ul', { class: 'list' });

  const renderFilters = () => {
    clear(filters);
    const c = app.solutions.counts({ warnDays: app.settings.expiryWarnDays });
    const opts = [
      ['all', `Alle (${c.red + c.yellow + c.green + c.grey})`],
      ['expired', `abgelaufen (${c.red})`],
      ['soon', `läuft bald ab (${c.yellow})`],
      ['ok', `gültig (${c.green + c.grey})`],
    ];
    for (const [v, label] of opts) {
      filters.append(h('button', { type: 'button', class: 'filter', 'aria-pressed': String(filter === v), onclick: () => { filter = v; renderFilters(); renderList(); } }, label));
    }
  };
  const renderList = () => {
    clear(listEl);
    const items = app.solutions.list({ query: search.value, filter, warnDays: app.settings.expiryWarnDays });
    if (!items.length) {
      listEl.append(h('li', { class: 'empty-state' }, search.value || filter !== 'all'
        ? 'Keine passenden Lösungen.'
        : 'Noch keine Lösungen gespeichert. Mit „+“ anlegen – oder im Rechner unter einem Ergebnis „Als Lösung speichern“.'));
      return;
    }
    for (const s of items) {
      listEl.append(h('li', {}, h('button', { type: 'button', class: 'list-item', onclick: () => openSolutionEditor(app, s, refresh) },
        h('span', { class: `dot ${s.status.color}`, title: s.status.text, 'aria-label': s.status.text }),
        h('div', { class: 'txt' },
          h('div', { class: 'nm' }, s.name),
          h('div', { class: 'meta' }, [s.conc, s.solvent, s.location].filter(Boolean).join(' · ') || '–'),
          h('div', { class: 'meta' }, s.status.text)),
        h('div', { class: 'side' }, s.made ? `hergest. ${formatDate(s.made)}` : ''))));
    }
  };
  const refresh = () => { renderFilters(); renderList(); };
  search.addEventListener('input', debounce(renderList, 120));
  root.append(
    h('div', { class: 'searchbar' }, search, filters),
    listEl,
    h('button', { type: 'button', class: 'fab', 'aria-label': 'Neue Lösung', html: ICONS.plus, onclick: () => openSolutionEditor(app, null, refresh) }),
  );
  refresh();
}

/** Etikett-Text für eine Lösung. */
export function labelText(s) {
  return [s.name, s.conc && `Konz.: ${s.conc}`, s.solvent && `in ${s.solvent}`, s.made && `hergestellt: ${formatDate(s.made)}${s.by ? ` (${s.by})` : ''}`, s.expires && `verwendbar bis: ${formatDate(s.expires)}`]
    .filter(Boolean).join('\n');
}

/**
 * Lösung anlegen/bearbeiten. `prefill` füllt ein neues Formular vor
 * (z. B. aus einer Berechnung).
 */
export function openSolutionEditor(app, solution, onSaved, prefill = null) {
  const isNew = !solution;
  const s = solution || { made: todayISO(), ...(prefill || {}) };
  const sh = sheet(isNew ? 'Neue Lösung' : 'Lösung bearbeiten');
  const f = {};
  f.name = textField({ name: 'name', label: 'Name / Bezeichnung *', value: s.name || '', placeholder: 'z. B. NaCl 0,1 M' });
  f.conc = textField({ name: 'conc', label: 'Konzentration', value: s.conc || '', placeholder: 'z. B. 0,1 mol/L' });
  f.substance = textField({ name: 'substance', label: 'Stoff', value: s.substance || '' });
  f.solvent = textField({ name: 'solvent', label: 'Lösungsmittel', value: s.solvent || '', placeholder: 'z. B. Reinstwasser, Methanol' });
  f.made = textField({ name: 'made', label: 'Hergestellt am', value: s.made || '' });
  f.made.input.type = 'date';
  f.expires = textField({ name: 'expires', label: 'Haltbar bis', value: s.expires || '' });
  f.expires.input.type = 'date';
  f.by = textField({ name: 'by', label: 'Hergestellt von', value: s.by || '', placeholder: 'Kürzel' });
  f.location = textField({ name: 'location', label: 'Lagerort', value: s.location || '', placeholder: 'z. B. Kühlschrank 2' });
  f.notes = textField({ name: 'notes', label: 'Notizen', value: s.notes || '', multiline: true });
  const days = numberField({ name: 'days', label: 'Haltbarkeit (Tage ab Herstellung)', integer: true });
  days.input.addEventListener('input', () => {
    const n = Number(days.get());
    if (n > 0 && f.made.get()) f.expires.set(addDays(f.made.get(), n));
  });
  const quick = h('div', { class: 'btn-row', style: { marginTop: '-4px', marginBottom: '12px' } },
    [['+1 Woche', 7], ['+1 Monat', 30], ['+3 Monate', 91], ['+6 Monate', 182], ['+1 Jahr', 365]].map(([label, n]) => h('button', {
      type: 'button', class: 'btn small', onclick: () => { f.expires.set(addDays(f.made.get() || todayISO(), n)); days.set(String(n)); },
    }, label)));
  const msgBox = h('div');

  const collect = () => ({
    name: f.name.get(), conc: f.conc.get(), substance: f.substance.get(), solvent: f.solvent.get(), made: f.made.get(),
    expires: f.expires.get(), by: f.by.get(), location: f.location.get(), notes: f.notes.get(), calc: s.calc || '',
  });
  const save = () => {
    clear(msgBox);
    try {
      const saved = isNew ? app.solutions.add(collect()) : app.solutions.update(solution.id, collect());
      toast(isNew ? `„${saved.name}“ gespeichert.` : 'Gespeichert.');
      sh.close();
      if (onSaved) onSaved(saved);
    } catch (e) {
      msgBox.append(h('div', { class: 'msg error' }, h('div', {}, e.message)));
    }
  };
  const buttons = h('div', { class: 'btn-row', style: { marginTop: '12px' } },
    h('button', { type: 'button', class: 'btn primary', onclick: save }, h('span', { html: ICONS.save, style: { display: 'contents' } }), 'Speichern'),
    h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await copyText(labelText(collect())); toast(ok ? 'Etikett-Text kopiert.' : 'Kopieren nicht möglich.'); } }, 'Etikett kopieren'));
  if (!isNew) {
    buttons.append(h('button', {
      type: 'button', class: 'btn danger', onclick: () => {
        if (!confirmBox(`„${solution.name}“ löschen?`)) return;
        app.solutions.remove(solution.id);
        toast('Gelöscht.');
        sh.close();
        if (onSaved) onSaved();
      },
    }, h('span', { html: ICONS.trash, style: { display: 'contents' } }), 'Löschen'));
  }
  sh.body.append(
    h('div', { class: 'card' }, f.name.el, h('div', { class: 'grid2' }, f.conc.el, f.substance.el), f.solvent.el),
    h('div', { class: 'card' }, h('div', { class: 'grid2' }, f.made.el, f.expires.el), quick, days.el, h('div', { class: 'grid2' }, f.by.el, f.location.el), f.notes.el),
    s.calc ? h('details', { class: 'more card' }, h('summary', {}, 'Rechenweg der Herstellung'), h('pre', { class: 'mono small', style: { whiteSpace: 'pre-wrap', margin: 0 } }, s.calc)) : null,
    msgBox, buttons,
  );
}
