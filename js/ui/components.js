// Wiederverwendbare Eingabe-Bausteine.

(function () {
  'use strict';
  const { h, clear, ICONS } = VR.use('ui/dom.js');
  const { parseQuantity, UNIT_LISTS, KINDS, UnitError } = VR.use('core/units.js');
  const { formatNumber } = VR.use('core/numbers.js');
  const { tryParseFormula } = VR.use('core/formula.js');

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

function ensureOption(select, value) {
  if (![...select.options].some((o) => o.value === value)) select.append(h('option', { value }, value));
}

function plainNumber(v) {
  return String(Number(v.toPrecision(12))).replace('.', ',');
}

const UNIT_HAS_TEXT = (t) => /[a-zA-Zµμ%]/.test(t.replace(/[eE][+\-−]?\d+/, ''));

/** Gemeinsame Feld-API: Hervorhebung bei fehlender Angabe, Fehlerzustand. */
function fieldApi(wrap) {
  return {
    highlight(on) { wrap.classList.toggle('highlight', !!on); },
    invalid(on) { wrap.classList.toggle('invalid', !!on); },
    show(on) { wrap.classList.toggle('hidden', !on); },
  };
}

/**
 * Mengenfeld: Zahl (Freitext, auch "5 µg/mL") + Einheitenauswahl.
 * @returns {{el, get, set, input, select, highlight, invalid, show, setDisabled}}
 */
function quantityField({ name, label, kinds, units, unit, value = '', placeholder = '', help = '', textMode = false, onInput }) {
  const id = nextId(name || 'q');
  const list = units || kinds.flatMap((k) => UNIT_LISTS[k]);
  const input = h('input', {
    type: 'text', id, inputmode: textMode ? 'text' : 'decimal', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder, value,
  });
  const select = h('select', { class: 'unit', 'aria-label': `${label} – Einheit` }, list.map((u) => h('option', { value: u }, u)));
  select.value = unit && list.includes(unit) ? unit : list[0];
  if (unit && !list.includes(unit)) { ensureOption(select, unit); select.value = unit; }
  const parsed = h('div', { class: 'parsed', 'aria-live': 'polite' });
  const wrap = h('div', { class: 'field', dataset: { field: name } },
    h('label', { for: id }, label),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, input), select),
    parsed,
    help ? h('div', { class: 'help' }, help) : null);

  const fire = () => onInput && onInput();
  const sync = () => {
    clear(parsed);
    parsed.classList.remove('err');
    const t = input.value.trim();
    if (!t || !UNIT_HAS_TEXT(t)) return;
    try {
      const q = parseQuantity(t);
      if (q.unit) {
        if (kinds && !kinds.includes(q.unit.kind)) {
          parsed.classList.add('err');
          parsed.textContent = `„${q.unit.sym}“ passt hier nicht (${KINDS[q.unit.kind].label}).`;
          return;
        }
        ensureOption(select, q.unit.sym);
        select.value = q.unit.sym;
        parsed.textContent = `erkannt: ${formatNumber(q.value, 8)} ${q.unit.sym} – ${KINDS[q.unit.kind].label}`;
      }
    } catch (e) {
      parsed.classList.add('err');
      if (e instanceof UnitError && e.code === 'percent-ambiguous') {
        parsed.append('„%“ ist mehrdeutig – bitte wählen: ');
        for (const opt of e.options) {
          parsed.append(h('button', {
            type: 'button', class: 'btn small', style: { margin: '4px 4px 0 0' },
            onclick: () => {
              const num = t.replace(/%.*$/, '').trim();
              input.value = num;
              ensureOption(select, opt.sym);
              select.value = opt.sym;
              sync();
              fire();
            },
          }, opt.sym));
        }
      } else {
        parsed.textContent = e.message;
      }
    }
  };
  input.addEventListener('input', () => { sync(); fire(); });
  select.addEventListener('change', () => {
    // Wählt man eine Einheit aus, gilt sie – eine eingetippte Einheit wird entfernt.
    const t = input.value.trim();
    if (t && UNIT_HAS_TEXT(t)) {
      try {
        const q = parseQuantity(t);
        input.value = plainNumber(q.value);
      } catch { /* Eingabe bleibt */ }
    }
    sync();
    fire();
  });
  return {
    el: wrap, input, select,
    get: () => ({ value: input.value, unit: select.value }),
    set: (v) => {
      input.value = v && v.value !== undefined ? v.value : '';
      if (v && v.unit) { ensureOption(select, v.unit); select.value = v.unit; }
      sync();
    },
    setDisabled(on, text = 'wird berechnet') {
      input.disabled = !!on;
      input.placeholder = on ? text : placeholder;
      if (on) input.value = '';
    },
    ...fieldApi(wrap),
  };
}

