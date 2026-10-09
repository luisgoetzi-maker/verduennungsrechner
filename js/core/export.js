// Export einer Berechnung als Text (zum Einkleben ins Laborjournal).

(function () {
  'use strict';
  const { stepText } = VR.use('core/modes/common.js');
  const { formatNumber } = VR.use('core/numbers.js');
  const { formatAuto } = VR.use('core/units.js');

function pad(s, n, right = false) {
  const str = String(s);
  if (str.length >= n) return str;
  return right ? str.padStart(n) : str.padEnd(n);
}

/** Tabelle als Text mit festen Spaltenbreiten. */
function textTable(headers, rows, rightAlign = []) {
  const widths = headers.map((hd, i) => Math.max(String(hd).length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => cells.map((c, i) => pad(c ?? '', widths[i], rightAlign.includes(i))).join(' | ').trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('-+-'), ...rows.map(line)].join('\n');
}

/** Pipettierplan (Modus D) als Tabellenzeilen. */
function seriesRows(table, sig = 4) {
  const u = table.unit;
  const headers = ['Nr', `Ziel (${u})`, 'aus', 'pipett.', 'auf', `tats. (${u})`];
  if (table.mode === 'serial') headers.push('Rest');
  const withDevice = table.rows.some((r) => r.device);
  if (withDevice) headers.push('Gerät');
  headers.push('Hinweis');
  const rows = table.rows.map((r) => {
    const cells = [
      r.nr,
      formatNumber(r.target, sig),
      r.src,
      formatAuto(r.V, 'volume', sig),
      formatAuto(r.Vtot, 'volume', sig),
      formatNumber(r.actual, sig),
    ];
    if (table.mode === 'serial') cells.push(r.remaining !== undefined ? formatAuto(r.remaining, 'volume', sig) : '');
    if (withDevice) cells.push(r.device || '');
    cells.push((r.notes || []).join('; '));
    return cells;
  });
  return { headers, rows };
}

/** Mischstandard (Modus G) als Tabellenzeilen. */
function mixRows(table) {
  const withDevice = table.rows.some((r) => r.device);
  const headers = ['Nr', 'Stoff', 'Ziel', 'aus', 'abmessen', ...(withDevice ? ['Gerät'] : []), 'Hinweis'];
  const rows = table.rows.map((r) => [r.nr, r.name, r.target, r.source, r.amount, ...(withDevice ? [r.device || ''] : []), (r.notes || []).join('; ')]);
  return { headers, rows };
}

/**
 * @param {object} R Ergebnis eines Rechenmodus
 * @param {{title?:string, date?:Date|number, sig?:number, inputs?:string[]}} meta
 */
function resultToText(R, meta = {}) {
  const sig = meta.sig || 4;
  const out = [];
  const date = new Date(meta.date || Date.now());
  const ds = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  out.push(`Verdünnungsrechner – ${meta.title || 'Berechnung'}`);
  out.push(`Datum: ${ds}`);
  if (meta.inputs && meta.inputs.length) {
    out.push('');
    out.push('Eingaben:');
    meta.inputs.forEach((i) => out.push(`  ${i}`));
  }
  if (!R.ok) {
    out.push('');
    out.push(`Fehler: ${R.error}`);
    return out.join('\n');
  }
  if (R.main.length) {
    out.push('');
    out.push('Ergebnis:');
    R.main.forEach((m) => out.push(`  ${m.label}: ${m.text}`));
  }
  if (R.instruction) {
    out.push('');
    out.push(`Anleitung: ${R.instruction}`);
  }
  if (R.table && R.table.type === 'series') {
    const t = seriesRows(R.table, sig);
    out.push('');
    out.push('Pipettierplan:');
    out.push(textTable(t.headers, t.rows, [1, 3, 4, 5, 6]));
  }
  if (R.table && R.table.type === 'mix') {
    const t = mixRows(R.table);
    out.push('');
    out.push('Komponenten:');
    out.push(textTable(t.headers, t.rows));
  }
  if (R.extraTable) {
    out.push('');
    out.push(`${R.extraTable.title}:`);
    out.push(textTable(R.extraTable.headers, R.extraTable.rows));
  }
  if (R.table && R.table.type === 'convert') {
    out.push('');
    out.push('Alle Einheiten:');
    for (const g of R.table.groups) {
      if (!g.rows.length) continue;
      out.push(`  ${g.label}:`);
      g.rows.forEach((r) => out.push(`    ${pad(formatNumber(r.value, sig), 14, true)} ${r.unit.sym}${r.assumed ? ' *' : ''}`));
    }
  }
  if (R.practice && R.practice.devices && R.practice.devices.length) {
    out.push('');
    out.push('Geräte:');
    R.practice.devices.forEach((d) => out.push(`  ${d.label}: ${d.text}`));
  }
  if (R.steps.length) {
    out.push('');
    out.push('Rechenweg:');
    R.steps.forEach((s, i) => out.push(`  ${i + 1}. ${stepText(s)}`));
  }
  const warnings = [...R.warnings, ...((R.practice && R.practice.warnings) || [])];
  if (warnings.length) {
    out.push('');
    out.push('Warnungen:');
    warnings.forEach((w) => out.push(`  - ${w.text}`));
  }
  if (R.hints.length) {
    out.push('');
    out.push('Hinweise:');
    R.hints.forEach((h) => out.push(`  - ${h}`));
  }
  if (R.uncertaintyResult && R.uncertaintyResult.ok) {
    const u = R.uncertaintyResult;
    out.push('');
    out.push('Messunsicherheit (Abschätzung):');
    u.lines.forEach((l) => out.push(`  ${l}`));
  }
  return out.join('\n');
}

  VR.provide('core/export.js', { textTable, seriesRows, mixRows, resultToText });
}());
