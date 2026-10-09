// Service Worker: speichert alle App-Dateien für den Offline-Betrieb.
// Bei jeder Änderung an App-Dateien CACHE_VERSION erhöhen (und APP_VERSION
// in js/ui/version.js), damit Geräte die neue Version laden.
// Dateiliste aktualisieren: node tools/update-sw.js

const CACHE_VERSION = 'vr-1.1.0';

const ASSETS = [
  // ASSETS-START
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './js/core/backup.js',
  './js/core/devices.js',
  './js/core/elements.js',
  './js/core/expiry.js',
  './js/core/export.js',
  './js/core/formula.js',
  './js/core/history.js',
  './js/core/modes/common.js',
  './js/core/modes/einwaage.js',
  './js/core/modes/index.js',
  './js/core/modes/istd.js',
  './js/core/modes/konzentriert.js',
  './js/core/modes/mischung.js',
  './js/core/modes/reihe.js',
  './js/core/modes/umrechner.js',
  './js/core/modes/verduennung.js',
  './js/core/numbers.js',
  './js/core/pdf.js',
  './js/core/practice.js',
  './js/core/pubchem.js',
  './js/core/settings.js',
  './js/core/solutions.js',
  './js/core/storage.js',
  './js/core/substance-check.js',
  './js/core/substance-db.js',
  './js/core/substances-seed.js',
  './js/core/uncertainty.js',
  './js/core/units.js',
  './js/ui/app.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/features.js',
  './js/ui/forms/common.js',
  './js/ui/forms/einwaage.js',
  './js/ui/forms/istd.js',
  './js/ui/forms/konzentriert.js',
  './js/ui/forms/mischung.js',
  './js/ui/forms/reihe.js',
  './js/ui/forms/umrechner.js',
  './js/ui/forms/verduennung.js',
  './js/ui/pdf-export.js',
  './js/ui/result-view.js',
  './js/ui/version.js',
  './js/ui/views/calc.js',
  './js/ui/views/history.js',
  './js/ui/views/settings.js',
  './js/ui/views/solutions.js',
  './js/ui/views/substances.js',
  // ASSETS-END
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vr-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fremde Server (z. B. PubChem) immer direkt über das Netz
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