/** Zahlenfeld mit Einheit als Text (z. B. "%", "g/mL"). */
function numberField({ name, label, value = '', suffix = '', placeholder = '', help = '', onInput, integer = false }) {
  const id = nextId(name || 'n');
  const input = h('input', { type: 'text', id, inputmode: integer ? 'numeric' : 'decimal', autocomplete: 'off', placeholder, value });
  const wrap = h('div', { class: 'field', dataset: { field: name } },
    h('label', { for: id }, label + (suffix ? ` (${suffix})` : '')),
    input,
    help ? h('div', { class: 'help' }, help) : null);
  input.addEventListener('input', () => onInput && onInput());
  return {
    el: wrap, input,
    get: () => input.value,
    set: (v) => { input.value = v ?? ''; },
    setPlaceholder: (p) => { input.placeholder = p; },
    ...fieldApi(wrap),
  };
}

function textField({ name, label, value = '', placeholder = '', help = '', onInput, multiline = false, inputmode = 'text' }) {
  const id = nextId(name || 't');
  const input = multiline
    ? h('textarea', { id, placeholder, rows: 3, autocapitalize: 'off', spellcheck: 'false', inputmode }, value)
    : h('input', { type: 'text', id, placeholder, value, autocomplete: 'off', inputmode });
  const wrap = h('div', { class: 'field', dataset: { field: name } }, h('label', { for: id }, label), input, help ? h('div', { class: 'help' }, help) : null);
  input.addEventListener('input', () => onInput && onInput());
  return { el: wrap, input, get: () => input.value, set: (v) => { input.value = v ?? ''; }, ...fieldApi(wrap) };
}

function selectField({ name, label, options, value, onInput, help = '' }) {
  const id = nextId(name || 's');
  const select = h('select', { id }, options.map((o) => h('option', { value: o.value }, o.label)));
  if (value !== undefined) select.value = value;
  const wrap = h('div', { class: 'field', dataset: { field: name } }, h('label', { for: id }, label), select, help ? h('div', { class: 'help' }, help) : null);
  select.addEventListener('change', () => onInput && onInput());
  return { el: wrap, select, get: () => select.value, set: (v) => { if (v !== undefined && v !== null) select.value = v; }, ...fieldApi(wrap) };
}

/** Umschalter mit mehreren Optionen. */
function segmented({ name, label, options, value, onInput }) {
  let current = value ?? options[0].value;
  const buttons = options.map((o) => h('button', {
    type: 'button', 'aria-pressed': String(o.value === current),
    onclick: () => { set(o.value); if (onInput) onInput(); },
  }, o.label));
  const set = (v) => {
    current = v;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
  };
  const wrap = h('div', { class: 'field', dataset: { field: name } },
    label ? h('div', { class: 'label' }, label) : null,
    h('div', { class: 'seg', role: 'group', 'aria-label': label || name }, buttons));
  return { el: wrap, get: () => current, set, ...fieldApi(wrap) };
}

function checkField({ name, label, checked = false, onInput }) {
  const input = h('input', { type: 'checkbox', checked });
  const wrap = h('div', { class: 'field', dataset: { field: name } }, h('label', { class: 'check' }, input, h('span', {}, label)));
  input.addEventListener('change', () => onInput && onInput());
  return { el: wrap, input, get: () => input.checked, set: (v) => { input.checked = !!v; }, ...fieldApi(wrap) };
}

/** Aufklappbarer Bereich "Weitere Angaben". */
function moreSection(title, children, open = false) {
  const d = h('details', { class: 'more', open }, h('summary', {}, title), h('div', { class: 'inner' }, children));
  return d;
}

function fmtM(m) {
  return m ? `${formatNumber(m, 6)} g/mol` : 'M unbekannt';
}

/**
 * Stoffauswahl mit Autovervollständigung. Mehrdeutige Namen (z. B. "EDTA")
 * zeigen alle Varianten mit Formel und Molarer Masse.
 * Alternativ kann direkt eine Summenformel eingegeben werden.
 */
