import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SubstanceDB, validateCAS, normalizeSearch, validateSubstance } from '../js/core/substance-db.js';
import { SEED_SUBSTANCES } from '../js/core/substances-seed.js';
import { checkSubstances } from '../js/core/substance-check.js';
import { createMemoryStorage } from '../js/core/storage.js';
import { sameComposition } from '../js/core/pubchem.js';

test('Startliste: ca. 150+ Einträge, alle Formeln gültig, keine Fehler im Prüfskript', () => {
  assert.ok(SEED_SUBSTANCES.length >= 150);
  const r = checkSubstances(SEED_SUBSTANCES);
  assert.deepEqual(r.errors, []);
});

test('Startliste enthält die geforderten Stoffe mit Dichte/Gehalt', () => {
  const db = new SubstanceDB(createMemoryStorage());
  const byId = (id) => db.get(id);
  for (const [id, purity, density] of [['hcl-37', 37, 1.19], ['hno3-65', 65, 1.39], ['h2so4-96', 96, 1.84], ['nh3-25', 25, 0.91], ['acoh-100', 100, 1.05]]) {
    const e = byId(id);
    assert.ok(e, id);
    assert.equal(e.purity, purity);
    assert.equal(e.density, density);
  }
  for (const id of ['pfoa', 'pfos', 'pfhxa', 'edta', 'na2edta-2h2o']) assert.ok(byId(id), id);
});

test('CAS-Prüfziffer', () => {
  assert.ok(validateCAS('7732-18-5').valid);
  assert.ok(validateCAS('7647-01-0').valid);
  assert.ok(validateCAS('335-67-1').valid);
  assert.equal(validateCAS('7732-18-6').valid, false);
  assert.equal(validateCAS('77321-85').valid, false);
  assert.ok(validateCAS('').valid);
});

test('Suche: mehrdeutiges "EDTA" liefert alle Varianten mit Formel und Molarer Masse', () => {
  const db = new SubstanceDB(createMemoryStorage());
  const res = db.search('EDTA');
  const ids = res.map((r) => r.entry.id);
  assert.ok(ids.includes('edta'));
  assert.ok(ids.includes('na2edta-2h2o'));
  assert.ok(ids.includes('na4edta'));
  for (const r of res.slice(0, 3)) {
    assert.ok(r.entry.formula);
    assert.ok(r.entry.mw > 0);
  }
  assert.ok(Math.abs(db.get('edta').mw - 292.24) < 0.01);
  assert.ok(Math.abs(db.get('na2edta-2h2o').mw - 372.24) < 0.01);
});

test('Suche nach Alias, Formel, CAS, Umlauten und Summenformel', () => {
  const db = new SubstanceDB(createMemoryStorage());
  assert.equal(db.search('Titriplex III')[0].entry.id, 'na2edta-2h2o');
  // Abkürzung trifft zuerst die freie Säure, nicht das Salz
  assert.equal(db.search('PFOA')[0].entry.id, 'pfoa');
  assert.equal(db.search('PFOS')[0].entry.id, 'pfos');
  assert.equal(db.search('PFBS')[0].entry.id, 'pfbs');
  assert.equal(db.search('Tris')[0].entry.id, 'tris');
  assert.equal(db.search('7758-99-8')[0].entry.id, 'cuso4-5h2o');
  assert.equal(db.search('CuSO4·5H2O')[0].entry.id, 'cuso4-5h2o');
  assert.equal(db.search('CuSO4.5H2O')[0].entry.id, 'cuso4-5h2o');
  assert.ok(db.search('Schwefelsaeure').some((r) => r.entry.id === 'h2so4-96'));
  assert.ok(db.search('kupfersulfat').length >= 2);
  // Summenformel in anderer Schreibweise (Hill)
  assert.ok(db.search('C2H4O2').some((r) => r.entry.id === 'acoh-100'));
  assert.equal(normalizeSearch('Säure (konz.)'), 'saeurekonz');
});

test('eigene Stoffe anlegen, bearbeiten, löschen', () => {
  const storage = createMemoryStorage();
  const db = new SubstanceDB(storage);
  const n0 = db.list().length;
  const e = db.add({ name: 'Mein Standard', formula: 'C8HF15O2', aliases: 'MS1; Test', cas: '335-67-1', purity: '98,5' });
  assert.equal(db.list().length, n0 + 1);
  assert.deepEqual(e.aliases, ['MS1', 'Test']);
  assert.equal(e.purity, 98.5);
  assert.ok(Math.abs(e.mw - 414.07) < 0.01);
  db.update(e.id, { ...e, molarMass: 500 });
  assert.equal(db.get(e.id).mw, 500);
  assert.equal(db.get(e.id).mwSource, 'manual');
  db.remove(e.id);
  assert.equal(db.list().length, n0);
  assert.throws(() => db.add({ name: '', formula: 'H2O' }));
  assert.throws(() => db.add({ name: 'X', formula: 'Xx2' }));
  assert.throws(() => db.add({ name: 'X', formula: 'H2O', cas: '7732-18-6' }));
});

test('Einträge der Startliste bearbeiten, ausblenden, wiederherstellen', () => {
  const db = new SubstanceDB(createMemoryStorage());
  const orig = db.get('hcl-37');
  db.update('hcl-37', { ...orig, density: 1.185 });
  assert.equal(db.get('hcl-37').density, 1.185);
  assert.equal(db.get('hcl-37').modified, true);
  db.restoreSeed('hcl-37');
  assert.equal(db.get('hcl-37').density, 1.19);
  db.remove('hcl-37');
  assert.equal(db.get('hcl-37'), null);
  db.restoreSeed('hcl-37');
  assert.ok(db.get('hcl-37'));
});

test('Export/Import (Backup beim Handywechsel)', () => {
  const a = new SubstanceDB(createMemoryStorage());
  a.add({ name: 'Eigenstoff', formula: 'NaCl', notes: 'Charge 42' });
  a.update('nacl', { ...a.get('nacl'), notes: 'geändert' });
  a.remove('kcl');
  const json = JSON.parse(JSON.stringify(a.exportData()));

  const b = new SubstanceDB(createMemoryStorage());
  const rep = b.importData(json, 'replace');
  assert.equal(rep.errors.length, 0);
  assert.equal(rep.added, 1);
  assert.ok(b.search('Eigenstoff')[0].entry.notes === 'Charge 42');
  assert.equal(b.get('nacl').notes, 'geändert');
  assert.equal(b.get('kcl'), null);
  assert.equal(b.list().length, a.list().length);
  assert.throws(() => b.importData({ foo: 1 }));
});

test('Validierung meldet Auffälligkeiten', () => {
  assert.ok(validateSubstance({ name: 'X', formula: 'H2O', density: 50 }).errors.length > 0);
  assert.ok(validateSubstance({ name: 'X', formula: 'H2O', purity: 120 }).errors.length > 0);
  assert.ok(validateSubstance({ name: 'X', formula: 'H2O', molarMass: 20 }).warnings.length > 0);
  assert.ok(validateSubstance({ name: 'X' }).warnings.length > 0);
});

test('Formelvergleich für den PubChem-Abgleich', () => {
  assert.ok(sameComposition('CuSO4·5H2O', 'CuH10O9S'));
  assert.ok(sameComposition('CH3COOH', 'C2H4O2'));
  assert.ok(!sameComposition('CuSO4', 'CuH10O9S'));
});
