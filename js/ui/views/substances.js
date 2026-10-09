// Ansicht "Stoffe": Suche, Liste, Bearbeiten, Anlegen, PubChem-Abfrage.

import { h, clear, debounce, toast, sheet, confirmBox, ICONS, formatDate } from '../dom.js';
import { CATEGORIES, validateCAS, validateSubstance, cleanEntry } from '../../core/substance-db.js';
import { tryParseFormula } from '../../core/formula.js';
import { formatNumber } from '../../core/numbers.js';
import { lookupPubChem } from '../../core/pubchem.js';
import { textField, numberField, selectField, segmented } from '../components.js';
import { expiryStatus } from '../../core/expiry.js';

const PAGE = 60;

function fmtM(m) {
  return m ? `${formatNumber(m, 6)} g/mol` : '–';
}

export function renderSubstances(root, app) {
  let category = null;
  let limit = PAGE;
  const search = h('input', { type: 'search', placeholder: 'Suchen: Name, Alias, Formel, CAS …', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const filters = h('div', { class: 'filters' });
  const listEl = h('ul', { class: 'list' });
  const info = h('div', { class: 'small muted', style: { margin: '4px 2px 10px' } });

  const renderFilters = () => {
    clear(filters);
    const counts = {};
    app.db.list().forEach((e) => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
    filters.append(h('button', { type: 'button', class: 'filter', 'aria-pressed': String(!category), onclick: () => { category = null; renderFilters(); renderList(); } }, 'Alle'));
    CATEGORIES.filter((c) => counts[c]).forEach((c) => filters.append(h('button', {
      type: 'button', class: 'filter', 'aria-pressed': String(category === c),
      onclick: () => { category = category === c ? null : c; limit = PAGE; renderFilters(); renderList(); },
    }, `${c} (${counts[c]})`)));
  };

  const renderList = () => {
    clear(listEl);
    const q = search.value.trim();
    const results = q ? app.db.search(q, { limit: 200, category }).map((r) => r.entry) : app.db.list().filter((e) => !category || e.cat === category);
    info.textContent = `${results.length} ${results.length === 1 ? 'Stoff' : 'Stoffe'}${app.db.hiddenCount() ? ` · ${app.db.hiddenCount()} ausgeblendet` : ''}`;
    if (!results.length) {
      listEl.append(h('li', { class: 'empty-state' }, 'Nichts gefunden. Mit „+“ einen eigenen Stoff anlegen oder online bei PubChem suchen.'));
      return;
    }
    for (const e of results.slice(0, limit)) {
      const st = expiryStatus(e.expires, app.settings.expiryWarnDays);
      const meta = [e.cat, e.cas, e.purity !== undefined && e.purity < 100 ? `${formatNumber(e.purity, 4)} %` : null, e.density ? `ρ ${formatNumber(e.density, 4)}` : null].filter(Boolean).join(' · ');
      listEl.append(h('li', {}, h('button', { type: 'button', class: 'list-item', onclick: () => openEditor(app, e, refresh) },
        e.expires ? h('span', { class: `dot ${st.color}`, title: st.text }) : null,
        h('div', { class: 'txt' },
          h('div', { class: 'nm' }, e.name, e.source === 'user' ? h('span', { class: 'tag user' }, 'eigen') : null, e.modified ? h('span', { class: 'tag mod' }, 'geändert') : null),
          h('div', { class: 'meta' }, meta)),
        h('div', { class: 'side' }, h('div', { class: 'fm' }, e.pretty || e.formula || ''), h('div', {}, fmtM(e.mw))))));
    }
    if (results.length > limit) {
      listEl.append(h('li', {}, h('button', { type: 'button', class: 'btn', style: { width: '100%' }, onclick: () => { limit += PAGE; renderList(); } }, `Weitere ${Math.min(PAGE, results.length - limit)} anzeigen`)));
    }
  };
  const refresh = () => { renderFilters(); renderList(); };

  search.addEventListener('input', debounce(() => { limit = PAGE; renderList(); }, 120));
  root.append(
    h('div', { class: 'searchbar' }, search, filters),
    info,
    listEl,
    h('button', { type: 'button', class: 'fab', 'aria-label': 'Neuen Stoff anlegen', html: ICONS.plus, onclick: () => openEditor(app, null, refresh) }),
  );
  refresh();
}

/** Bearbeiten/Anlegen eines Stoffes im Overlay. */
export function openEditor(app, entry, onSaved) {
  const isNew = !entry;
  const sh = sheet(isNew ? 'Neuer Stoff' : 'Stoff bearbeiten');
  const e = entry || { name: '', aliases: [], formula: '', cas: '', cat: 'Sonstige', state: 's', notes: '' };
  const f = {};
  f.name = textField({ name: 'name', label: 'Name *', value: e.name });
  f.aliases = textField({ name: 'aliases', label: 'Aliase / Trivialnamen (mit Komma oder Semikolon trennen)', value: (e.aliases || []).join('; ') });
  f.formula = textField({ name: 'formula', label: 'Summenformel (Hydrate mit · oder .)', value: e.formula || '', placeholder: 'z. B. CuSO4·5H2O', inputmode: 'text' });
  const formulaInfo = h('div', { class: 'parsed' });
  f.formula.el.append(formulaInfo);
  f.cas = textField({ name: 'cas', label: 'CAS-Nummer', value: e.cas || '', placeholder: 'z. B. 7758-99-8', inputmode: 'text' });
  const casInfo = h('div', { class: 'parsed' });
  f.cas.el.append(casInfo);
  f.cat = selectField({ name: 'cat', label: 'Kategorie', options: CATEGORIES.map((c) => ({ value: c, label: c })), value: e.cat || 'Sonstige' });
  f.state = segmented({ name: 'state', label: 'Zustand', options: [{ value: 's', label: 'fest' }, { value: 'l', label: 'flüssig' }], value: e.state === 'l' ? 'l' : 's' });
  f.density = numberField({ name: 'density', label: 'Dichte (20 °C)', suffix: 'g/mL', value: e.density ?? '' });
  f.purity = numberField({ name: 'purity', label: 'Reinheit / Gehalt', suffix: '% (m/m)', value: e.purity ?? '', placeholder: '100' });
  f.z = numberField({ name: 'z', label: 'Wertigkeit z', value: e.z ?? '', help: 'Nur für Normalität; leer = reaktionsabhängig.' });
  f.molarMass = numberField({ name: 'molarMass', label: 'Molare Masse manuell', suffix: 'g/mol', value: e.molarMass ?? '', help: 'Überschreibt den aus der Formel berechneten Wert.' });
  f.opened = textField({ name: 'opened', label: 'Geöffnet am', value: e.opened || '' });
  f.opened.input.type = 'date';
  f.expires = textField({ name: 'expires', label: 'Haltbar bis', value: e.expires || '' });
  f.expires.input.type = 'date';
  f.notes = textField({ name: 'notes', label: 'Notizen', value: e.notes || '', multiline: true });
  const msgBox = h('div');

  const updateFormula = () => {
    const t = f.formula.get().trim();
    formulaInfo.classList.remove('err');
    if (!t) { formulaInfo.textContent = ''; return; }
    const r = tryParseFormula(t);
    if (r.ok) {
      formulaInfo.textContent = `${r.pretty} · M = ${formatNumber(r.molarMass, 7)} g/mol${r.waterCount ? ` (wasserfrei ${formatNumber(r.anhydrousMass, 7)})` : ''}${r.notes.length ? ` · ${r.notes.join(' ')}` : ''}`;
    } else {
      formulaInfo.textContent = r.error;
      formulaInfo.classList.add('err');
    }
  };
  const updateCas = () => {
    const c = validateCAS(f.cas.get());
    casInfo.classList.toggle('err', !c.valid);
    casInfo.textContent = c.valid ? (c.empty ? '' : 'Prüfziffer korrekt ✓') : c.error;
  };
  f.formula.input.addEventListener('input', updateFormula);
  f.cas.input.addEventListener('input', updateCas);
  updateFormula();
  updateCas();

  const collect = () => cleanEntry({
    name: f.name.get(), aliases: f.aliases.get(), formula: f.formula.get(), cas: f.cas.get(), cat: f.cat.get(), state: f.state.get(),
    density: f.density.get(), purity: f.purity.get(), z: f.z.get(), molarMass: f.molarMass.get(), opened: f.opened.get(), expires: f.expires.get(), notes: f.notes.get(),
  });

  const save = () => {
    clear(msgBox);
    const data = collect();
    const v = validateSubstance(data);
    if (v.errors.length) {
      msgBox.append(h('div', { class: 'msg error' }, h('div', {}, v.errors.join(' '))));
      return;
    }
    try {
      const saved = isNew ? app.db.add(data) : app.db.update(entry.id, data);
      toast(isNew ? `„${saved.name}“ angelegt.` : 'Gespeichert.');
      sh.close();
      if (onSaved) onSaved(saved);
    } catch (err) {
      msgBox.append(h('div', { class: 'msg error' }, h('div', {}, err.message)));
    }
  };

  // PubChem (nur mit Internet)
  const pcBox = h('div', { class: 'card' });
  const pcInput = h('input', { type: 'search', placeholder: 'Name oder CAS-Nummer (englisch/deutsch)', value: isNew ? '' : (entry.cas || entry.name) });
  const pcResults = h('div');
  const pcSearch = async () => {
    clear(pcResults);
    if (!navigator.onLine) {
      pcResults.append(h('div', { class: 'msg warn' }, h('div', {}, 'Keine Internetverbindung – die Online-Abfrage ist nicht möglich. Alles andere funktioniert weiter.')));
      return;
    }
    pcResults.append(h('div', { class: 'small muted' }, 'Suche bei PubChem …'));
    try {
      const res = await lookupPubChem(pcInput.value);
      clear(pcResults);
      for (const r of res) {
        const pr = tryParseFormula(r.formula);
        pcResults.append(h('div', { class: 'chip-sel', style: { marginTop: '8px' } },
          h('div', { class: 'txt' },
            h('div', { class: 'nm' }, r.title || r.iupac, ' ', h('span', { class: 'fm' }, pr.ok ? pr.pretty : r.formula)),
            h('div', { class: 'meta' }, `M = ${formatNumber(r.mw, 7)} g/mol (PubChem)${pr.ok ? ` · berechnet ${formatNumber(pr.molarMass, 7)}` : ''}${r.cas ? ` · CAS ${r.cas}` : ''} · CID ${r.cid}`),
            h('div', { class: 'meta' }, 'Bitte prüfen: Bei Hydraten/Salzen fasst PubChem die Formel zusammen (Hill-Notation).')),
          h('button', {
            type: 'button', class: 'btn small primary',
            onclick: () => {
              if (!f.name.get()) f.name.set(r.title || r.iupac);
              f.formula.set(r.formula);
              if (r.cas) f.cas.set(r.cas);
              const note = `Quelle: PubChem CID ${r.cid} (${new Date().toISOString().slice(0, 10)})`;
              if (!f.notes.get().includes('PubChem')) f.notes.set([f.notes.get(), note].filter(Boolean).join('\n'));
              if (!pr.ok) f.molarMass.set(String(r.mw).replace('.', ','));
              updateFormula();
              updateCas();
              toast('Übernommen – bitte prüfen und speichern.');
            },
          }, 'Übernehmen')));
      }
    } catch (err) {
      clear(pcResults);
      pcResults.append(h('div', { class: 'msg warn' }, h('div', {}, err.message)));
    }
  };
  pcBox.append(h('h2', {}, 'Online bei PubChem nachschlagen'), h('p', { class: 'sub' }, 'Optional, nur mit Internet. Das Ergebnis wird erst nach „Übernehmen“ und „Speichern“ lokal gespeichert.'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, pcInput), h('button', { type: 'button', class: 'btn', onclick: pcSearch, html: ICONS.cloud }, )), pcResults);

  const buttons = h('div', { class: 'btn-row', style: { marginTop: '12px' } },
    h('button', { type: 'button', class: 'btn primary', onclick: save }, h('span', { html: ICONS.save, style: { display: 'contents' } }), 'Speichern'));
  if (!isNew) {
    buttons.append(h('button', {
      type: 'button', class: 'btn', onclick: () => {
        const st = app.storage.get('form.einwaage') || {};
        app.storage.set('form.einwaage', { ...st, substance: { id: entry.id } });
        sh.close();
        app.go('#rechner/einwaage');
      },
    }, 'Im Rechner verwenden'));
    if (entry.source === 'seed' && entry.modified) {
      buttons.append(h('button', { type: 'button', class: 'btn', onclick: () => { app.db.restoreSeed(entry.id); toast('Originalwerte wiederhergestellt.'); sh.close(); if (onSaved) onSaved(); } }, 'Original wiederherstellen'));
    }
    buttons.append(h('button', {
      type: 'button', class: 'btn danger', onclick: () => {
        if (!confirmBox(`„${entry.name}“ löschen?${entry.source === 'seed' ? ' (Eintrag der Startliste wird ausgeblendet und kann in den Einstellungen wiederhergestellt werden.)' : ''}`)) return;
        app.db.remove(entry.id);
        toast('Gelöscht.');
        sh.close();
        if (onSaved) onSaved();
      },
    }, h('span', { html: ICONS.trash, style: { display: 'contents' } }), 'Löschen'));
  }

  const source = !isNew ? h('p', { class: 'small muted' }, entry.source === 'seed'
    ? `Eintrag der Startliste${entry.modified ? ' (von Ihnen geändert)' : ''}. Werte aus dem Gedächtnis eingetragen – bitte gegen Sicherheitsdatenblatt prüfen.`
    : 'Eigener Eintrag.', entry.opened ? ` Geöffnet am ${formatDate(entry.opened)}.` : '') : null;

  sh.body.append(
    source,
    h('div', { class: 'card' }, f.name.el, f.aliases.el, f.formula.el, f.cas.el, h('div', { class: 'grid2' }, f.cat.el, f.state.el)),
    h('div', { class: 'card' }, h('div', { class: 'grid2' }, f.density.el, f.purity.el), h('div', { class: 'grid2' }, f.z.el, f.molarMass.el), h('div', { class: 'grid2' }, f.opened.el, f.expires.el), f.notes.el),
    msgBox, buttons, h('hr', { class: 'sep' }), pcBox,
  );
  if (isNew) f.name.input.focus();
}
