// Minimaler PDF-Erzeuger (ohne Bibliotheken) für den Export ins Laborjournal.
// Schrift: Courier (Standardschrift jedes PDF-Betrachters, feste Zeichenbreite,
// daher bleiben Tabellen ausgerichtet). Zeichensatz: WinAnsi – Zeichen
// außerhalb davon (z. B. ⁻⁸, ρ) werden lesbar umgeschrieben (^-8, rho).

(function () {
  'use strict';

const PAGE_W = 595.28; // A4 in pt
const PAGE_H = 841.89;
const MARGIN_X = 46;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 50;
const FONT_SIZE = 9.2;
const LEADING = 12.4;
const CHAR_W = 0.6 * FONT_SIZE;
const LINE_CHARS = Math.floor((PAGE_W - 2 * MARGIN_X) / CHAR_W);

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const MAP = {
  'ρ': 'rho', 'β': 'beta', 'φ': 'phi', 'Δ': 'Delta', 'σ': 'sigma', 'α': 'alpha', 'γ': 'gamma',
  '≈': '~', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '≙': '=', '✓': 'OK', '✕': 'x', '⚠': '!', '−': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', '₀': '0',
};
// WinAnsi-Codes für Zeichen außerhalb von Latin-1
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‰': 0x89, '‹': 0x8b, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '›': 0x9b };

/** Text in WinAnsi-taugliche Zeichen umschreiben. */
function toWinAnsiText(str) {
  let s = String(str);
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (m) => `^${[...m].map((c) => SUP[c]).join('')}`);
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUB[c]);
  s = s.replace(/[^\x00-\xff]/g, (c) => (MAP[c] !== undefined ? MAP[c] : WIN[c] !== undefined ? c : '?'));
  return s;
}

function encodeByte(c) {
  if (WIN[c] !== undefined) return WIN[c];
  const code = c.charCodeAt(0);
  return code < 256 ? code : 63;
}

function escapePdf(s) {
  let out = '';
  for (const c of s) {
    const b = encodeByte(c);
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return out;
}

/** Bricht lange Zeilen um (Einrückung bleibt erhalten). */
function wrapLines(lines, width = LINE_CHARS) {
  const out = [];
  for (const raw of lines) {
    const line = toWinAnsiText(raw).replace(/\t/g, '  ');
    if (line.length <= width) { out.push(line); continue; }
    const indent = (line.match(/^\s*/) || [''])[0];
    const cont = `${indent}    `;
    let rest = line;
    let first = true;
    while (rest.length > (first ? width : width)) {
      const lim = width;
      let cut = rest.lastIndexOf(' ', lim);
      if (cut <= indent.length + 4) cut = lim;
      out.push(rest.slice(0, cut).trimEnd());
      rest = cont + rest.slice(cut).trimStart();
      first = false;
    }
    if (rest.trim()) out.push(rest);
  }
  return out;
}

/**
 * Erzeugt ein PDF aus Textzeilen.
 * @param {string[]} lines
 * @param {{title?:string, footer?:string}} opts  title wird fett gesetzt (erste Zeile)
 * @returns {Uint8Array}
 */
function makePdf(lines, { title = '', footer = '' } = {}) {
  const body = wrapLines(lines);
  const perPage = Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) / LEADING) - (title ? 2 : 0);
  const pages = [];
  for (let i = 0; i < Math.max(1, body.length); i += perPage) pages.push(body.slice(i, i + perPage));

  const objects = [];
  const add = (content) => { objects.push(content); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  pages.forEach((pl, idx) => {
    let y = PAGE_H - MARGIN_TOP;
    let stream = 'BT\n';
    if (title) {
      stream += `/F2 ${FONT_SIZE + 2} Tf\n1 0 0 1 ${MARGIN_X} ${y.toFixed(2)} Tm\n(${escapePdf(toWinAnsiText(title))}) Tj\n`;
      y -= LEADING * 2;
    }
    stream += `/F1 ${FONT_SIZE} Tf\n${LEADING} TL\n1 0 0 1 ${MARGIN_X} ${y.toFixed(2)} Tm\n`;
    for (const l of pl) stream += `(${escapePdf(l)}) Tj T*\n`;
    const foot = `${footer ? `${toWinAnsiText(footer)}   ` : ''}Seite ${idx + 1}/${pages.length}`;
    stream += `/F1 7.5 Tf\n1 0 0 1 ${MARGIN_X} ${(MARGIN_BOTTOM - 22).toFixed(2)} Tm\n(${escapePdf(foot)}) Tj\nET\n`;
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${contents} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

  VR.provide('core/pdf.js', { LINE_CHARS, toWinAnsiText, wrapLines, makePdf });
}());
