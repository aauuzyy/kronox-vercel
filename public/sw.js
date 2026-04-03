const CACHE_NAME = 'kronox-v3'

// Assets to cache on install (shell only — audio files are not cached)
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))).catch(() => {})
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Only handle GET, skip cross-origin and audio/supabase requests
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  // Skip audio files and API calls — always network for those
  if (/\.(mp3|ogg|wav|aac|flac)$/i.test(url.pathname)) return

  const isNavigation = e.request.mode === 'navigate'

  // Navigation requests (page loads): network-first so index.html is always fresh.
  // This prevents stale cached HTML referencing old JS bundle hashes after a deploy.
  if (isNavigation) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets (JS/CSS/icons): cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    })
  )
})
