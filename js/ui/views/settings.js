// Ansicht "Einstellungen": Darstellung, Plausibilität, Geräte, Daten.

(function () {
  'use strict';
  const { h, toast, download, pickFile, confirmBox, ICONS } = VR.use('ui/dom.js');
  const { numberField, selectField, segmented, checkField, textField } = VR.use('ui/components.js');
  const { DEFAULT_SETTINGS } = VR.use('core/settings.js');
  const { buildBackup, inspectBackup, applyBackup } = VR.use('core/backup.js');
  const { APP_VERSION } = VR.use('ui/version.js');
  const { installCard } = VR.use('ui/install.js');

function renderSettings(root, app) {
  const s = app.settings;
  const save = (patch) => {
    app.setSettings({ ...app.settings, ...patch });
    toast('Gespeichert.', 1200);
  };

  // Darstellung
  const theme = segmented({
    name: 'theme', label: 'Farbschema', value: s.theme,
    options: [{ value: 'dark', label: 'Dunkel' }, { value: 'light', label: 'Hell' }, { value: 'system', label: 'System' }],
    onInput: () => save({ theme: theme.get() }),
  });
  const sig = selectField({
    name: 'sig', label: 'Signifikante Stellen in Ergebnissen', value: String(s.sig),
    options: [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} Stellen${n === 4 ? ' (Standard)' : ''}` })),
    onInput: () => save({ sig: Number(sig.get()) }),
  });
  const kb = checkField({ name: 'textKeyboard', label: 'Text-Tastatur in Mengenfeldern (für Eingaben wie „5 µg/mL“; sonst Ziffernblock + Einheitenauswahl)', checked: s.textKeyboard, onInput: () => save({ textKeyboard: kb.get() }) });

  // Plausibilität
  const minPip = numberField({ name: 'minPipetteUL', label: 'Warnung bei Pipettiervolumen unter', suffix: 'µL', value: String(s.minPipetteUL).replace('.', ','), onInput: () => save({ minPipetteUL: minPip.get() }) });
  const maxF = numberField({ name: 'maxStepFactor', label: 'Warnung bei Verdünnungsfaktor je Schritt über', value: String(s.maxStepFactor), onInput: () => save({ maxStepFactor: maxF.get() }) });
  const minMass = numberField({ name: 'minMassMg', label: 'Warnung bei Einwaage unter', suffix: 'mg', value: String(s.minMassMg).replace('.', ','), onInput: () => save({ minMassMg: minMass.get() }) });
  const warnDays = numberField({ name: 'expiryWarnDays', label: 'Ampel gelb, wenn Ablauf in weniger als', suffix: 'Tagen', value: String(s.expiryWarnDays), integer: true, onInput: () => save({ expiryWarnDays: warnDays.get() }) });

  // Geräte
  const list = (v) => v.map((x) => String(x).replace('.', ',')).join('; ');
  const flasks = textField({ name: 'flasksML', label: 'Verfügbare Messkolben (mL)', value: list(s.flasksML), onInput: () => save({ flasksML: flasks.get().split(/[;\s]+/) }) });
  const pips = textField({ name: 'pipettesUL', label: 'Kolbenhubpipetten, Nennvolumen (µL)', value: list(s.pipettesUL), onInput: () => save({ pipettesUL: pips.get().split(/[;\s]+/) }) });
  const vols = textField({ name: 'volPipettesML', label: 'Vollpipetten (mL)', value: list(s.volPipettesML), onInput: () => save({ volPipettesML: vols.get().split(/[;\s]+/) }) });
  const round = checkField({ name: 'roundPipette', label: 'Pipettiervolumina standardmäßig auf Geräteauflösung runden', checked: s.roundPipette, onInput: () => save({ roundPipette: round.get() }) });

  // Daten
  const exportAll = () => {
    const data = buildBackup({ db: app.db, settings: app.settings, solutions: app.solutions, history: app.history, appVersion: APP_VERSION });
    const d = new Date().toISOString().slice(0, 10);
    download(`verduennungsrechner-backup-${d}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Backup-Datei wird gespeichert (Ordner „Downloads“).');
  };
  const importAll = async () => {
    let file;
    try {
      file = await pickFile();
    } catch (e) {
      toast(e.message);
      return;
    }
    let info;
    try {
      info = inspectBackup(file.text);
    } catch (e) {
      toast(e.message, 4000);
      return;
    }
    const sm = info.summary;
    const replace = confirmBox(`Backup vom ${sm.exported ? new Date(sm.exported).toLocaleString('de-DE') : '?'}:\n${sm.substances} Stoffe, ${sm.solutions} Lösungen, ${sm.history} Verlaufseinträge.\n\nOK = vorhandene Daten ERSETZEN\nAbbrechen = mit vorhandenen Daten ZUSAMMENFÜHREN`);
    const mode = replace ? 'replace' : 'merge';
    const rep = applyBackup(info.data, mode, { db: app.db, solutions: app.solutions, history: app.history, saveSettings: (st) => app.setSettings(st) });
    const errs = rep.substances?.errors?.length || 0;
    toast(`Import (${replace ? 'ersetzt' : 'zusammengeführt'}): ${rep.substances?.added ?? 0} neue, ${rep.substances?.updated ?? 0} geänderte Stoffe${errs ? `, ${errs} Fehler` : ''}.`, 5000);
    app.rerender();
  };
  const resetAll = () => {
    if (!confirmBox('Wirklich ALLE eigenen Daten löschen (eigene Stoffe, Änderungen, Lösungen, Verlauf, Einstellungen)? Vorher ein Backup exportieren!')) return;
    for (const k of app.storage.keys()) app.storage.remove(k);
    app.db.resetAll();
    app.reload();
  };

  const persistInfo = h('div', { class: 'small muted', style: { marginTop: '8px' } });
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      persistInfo.textContent = p ? 'Dauerhafte Speicherung ist aktiv – der Browser löscht die Daten nicht automatisch.' : 'Hinweis: Dauerhafte Speicherung nicht bestätigt. Als App installieren, damit Chrome die Daten nicht bei Speichermangel löscht.';
    }).catch(() => {});
  }
  if (!app.storage.persistent) persistInfo.textContent = 'Achtung: Der Browser erlaubt keinen lokalen Speicher (privater Modus?). Daten gehen beim Schließen verloren.';

  root.append(
    installCard(),
    h('section', { class: 'card' }, h('h2', {}, 'Darstellung'), theme.el, sig.el, kb.el),
    h('section', { class: 'card' }, h('h2', {}, 'Plausibilitätswarnungen'), h('div', { class: 'grid2' }, minPip.el, maxF.el), h('div', { class: 'grid2' }, minMass.el, warnDays.el)),
    h('section', { class: 'card' }, h('h2', {}, 'Laborgeräte'), flasks.el, pips.el, vols.el, round.el,
      h('p', { class: 'small muted' }, 'Rundung: < 10 µL auf 0,1 µL; 10–100 µL auf 0,5 µL; 100–1000 µL auf 1 µL; 1–10 mL auf 10 µL; darüber auf 0,1 mL.')),
    h('section', { class: 'card' }, h('h2', {}, 'Daten & Backup'),
      h('p', { class: 'sub' }, 'Alle Daten bleiben lokal auf diesem Gerät. Für den Handywechsel ein Backup exportieren und auf dem neuen Gerät importieren.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: exportAll }, h('span', { html: ICONS.download, style: { display: 'contents' } }), 'Backup exportieren'),
        h('button', { type: 'button', class: 'btn', onclick: importAll }, h('span', { html: ICONS.upload, style: { display: 'contents' } }), 'Backup importieren')),
      app.db.hiddenCount() ? h('button', { type: 'button', class: 'btn small', style: { marginTop: '10px' }, onclick: () => { app.db.restoreAllHidden(); toast('Gelöschte Einträge der Startliste wiederhergestellt.'); app.rerender(); } }, `${app.db.hiddenCount()} gelöschte Einträge der Startliste wiederherstellen`) : null,
      persistInfo,
      h('hr', { class: 'sep' }),
      h('button', { type: 'button', class: 'btn danger small', onclick: resetAll }, 'Alle eigenen Daten löschen')),
    h('section', { class: 'card' }, h('h2', {}, 'Über'),
      h('p', { class: 'small' }, `Verdünnungsrechner ${APP_VERSION} · funktioniert komplett offline · Atommassen: IUPAC-Standardatomgewichte.`),
      h('p', { class: 'small muted' }, 'Die Werte der Stoff-Startliste (CAS, Dichte, Gehalt) wurden aus dem Gedächtnis eingetragen und müssen gegen Sicherheitsdatenblätter geprüft werden. Ergebnisse vor der Verwendung plausibilisieren.'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { app.setSettings({ ...DEFAULT_SETTINGS }); toast('Standard-Einstellungen wiederhergestellt.'); app.rerender(); } }, 'Einstellungen zurücksetzen')),
  );
}

  VR.provide('ui/views/settings.js', { renderSettings });
}());
