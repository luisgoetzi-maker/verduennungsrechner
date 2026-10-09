// Ablaufdaten: Ampel grün/gelb/rot.

(function () {
  'use strict';

function toDay(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseISO(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Tage bis zum Datum (negativ = vergangen). null bei ungültigem Datum. */
function daysUntil(iso, today = new Date()) {
  const t = parseISO(iso);
  if (t === null) return null;
  return Math.round((t - toDay(today)) / 86400000);
}

function fmt(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/**
 * @returns {{color:'green'|'yellow'|'red'|'grey', days:number|null, text:string, rank:number}}
 *   rank: Sortierreihenfolge (abgelaufen zuerst)
 */
function expiryStatus(iso, warnDays = 14, today = new Date()) {
  const days = daysUntil(iso, today);
  if (days === null) return { color: 'grey', days: null, text: 'kein Ablaufdatum', rank: 3 };
  if (days < 0) return { color: 'red', days, text: `abgelaufen seit ${-days} ${-days === 1 ? 'Tag' : 'Tagen'} (${fmt(iso)})`, rank: 0 };
  if (days === 0) return { color: 'yellow', days, text: 'läuft heute ab', rank: 1 };
  if (days <= warnDays) return { color: 'yellow', days, text: `läuft in ${days} ${days === 1 ? 'Tag' : 'Tagen'} ab (${fmt(iso)})`, rank: 1 };
  return { color: 'green', days, text: `haltbar bis ${fmt(iso)} (noch ${days} Tage)`, rank: 2 };
}

/** Datum + n Tage als ISO-String. */
function addDays(iso, n) {
  const t = parseISO(iso);
  if (t === null) return '';
  const d = new Date(t + n * 86400000);
  return d.toISOString().slice(0, 10);
}

  VR.provide('core/expiry.js', { daysUntil, expiryStatus, addDays });
}());
