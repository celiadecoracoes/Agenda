/* ======================================================================
   AGENDA CELIA — SERVICE WORKER
   Estratégia:
   - App shell (HTML/CSS/JS/ícones/manifest): cache-first com atualização
     em segundo plano (stale-while-revalidate), garantindo funcionamento
     100% offline após a primeira visita.
   - Bibliotecas externas (PDF): network-first com fallback para cache.
   - Versionamento automático: ao publicar uma nova versão do app, basta
     alterar CACHE_VERSION abaixo para forçar a atualização em todos os
     dispositivos instalados.
   ====================================================================== */
'use strict';

const CACHE_VERSION = 'agenda-celia-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

/* Arquivos essenciais do "app shell" — sempre disponíveis offline */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png'
];

/* ---------------------------------------------------------------------
   INSTALL — baixa e guarda o app shell
   --------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Falha ao pré-cachear app shell:', err))
  );
});

/* ---------------------------------------------------------------------
   ACTIVATE — remove caches de versões antigas
   --------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('agenda-celia-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* Permite que a página force a ativação imediata de uma nova versão */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

/* ---------------------------------------------------------------------
   FETCH
   --------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignora métodos não seguros para cache (POST, etc.)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Navegações (abrir/recarregar o app): network-first com fallback offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (isSameOrigin) {
    // App shell: cache-first, atualizando em segundo plano (stale-while-revalidate)
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  } else {
    // Recursos externos (fontes, bibliotecas de PDF): network-first com fallback
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
