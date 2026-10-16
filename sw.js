// Offline-Cache für Ziellinie. Bei Änderungen an Dateien VERSION erhöhen.
var VERSION = 'ziellinie-v1';
var DATEIEN = ['./', 'index.html', 'plan.js?v=3', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(DATEIEN); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (n) { return n !== VERSION; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // Zählskript u. a. nicht anfassen
  var istSeite = r.mode === 'navigate';
  if (istSeite) { // Seite: erst Netz (aktuell), sonst Cache
    e.respondWith(fetch(r).then(function (res) {
      var kopie = res.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', kopie); });
      return res;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(r).then(function (t) { return t || fetch(r); }));
});
