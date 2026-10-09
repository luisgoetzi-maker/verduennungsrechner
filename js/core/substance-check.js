// Prüft eine Stoffliste auf Auffälligkeiten (für tools/check-substances.js und Tests).

import { tryParseFormula } from './formula.js';
import { validateCAS, validateSubstance, CATEGORIES } from './substance-db.js';

/**
 * @returns {{errors: string[], warnings: string[], infos: string[], rows: Array}}
 */
export function checkSubstances(list) {
  const errors = [];
  const warnings = [];
  const infos = [];
  const rows = [];
  const ids = new Map();
  const names = new Map();
  const cas = new Map();
  const aliasMap = new Map();

  for (const s of list) {
    const tag = `[${s.id}] ${s.name}`;
    if (!s.id) errors.push(`${s.name}: ID fehlt.`);
    if (ids.has(s.id)) errors.push(`${tag}: ID doppelt.`);
    ids.set(s.id, s);
    const lname = s.name.toLowerCase();
    if (names.has(lname)) errors.push(`${tag}: Name doppelt.`);
    names.set(lname, s);

    const v = validateSubstance(s);
    v.errors.forEach((e) => errors.push(`${tag}: ${e}`));
    v.warnings.forEach((w) => warnings.push(`${tag}: ${w}`));

    if (!CATEGORIES.includes(s.cat)) errors.push(`${tag}: unbekannte Kategorie „${s.cat}“.`);

    let mw = null;
    let water = 0;
    if (s.formula) {
      const r = tryParseFormula(s.formula);
      if (r.ok) {
        mw = r.molarMass;
        water = r.waterCount;
        r.notes.forEach((n) => warnings.push(`${tag}: ${n}`));
      }
    }
    const lower = s.name.toLowerCase();
    if (/hydrat/.test(lower) && water === 0) {
      warnings.push(`${tag}: Name nennt ein Hydrat, die Formel enthält aber kein Kristallwasser.`);
    }
    if (water > 0 && !/hydrat/.test(lower)) {
      warnings.push(`${tag}: Formel enthält Kristallwasser, der Name aber nicht „…hydrat“.`);
    }
    if (/wasserfrei/.test(lower) && water > 0) errors.push(`${tag}: „wasserfrei“, aber Formel mit Kristallwasser.`);
    if (s.purity !== undefined && s.purity < 100 && s.state === 'l' && !s.density) {
      errors.push(`${tag}: Lösung mit Gehalt ${s.purity} %, aber ohne Dichte.`);
    }
    if (s.state === 'l' && s.purity !== undefined && s.purity < 100 && s.cat !== 'Lösungsmittel'
      && !s.name.includes(`${String(s.purity).replace('.', ',')} %`)) {
      warnings.push(`${tag}: Gehalt ${s.purity} % steht nicht im Namen.`);
    }
    if (s.cas) {
      const c = validateCAS(s.cas);
      if (c.valid) {
        if (!cas.has(s.cas)) cas.set(s.cas, []);
        cas.get(s.cas).push(s);
      }
    } else if (s.cat !== 'Isotopenstandard') {
      warnings.push(`${tag}: keine CAS-Nummer.`);
    }
    for (const a of s.aliases || []) {
      const k = a.toLowerCase();
      if (!aliasMap.has(k)) aliasMap.set(k, []);
      aliasMap.get(k).push(s);
    }
    rows.push({ id: s.id, name: s.name, formula: s.formula, mw, cas: s.cas || '', density: s.density, purity: s.purity, z: s.z, cat: s.cat });
  }

  for (const [c, entries] of cas) {
    if (entries.length > 1) {
      const formulas = new Set(entries.map((e) => e.formula));
      if (formulas.size > 1) errors.push(`CAS ${c} bei verschiedenen Formeln: ${entries.map((e) => e.name).join(', ')}.`);
      else infos.push(`CAS ${c} mehrfach (verschiedene Gehalte): ${entries.map((e) => e.name).join(', ')}.`);
    }
  }
  for (const [a, entries] of aliasMap) {
    if (entries.length > 1) infos.push(`Mehrdeutiger Alias „${a}“: ${entries.map((e) => e.name).join(' | ')}.`);
  }
  return { errors, warnings, infos, rows };
}
