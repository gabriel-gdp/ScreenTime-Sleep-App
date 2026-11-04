// Network-first per i file dell'app, con cache come riserva offline:
// quando sei online ricevi sempre l'ultima versione pubblicata (niente
// più versioni vecchie "incastrate" nella cache dopo un aggiornamento),
// quando sei offline l'app si apre comunque con l'ultima copia salvata.
const CACHE_NAME = 'sleep-screen-lab-v7';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/analytics.js',
  './js/app.js',
  './js/demo.js',
  './js/backup.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // es. font esterni: passano direttamente

  event.respondWith((async () => {
    try {
      // `no-cache`: rivalida con il server invece di usare la cache HTTP
      // del browser (GitHub Pages la tiene fino a 10 minuti).
      // Per le navigazioni `redirect: 'manual'`: se il server reindirizza
      // (es. /repo → /repo/), il browser deve ricevere il reindirizzamento
      // e seguirlo lui; restituire la risposta già reindirizzata a una
      // navigazione viene rifiutato e la pagina non si apre.
      const isNav = event.request.mode === 'navigate';
      const response = await fetch(new Request(event.request.url, {
        cache: 'no-cache', credentials: 'same-origin', redirect: isNav ? 'manual' : 'follow',
      }));
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request.url, copy)).catch(() => {}));
      }
      return response;
    } catch (e) {
      const cached = await caches.match(event.request.url);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
