// Einstiegspunkt der App: Speicher, Datenbank, Einstellungen, Navigation,
// Service Worker.

(function () {
  'use strict';
  const { h, clear, toast, ICONS } = VR.use('ui/dom.js');
  const { createLocalStorage } = VR.use('core/storage.js');
  const { SubstanceDB } = VR.use('core/substance-db.js');
  const { loadSettings, saveSettings } = VR.use('core/settings.js');
  const { renderCalc } = VR.use('ui/views/calc.js');
  const { renderSubstances } = VR.use('ui/views/substances.js');
  const { renderSettings } = VR.use('ui/views/settings.js');
  const { MODE_BY_ID } = VR.use('core/modes/index.js');
  const { APP_VERSION } = VR.use('ui/version.js');
  const { install: installFeatures } = VR.use('ui/features.js');

const storage = createLocalStorage('vr.');

const app = {
  storage,
  db: new SubstanceDB(storage),
  settings: loadSettings(storage),
  hooks: { resultActions: [] },
  solutions: null,
  history: null,
  views: {},
  nav: [
    { hash: '#rechner', label: 'Rechner', icon: ICONS.calc },
    { hash: '#stoffe', label: 'Stoffe', icon: ICONS.flask },
    { hash: '#einstellungen', label: 'Mehr', icon: ICONS.settings },
  ],
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
  rerender() { route(true); },
  reload() { location.reload(); },
  setSettings(s) {
    this.settings = saveSettings(storage, s);
    applyTheme();
    return this.settings;
  },
};

// Weitere Ansichten (z. B. Lösungen, Verlauf) registrieren sich hier.
app.views.stoffe = renderSubstances;
app.views.einstellungen = renderSettings;

function applyTheme() {
  const t = app.settings.theme;
  const dark = t === 'system' ? !window.matchMedia('(prefers-color-scheme: light)').matches : t !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d1117' : '#f5f7fa');
}

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  nav.style.setProperty('--nav-count', String(app.nav.length));
  for (const item of app.nav) {
    nav.append(h('a', { href: item.hash, dataset: { hash: item.hash } }, h('span', { html: item.icon, style: { display: 'contents' } }), h('span', {}, item.label)));
  }
}

let lastSection = null;
function route(keepScroll = false) {
  const [section = 'rechner', sub] = location.hash.replace(/^#/, '').split('/');
  const view = document.getElementById('view');
  const y = window.scrollY;
  clear(view);
  document.querySelectorAll('.sheet-backdrop').forEach((b) => b.remove());
  let active = '#rechner';
  if (app.views[section]) {
    app.views[section](view, app, sub);
    active = `#${section}`;
  } else {
    let mode = sub && MODE_BY_ID[sub] ? sub : app.storage.get('lastMode');
    if (!MODE_BY_ID[mode]) mode = 'einwaage';
    app.storage.set('lastMode', mode);
    renderCalc(view, app, mode);
  }
  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.dataset.hash === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (keepScroll || section === lastSection) window.scrollTo(0, keepScroll ? y : 0);
  else window.scrollTo(0, 0);
  lastSection = section;
}

function updateNetBadge() {
  const b = document.getElementById('net');
  if (!b) return;
  if (navigator.onLine) {
    b.textContent = 'offline-fähig';
    b.classList.remove('offline');
  } else {
    b.textContent = 'offline';
    b.classList.add('offline');
  }
}

function showUpdateBanner(worker) {
  if (document.getElementById('update-banner')) return;
  const banner = h('div', { class: 'banner', id: 'update-banner' },
    h('span', { class: 'grow' }, 'Eine neue Version ist verfügbar.'),
    h('button', { type: 'button', class: 'btn small primary', onclick: () => worker.postMessage({ type: 'SKIP_WAITING' }) }, 'Neu laden'));
  document.getElementById('view').prepend(banner);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(w);
      });
    });
  }).catch((e) => console.warn('Service Worker nicht registriert:', e));
}

function start() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
  renderNav();
  window.addEventListener('hashchange', () => route());
  window.addEventListener('online', updateNetBadge);
  window.addEventListener('offline', updateNetBadge);
  updateNetBadge();
  route();
  registerServiceWorker();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!storage.persistent) toast('Lokaler Speicher nicht verfügbar – Daten werden nicht gespeichert.', 5000);
  const seen = storage.get('appVersion');
  if (seen && seen !== APP_VERSION) setTimeout(() => toast(`Aktualisiert auf Version ${APP_VERSION}.`, 3500), 600);
  storage.set('appVersion', APP_VERSION);
}

// Erweiterungen (Praxisfunktionen) einhängen, dann starten
try {
  installFeatures(app);
} catch (e) {
  console.error(e);
}
start();

  VR.provide('ui/app.js', { app, start });
}());
