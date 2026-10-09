// Einstiegspunkt der App: Speicher, Datenbank, Einstellungen, Navigation,
// Service Worker.

import { h, clear, toast, ICONS } from './dom.js';
import { createLocalStorage } from '../core/storage.js';
import { SubstanceDB } from '../core/substance-db.js';
import { loadSettings, saveSettings } from '../core/settings.js';
import { renderCalc } from './views/calc.js';
import { renderSubstances } from './views/substances.js';
import { renderSettings } from './views/settings.js';
import { MODE_BY_ID } from '../core/modes/index.js';

const storage = createLocalStorage('vr.');

export const app = {
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
  if (!('serviceWorker' in navigator)) return;
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

export function start() {
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
}

// Erweiterungen (Etappe 3) laden, dann starten
import('./features.js')
  .then((m) => m.install(app))
  .catch((e) => { if (!/features\.js/.test(String(e))) console.error(e); })
  .finally(start);
