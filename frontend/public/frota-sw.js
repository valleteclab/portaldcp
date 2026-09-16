/* Service worker do DCP Frota (escopo /frota/).
 * - assets estáticos: cache-first (abre instantâneo);
 * - navegação em /frota: network-first, cai no cache quando sem sinal;
 * - leituras do fluxo (/api/frota-pub/...): network-first com cache —
 *   a última autorização/QR continua visível no pátio sem internet;
 * - tudo o mais (POST/PUT, outras APIs): passa direto, sem cache.
 */
const VERSION = 'frota-v1';
const SHELL = 'frota-shell-' + VERSION;
const DATA = 'frota-data-' + VERSION;

const API_CACHEAVEL = /^\/api\/frota-pub\/(vereador\/me|posto\/dashboard|req\/[^/]+|posto\/[^/]+\/info|vereador-link\/[^/]+\/info|vereador-portal\/[^/]+\/info)$/;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('frota-') && !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'frota:limpar-cache') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!API_CACHEAVEL.test(url.pathname)) return;
    event.respondWith(networkFirst(req, DATA));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, SHELL));
    return;
  }
  if (req.mode === 'navigate' && url.pathname.startsWith('/frota')) {
    event.respondWith(networkFirst(req, SHELL));
    return;
  }
  if (/\.(png|ico|svg|woff2?|webmanifest)$/.test(url.pathname) || url.pathname.startsWith('/frota/manifest')) {
    event.respondWith(cacheFirst(req, SHELL));
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return paginaOffline();
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

function paginaOffline() {
  const html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Sem conexão — DCP Frota</title>'
    + '<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center">'
    + '<div><div style="font-size:40px">📡</div><h1 style="font-size:20px;margin:12px 0 6px">Sem conexão</h1>'
    + '<p style="color:#94a3b8;margin:0 0 16px">Esta tela ainda não foi aberta com internet neste aparelho.</p>'
    + '<button onclick="location.reload()" style="background:#f97316;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px">Tentar de novo</button></div></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
