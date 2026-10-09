// Optionale Online-Abfrage bei PubChem (PUG REST).
// Wird nur auf ausdrücklichen Wunsch aufgerufen; ohne Internet funktioniert
// der Rest der App unverändert. Ergebnisse werden nie automatisch
// übernommen, sondern zur Bestätigung angezeigt.

import { validateCAS } from './substance-db.js';
import { tryParseFormula, elementCounts } from './formula.js';

const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

export class PubChemError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PubChemError';
    this.code = code;
  }
}

async function fetchJSON(url, fetchFn, timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchFn(url, ctrl ? { signal: ctrl.signal } : undefined);
  } catch (e) {
    if (e && e.name === 'AbortError') throw new PubChemError('Zeitüberschreitung bei der PubChem-Abfrage.', 'timeout');
    throw new PubChemError('Keine Verbindung zu PubChem (offline?).', 'offline');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 404) throw new PubChemError('Bei PubChem nicht gefunden.', 'notfound');
  if (res.status === 503) throw new PubChemError('PubChem ist ausgelastet – bitte später erneut versuchen.', 'busy');
  if (!res.ok) throw new PubChemError(`PubChem-Fehler (HTTP ${res.status}).`, 'http');
  return res.json();
}

/**
 * Sucht einen Stoff bei PubChem (Name, Synonym oder CAS-Nummer).
 * @returns {Promise<Array<{cid:number, title:string, formula:string, mw:number, iupac:string, cas:string|null, formulaOk:boolean}>>}
 */
export async function lookupPubChem(query, { fetchFn = globalThis.fetch, timeoutMs = 12000, maxResults = 5, withCAS = true } = {}) {
  const q = String(query ?? '').trim();
  if (!q) throw new PubChemError('Bitte einen Namen oder eine CAS-Nummer eingeben.', 'empty');
  if (typeof fetchFn !== 'function') throw new PubChemError('Online-Abfrage nicht verfügbar.', 'offline');
  const url = `${BASE}/compound/name/${encodeURIComponent(q)}/property/MolecularFormula,MolecularWeight,IUPACName,Title/JSON`;
  const data = await fetchJSON(url, fetchFn, timeoutMs);
  const props = data?.PropertyTable?.Properties || [];
  if (!props.length) throw new PubChemError('Bei PubChem nicht gefunden.', 'notfound');
  const results = [];
  for (const p of props.slice(0, maxResults)) {
    const parsed = tryParseFormula(p.MolecularFormula);
    const r = {
      cid: p.CID,
      title: p.Title || '',
      formula: p.MolecularFormula || '',
      mw: Number(p.MolecularWeight),
      iupac: p.IUPACName || '',
      cas: null,
      formulaOk: parsed.ok,
    };
    if (withCAS) {
      try {
        const syn = await fetchJSON(`${BASE}/compound/cid/${p.CID}/synonyms/JSON`, fetchFn, timeoutMs);
        const list = syn?.InformationList?.Information?.[0]?.Synonym || [];
        const cas = list.find((s) => /^\d{2,7}-\d{2}-\d$/.test(s) && validateCAS(s).valid);
        r.cas = cas || null;
      } catch {
        r.cas = null;
      }
    }
    results.push(r);
  }
  return results;
}

/** Vergleicht zwei Formeln nach Elementanzahl (Isotope zählen zu ihrem Element). */
export function sameComposition(formulaA, formulaB) {
  const a = tryParseFormula(formulaA);
  const b = tryParseFormula(formulaB);
  if (!a.ok || !b.ok) return false;
  const ca = elementCounts(a.counts);
  const cb = elementCounts(b.counts);
  const keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  for (const k of keys) if (Math.abs((ca[k] || 0) - (cb[k] || 0)) > 1e-9) return false;
  return true;
}
