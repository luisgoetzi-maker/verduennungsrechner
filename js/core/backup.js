// Gesamt-Backup als JSON (Stoffe, Einstellungen, Lösungen, Verlauf) –
// z. B. für den Handywechsel.

(function () {
  'use strict';
  const { sanitizeSettings } = VR.use('core/settings.js');

const BACKUP_FORMAT = 'verduennungsrechner-backup';
const BACKUP_VERSION = 1;

/**
 * @param {{db, settings, solutions?, history?, appVersion?}} parts
 */
function buildBackup({ db, settings, solutions = null, history = null, appVersion = '' }) {
  const data = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exported: new Date().toISOString(),
    substances: db.exportData(),
    settings,
  };
  if (solutions) data.solutions = solutions.exportData();
  if (history) data.history = history.exportData();
  return data;
}

/** Prüft eine Backup-Datei und liefert eine kurze Übersicht. */
function inspectBackup(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!data || data.format !== BACKUP_FORMAT) throw new Error('Die Datei ist kein Backup des Verdünnungsrechners.');
  if (data.version > BACKUP_VERSION) throw new Error('Das Backup stammt aus einer neueren App-Version – bitte die App aktualisieren.');
  return {
    data,
    summary: {
      exported: data.exported,
      substances: data.substances?.entries?.length ?? 0,
      solutions: Array.isArray(data.solutions) ? data.solutions.length : (data.solutions?.items?.length ?? 0),
      history: data.history?.items?.length ?? 0,
      settings: !!data.settings,
    },
  };
}

/**
 * Spielt ein Backup ein.
 * @param {object} data   geprüfte Backup-Daten (inspectBackup().data)
 * @param {'merge'|'replace'} mode
 * @returns {{substances?:object, solutions?:object, history?:object, settings?:object}}
 */
function applyBackup(data, mode, { db, solutions = null, history = null, saveSettings = null }) {
  const report = {};
  if (data.substances) report.substances = db.importData(data.substances, mode);
  if (data.solutions && solutions) report.solutions = solutions.importData(data.solutions, mode);
  if (data.history && history) report.history = history.importData(data.history, mode);
  if (data.settings && saveSettings) report.settings = saveSettings(sanitizeSettings(data.settings));
  return report;
}

  VR.provide('core/backup.js', { BACKUP_FORMAT, BACKUP_VERSION, buildBackup, inspectBackup, applyBackup });
}());
