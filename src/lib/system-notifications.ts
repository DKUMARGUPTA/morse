// Morse Messenger — system (OS-level) notifications shown from the open page.
// Covers the "app is running but in the background" case: tab hidden, phone
// screen off, another app in front. The fully-closed case is Web Push
// (push-server.ts → sw.js). Both use the same tag scheme so they replace
// each other instead of piling up.

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export function notificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** True when the page cannot be seen right now (other tab, screen off, other app). */
export function isAppHidden(): boolean {
  if (typeof document === 'undefined') return false
  return document.visibilityState === 'hidden'
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (existing) return existing
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

/** Incoming-message notifications for the hidden-but-alive page. On a
 *  push-subscribed device the service worker owns background notifications
 *  (it also covers frozen tabs, which this page can never reach) — so the
 *  page stays quiet to avoid a double banner + double sound. */
export async function notifyIncomingMessage(opts: {
  title: string
  body: string
  conversationId?: string
}): Promise<void> {
  try {
    const { getPushState } = await import('@/lib/push-client')
    if ((await getPushState()) === 'subscribed') return
  } catch {
    /* fall through — show from the page */
  }
  await showSystemNotification(opts)
}

/** Show an OS notification for an incoming message. Returns false when
 *  permission is missing or the browser refused. */
export async function showSystemNotification(opts: {
  title: string
  body: string
  conversationId?: string
}): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  try {
    const reg = (await ensureRegistration()) ?? null
    const options: NotificationOptions & { renotify?: boolean } = {
      body: opts.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: opts.conversationId || 'morse-message',
      renotify: true,
      data: { c: opts.conversationId },
    }
    if (reg) {
      await reg.showNotification(opts.title, options)
    } else if ('Notification' in window) {
      new Notification(opts.title, options)
    } else {
      return false
    }
    return true
  } catch {
    return false
  }
}
