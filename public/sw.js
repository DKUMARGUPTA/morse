/* Morse Messenger — service worker (PWA install criteria + offline shell + Web Push)
 * Strategies:
 *  - navigation requests : network-first, offline fallback to cached shell
 *  - static assets       : stale-while-revalidate
 *  - /api/* & socket.io  : network only (never cached)
 *  - push events         : metadata-only notification (no message text — E2EE safe)
 */

const VERSION = 'morse-v2'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isCacheableAsset(url) {
  // same-origin static assets only
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return false
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/icon') ||
    url.pathname === '/logo.svg' ||
    url.pathname === '/robots.txt'
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // socket.io + API: always network, no cache
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.includes('XTransformPort')
  ) {
    return
  }

  // app navigations: network-first, fall back to cached shell when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined)
          return response
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match('/')) || (await cache.match(request)) || Response.error()
        })
    )
    return
  }

  // static assets: stale-while-revalidate
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone())
            return response
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})

// ---------- Web Push ----------

/* Payload is metadata-only: { s: senderName, c: conversationId, b?: body }.
 * Message text is never included, so E2EE chats leak nothing. Consecutive
 * messages in the same conversation replace the notification (tag + renotify). */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.s || 'Morse Messenger'
  const body = data.b || 'New message · · − − ·'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.c || 'morse-message',
      renotify: true,
      data,
    })
  )
})

/* Click-through: focus an open window and tell it to open the conversation;
 * otherwise open the app. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const conversationId = event.notification.data && event.notification.data.c
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin)) {
          client.focus()
          if (conversationId) client.postMessage({ type: 'open-conversation', conversationId })
          return
        }
      }
      await self.clients.openWindow('/')
    })()
  )
})
