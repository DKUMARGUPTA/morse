// Morse Messenger — Web Push client helper (ROADMAP P0)
// Permission flow + pushManager.subscribe with the server's VAPID key.
// iOS Safari 16.4+ is supported when the app is installed to the home screen.

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'off'

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js')
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'off'
  } catch {
    return 'off'
  }
}

/** Ask permission, subscribe, and persist the subscription server-side. */
export async function enablePush(): Promise<{ ok: boolean; error?: 'denied' | 'key' | 'subscribe' }> {
  if (!pushSupported()) return { ok: false, error: 'subscribe' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: 'denied' }

  try {
    const keyRes = await fetch('/api/push/key')
    if (!keyRes.ok) return { ok: false, error: 'key' }
    const { publicKey } = (await keyRes.json()) as { publicKey: string }

    const reg = await registration()
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey) as BufferSource,
      }))

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    if (!res.ok) {
      // server rejected — roll back so the UI reflects reality
      await sub.unsubscribe().catch(() => undefined)
      return { ok: false, error: 'subscribe' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'subscribe' }
  }
}

/** Unsubscribe this device locally and server-side. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe().catch(() => undefined)
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined)
    }
  } catch {
    /* best-effort */
  }
}