function substancePicker({ name = 'substance', label = 'Stoff', db, onInput, placeholder = 'Name, Formel oder CAS-Nummer …', help = '' }) {
  const id = nextId(name);
  let selected = null; // {substance} | {formula}
  const input = h('input', { type: 'search', id, placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const listEl = h('div', { class: 'picker-list hidden', role: 'listbox' });
  const chip = h('div', { class: 'hidden' });
  const box = h('div', { class: 'picker' }, input, listEl);
  const wrap = h('div', { class: 'field', dataset: { field: name } }, h('label', { for: id }, label), box, chip, help ? h('div', { class: 'help' }, help) : null);

  const closeList = () => listEl.classList.add('hidden');
  const choose = (sel) => {
    selected = sel;
    input.value = '';
    closeList();
    renderChip();
    if (onInput) onInput();
  };
  const renderChip = () => {
    clear(chip);
    if (!selected) {
      chip.className = 'hidden';
      box.classList.remove('hidden');
      return;
    }
    box.classList.add('hidden');
    chip.className = 'chip-sel';
    let nm; let meta;
    if (selected.substance) {
      const s = selected.substance;
      nm = [s.name, ' ', h('span', { class: 'fm' }, s.pretty || s.formula || '')];
      const bits = [fmtM(s.mw)];
      if (s.purity !== undefined) bits.push(`${formatNumber(s.purity, 4)} %`);
      if (s.density) bits.push(`ρ ${formatNumber(s.density, 4)} g/mL`);
      if (s.cas) bits.push(`CAS ${s.cas}`);
      meta = bits.join(' · ');
    } else {
      const r = tryParseFormula(selected.formula);
      nm = ['Formel ', h('span', { class: 'fm' }, r.ok ? r.pretty : selected.formula)];
      meta = r.ok ? fmtM(r.molarMass) : r.error;
    }
    chip.append(
      h('div', { class: 'txt' }, h('div', { class: 'nm' }, nm), h('div', { class: 'meta' }, meta)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Auswahl entfernen', html: ICONS.close, onclick: () => { selected = null; renderChip(); input.focus(); if (onInput) onInput(); } }),
    );
  };
  const renderList = () => {
    const q = input.value.trim();
    clear(listEl);
    if (!q) { closeList(); return; }
    const items = [];
    const res = db.search(q, { limit: 15 });
    const fr = /[A-Z]/.test(q) && !/\s/.test(q) ? tryParseFormula(q) : { ok: false };
    const formulaItem = fr.ok
      ? h('button', { type: 'button', class: 'picker-item', onpointerdown: (e) => { e.preventDefault(); choose({ formula: q }); } },
        h('span', { class: 'nm' }, 'Formel verwenden'), h('span', { class: 'fm' }, fr.pretty),
        h('span', { class: 'meta' }, `${fmtM(fr.molarMass)}${fr.notes.length ? ` · ${fr.notes[0]}` : ''}`))
      : null;
    // Exakter Datenbanktreffer mit anderer Zusammensetzung geht vor
    // (z. B. "PFOS" = Perfluoroctansulfonsäure, nicht die Formel P-F-O-S)
    const exactDb = fr.ok && res.some((r) => r.score >= 92 && r.entry.hill !== fr.hill);
    if (formulaItem && !exactDb) items.push(formulaItem);
    const top = res.filter((r) => r.score >= 92);
    if (top.length > 1 && top.some((r) => r.match === 'Alias')) {
      items.push(h('div', { class: 'picker-group' }, `„${q}“ ist mehrdeutig – ${top.length} Varianten:`));
    }
    for (const r of res) {
      const s = r.entry;
      const meta = [s.cat, s.cas ? `CAS ${s.cas}` : null, s.purity !== undefined && s.purity < 100 ? `${formatNumber(s.purity, 4)} %` : null, s.density ? `ρ ${formatNumber(s.density, 4)}` : null, r.match !== 'Name' ? `Treffer: ${r.match}` : null].filter(Boolean).join(' · ');
      items.push(h('button', { type: 'button', class: 'picker-item', role: 'option', onpointerdown: (e) => { e.preventDefault(); choose({ substance: s }); } },
        h('span', { class: 'nm' }, s.name), h('span', { class: 'fm' }, `${s.pretty || s.formula || ''}`),
        h('span', { class: 'meta' }, `${fmtM(s.mw)}${meta ? ` · ${meta}` : ''}`)));
    }
    if (formulaItem && exactDb) items.push(formulaItem);
    if (!items.length) items.push(h('div', { class: 'picker-item', style: { cursor: 'default' } }, h('span', { class: 'meta' }, 'Kein Treffer. Formel mit Großbuchstaben eingeben (z. B. C8HF15O2) oder Stoff in der Datenbank anlegen.')));
    listEl.append(...items);
    listEl.classList.remove('hidden');
  };
  input.addEventListener('input', renderList);
  input.addEventListener('focus', renderList);
  input.addEventListener('blur', () => setTimeout(closeList, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = listEl.querySelector('.picker-item');
      if (first) first.dispatchEvent(new PointerEvent('pointerdown'));
    }
  });

  return {
    el: wrap,
    get: () => ({ substance: selected?.substance ? db.get(selected.substance.id) || selected.substance : null, formula: selected?.formula || null }),
    getState: () => (selected?.substance ? { id: selected.substance.id } : selected?.formula ? { formula: selected.formula } : null),
    setState: (st) => {
      selected = null;
      if (st && st.id) {
        const s = db.get(st.id);
        if (s) selected = { substance: s };
      } else if (st && st.formula) selected = { formula: st.formula };
      renderChip();
    },
    ...fieldApi(wrap),
  };
}

/**
 * Liste weiterer Stoffe (＋) für Formulare, in denen eine Lösung mehrere
 * gelöste Stoffe enthält. Jede Zeile: Stoffauswahl + frei definierbare Felder.
 * @param {object} o
 *   db, onChange, textMode
 *   fields    [{key, type:'quantity'|'number', label, kinds, units, unit, placeholder, suffix}]
 *   template  () => Startwerte einer neuen Zeile, z. B. {conc: {value:'', unit:'µM'}}
 *   addLabel  Beschriftung des ＋-Knopfs
 *   firstNr   Nummer der ersten weiteren Zeile (Standard 2)
 *   onCount   (anzahl) => void – z. B. um "Stoff 1" einzublenden
 */
function extraSubstanceList({ db, onChange, textMode, fields, template = () => ({}), addLabel = 'Weiteren Stoff hinzufügen', firstNr = 2, onCount, rowTitle = 'Stoff' }) {
  let rows = [];
  const list = h('div');
  const renumber = () => {
    rows.forEach((r, i) => { r.title.textContent = `${rowTitle} ${i + firstNr}`; });
    if (onCount) onCount(rows.length);
  };
  const createRow = (state) => {
    const r = { f: {} };
    r.picker = substancePicker({ name: 'formula', label: 'Stoff (Name, Formel oder CAS)', db, onInput: onChange });
    for (const fd of fields) {
      r.f[fd.key] = fd.type === 'number'
        ? numberField({ name: fd.key, label: fd.label, suffix: fd.suffix || '', placeholder: fd.placeholder || '', onInput: onChange })
        : quantityField({ name: fd.key, label: fd.label, kinds: fd.kinds, units: fd.units, unit: fd.unit, placeholder: fd.placeholder || '', textMode, onInput: onChange });
    }
    r.title = h('strong', { class: 'grow' }, rowTitle);
    const grid = h('div', {}, Object.values(r.f).map((x) => x.el));
    r.el = h('div', { class: 'comp' },
      h('div', { class: 'row', style: { alignItems: 'center', marginBottom: '8px' } }, r.title,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${rowTitle} entfernen`, html: ICONS.trash, onclick: () => remove(r) })),
      r.picker.el, grid);
    const st = state || template();
    if (st.substance) r.picker.setState(st.substance);
    for (const fd of fields) if (st[fd.key] !== undefined) r.f[fd.key].set(st[fd.key]);
    return r;
  };
  const add = (state = null) => {
    const r = createRow(state);
    rows.push(r);
    list.append(r.el);
    renumber();
    return r;
  };
  const remove = (r) => {
    rows = rows.filter((x) => x !== r);
    r.el.remove();
    renumber();
    onChange();
  };
  const button = h('button', {
    type: 'button', class: 'btn add-btn', 'aria-label': addLabel,
    onclick: () => {
      const r = add();
      r.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const i = r.el.querySelector('input');
      if (i) i.focus();
      onChange();
    },
  }, h('span', { html: ICONS.plus, style: { display: 'contents' } }), addLabel);
  const el = h('div', {}, list, button);
  return {
    el,
    collect() {
      return rows.map((r) => {
        const sel = r.picker.get();
        const out = { substance: sel.substance, formula: sel.formula };
        for (const fd of fields) out[fd.key] = r.f[fd.key].get();
        return out;
      });
    },
    getState() {
      return rows.map((r) => {
        const out = { substance: r.picker.getState() };
        for (const fd of fields) out[fd.key] = r.f[fd.key].get();
        return out;
      });
    },
    setState(states) {
      rows.forEach((r) => r.el.remove());
      rows = [];
      (Array.isArray(states) ? states : []).forEach((s) => add(s));
      renumber();
    },
    names() {
      return rows.map((r) => { const s = r.picker.get(); return s.substance ? s.substance.name : s.formula || ''; }).filter(Boolean);
    },
    count() { return rows.length; },
    show(on) { el.classList.toggle('hidden', !on); },
  };
}

  VR.provide('ui/components.js', { quantityField, numberField, textField, selectField, segmented, checkField, moreSection, substancePicker, extraSubstanceList });
}());
