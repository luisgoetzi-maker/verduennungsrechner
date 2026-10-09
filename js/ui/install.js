// Installation als App: Knopf "Installieren" (nutzt den Installationsdialog des
// Browsers, wenn verfügbar) und Anleitung für Android, Windows und das lokale Öffnen.

(function () {
  'use strict';
  const { h, sheet, toast } = VR.use('ui/dom.js');

const ONLINE_URL = 'https://luisgoetzi-maker.github.io/verduennungsrechner/';

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function isStandalone() {
  return installed
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || window.navigator.standalone === true;
}

/** Aktueller Stand für Anzeige und Anleitung. */
function installStatus() {
  const ua = navigator.userAgent;
  return {
    standalone: isStandalone(),
    canPrompt: !!deferredPrompt,
    isFile: location.protocol === 'file:',
    isAndroid: /Android/i.test(ua),
    isSamsungBrowser: /SamsungBrowser/i.test(ua),
    isEdge: /Edg\//.test(ua),
  };
}

function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Anleitung passend zu Gerät und Browser. */
function instructions() {
  const st = installStatus();
  const items = [];
  if (st.isFile) {
    items.push(h('p', {}, 'Diese Seite ist als Datei geöffnet (Doppelklick auf index.html). So kann sie nicht als App installiert werden – zum Rechnen funktioniert sie aber trotzdem.'));
    items.push(h('p', {}, 'Zum Installieren die Online-Adresse öffnen und dort installieren:'));
    items.push(h('p', {}, h('a', { href: ONLINE_URL, target: '_blank', rel: 'noopener' }, ONLINE_URL)));
    return items;
  }
  if (st.isAndroid && st.isSamsungBrowser) {
    items.push(h('p', {}, 'Samsung Internet: Menü ☰ (unten rechts) → „Seite hinzufügen zu“ → „Startbildschirm“.'));
    items.push(h('p', { class: 'small muted' }, 'Empfohlen ist Chrome: Adresse in Chrome öffnen, dann Menü ⋮ → „App installieren“.'));
  } else if (st.isAndroid) {
    items.push(h('ol', {},
      h('li', {}, 'Oben rechts auf das Chrome-Menü ⋮ tippen.'),
      h('li', {}, '„App installieren“ (oder „Zum Startbildschirm hinzufügen“) wählen.'),
      h('li', {}, 'Mit „Installieren“ bestätigen. Das Symbol erscheint auf dem Startbildschirm bzw. im App-Drawer.')));
  } else if (st.isEdge) {
    items.push(h('ol', {},
      h('li', {}, 'In der Adressleiste rechts auf das Symbol „App verfügbar“ klicken (Quadrat mit Pluszeichen) – oder'),
      h('li', {}, 'Menü … → „Apps“ → „Diese Website als App installieren“.'),
      h('li', {}, 'Die App erscheint danach im Startmenü und kann an die Taskleiste angeheftet werden.')));
  } else {
    items.push(h('ol', {},
      h('li', {}, 'In der Adressleiste rechts auf das Installieren-Symbol (Bildschirm mit Pfeil) klicken – oder'),
      h('li', {}, 'Menü ⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“.'),
      h('li', {}, 'Unter Windows erscheint die App danach im Startmenü.')));
  }
  items.push(h('p', { class: 'small muted' }, 'Wichtig: Installieren auf der App-Adresse, nicht auf der GitHub-Projektseite (github.com). App-Adresse: ', h('a', { href: ONLINE_URL, target: '_blank', rel: 'noopener' }, ONLINE_URL)));
  return items;
}

/** Installiert über den Browser-Dialog oder zeigt die Anleitung. */
async function promptInstall() {
  if (isStandalone()) {
    toast('Die App ist bereits installiert.');
    return;
  }
  if (deferredPrompt) {
    const ev = deferredPrompt;
    deferredPrompt = null;
    ev.prompt();
    try {
      const choice = await ev.userChoice;
      if (choice && choice.outcome === 'accepted') toast('Wird installiert …');
    } catch {
      // Dialog geschlossen
    }
    notify();
    return;
  }
  const sh = sheet('App installieren');
  sh.body.append(h('div', { class: 'card' }, instructions()));
}

/** Karte für "Mehr": Status + Knopf + Anleitung. */
function installCard() {
  const st = installStatus();
  const card = h('section', { class: 'card' }, h('h2', {}, 'App installieren'));
  if (st.standalone) {
    card.append(h('div', { class: 'msg ok' }, h('div', {}, 'Läuft als installierte App.')));
    return card;
  }
  card.append(h('p', { class: 'sub' }, 'Als App installiert startet der Rechner ohne Browserleiste und funktioniert offline.'));
  card.append(h('button', { type: 'button', class: 'btn primary', onclick: promptInstall }, st.canPrompt ? 'Jetzt installieren' : 'Anleitung anzeigen'));
  card.append(h('details', { class: 'more', style: { marginTop: '8px' } }, h('summary', {}, 'So geht es'), h('div', { class: 'inner' }, instructions())));
  return card;
}

function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    toast('App installiert.');
    notify();
  });
}

  VR.provide('ui/install.js', { ONLINE_URL, initInstall, installStatus, onInstallChange, promptInstall, installCard });
}());
