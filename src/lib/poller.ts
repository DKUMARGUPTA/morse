// Morse Messenger — background refresh poller.
//
// Safety net for environments where no realtime transport is connected
// (transport misconfigured, Supabase outage, socket stuck reconnecting…).
// Every few seconds it re-fetches the conversation list; the store diffs the
// result against the previous list and plays the notification sound / refreshes
// the open chat when something new arrived.
//
// When realtime IS healthy the poll self-skips — zero extra network traffic.

import { useApp } from '@/lib/store'

const POLL_MS = 5_000

let timer: ReturnType<typeof setInterval> | null = null
let inFlight = false
let listenersAttached = false

function onRegainVisibility() {
  // returning to the tab / PWA — sync immediately so late messages appear
  // (and chime) the moment the user looks at the app again
  void poll()
}

async function poll(): Promise<void> {
  if (inFlight) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const s = useApp.getState()
  if (!s.me || !s.sessionLoaded) return
  // realtime transport alive? then it already pushes everything — skip
  if (s.socketAvailable && s.socketConnected) return

  inFlight = true
  try {
    await s.loadConversations()
  } catch {
    /* offline — next tick retries */
  } finally {
    inFlight = false
  }
}

export function startPolling(): void {
  if (timer) return
  void poll()
  timer = setInterval(() => void poll(), POLL_MS)
  if (!listenersAttached && typeof document !== 'undefined') {
    listenersAttached = true
    document.addEventListener('visibilitychange', onRegainVisibility)
    window.addEventListener('focus', onRegainVisibility)
  }
}

export function stopPolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (listenersAttached) {
    listenersAttached = false
    document.removeEventListener('visibilitychange', onRegainVisibility)
    window.removeEventListener('focus', onRegainVisibility)
  }
}
