const CACHE = 'holo-pwa-v1'
const SHELL = ['./', './index.html', './manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// App shell: cache-first. API GitHub: network-first avec fallback cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  if (url.hostname === 'api.github.com') {
    // Network-first pour l'API
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Cache-first pour le reste (shell)
  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  )
})
