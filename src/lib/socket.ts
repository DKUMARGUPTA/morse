// Morse Messenger — socket client + global helpers (flash overlay bus, formatting)
// Two transports with an identical event contract:
//   • socket.io bus (default: sandbox/preview via Caddy XTransformPort:3003)
//   • self-contained reconnecting WebSocket to the zero-dependency Cloudflare
//     realtime worker (enabled with NEXT_PUBLIC_REALTIME_WS — production path)

import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useApp } from '@/lib/store'
import { RealtimeSocket } from '@/lib/realtime-ws'
import { SupabaseRealtimeSocket } from '@/lib/supabase-realtime'
import { startPolling, stopPolling } from '@/lib/poller'
import type { MessageDTO } from '@/lib/types'

// ---------- light-flash event bus (screen signal channel) ----------

type FlashListener = (on: boolean) => void
const flashListeners = new Set<FlashListener>()

export function setFlash(on: boolean) {
  flashListeners.forEach((l) => l(on))
}

export function subscribeFlash(l: FlashListener): () => void {
  flashListeners.add(l)
  return () => {
    flashListeners.delete(l)
  }
}

// ---------- socket hook ----------

// minimal transport interface — both socket.io and the CF WebSocket satisfy it
let shared: { emit(event: string, data?: unknown): void } | null = null

type Subscribe = (event: string, cb: (data: Record<string, unknown>) => void) => void
type RegisterAll = (subscribe: Subscribe) => void

export function useSocket() {
  const me = useApp((s) => s.me)

  useEffect(() => {
    if (!me) return
    let cancelled = false

    async function fetchToken(): Promise<string> {
      try {
        const res = await fetch('/api/socket/token')
        if (res.ok) return ((await res.json()) as { token: string }).token
      } catch {
        /* realtime unavailable; the app still works via refresh */
      }
      return ''
    }

    // One handler set for both transports — the wire contract is identical.
    // supabaseTransport: Supabase topics are public broadcast channels joined
    // with the anon key, and the server only ever sends metadata stubs there
    // (see api-helpers.buildSupabaseBody). A full message DTO arriving on that
    // transport can only be a forged client broadcast — never trusted.
    let supabaseTransport = false

    const registerAll: RegisterAll = (subscribe) => {
      subscribe('presence', (d) => {
        useApp.getState().setPresence(String(d.userId ?? ''), !!d.online)
      })
      subscribe('presence:sync', (d) => {
        const online = Array.isArray(d.online) ? (d.online as string[]) : []
        for (const id of online) useApp.getState().setPresence(String(id), true)
      })
      subscribe('message:new', (d) => {
        const msg = d.message as MessageDTO | undefined
        if (msg?.id) {
          if (supabaseTransport) return
          void useApp.getState().applyMessageNew(String(d.conversationId ?? ''), msg)
        } else {
          // metadata-only broadcast (stub) — refetch and apply with notifications
          void useApp.getState().applyMessageStub(String(d.conversationId ?? ''))
        }
      })
      subscribe('message:update', (d) => {
        const msg = d.message as MessageDTO | undefined
        if (msg?.id) {
          if (supabaseTransport) return
          useApp.getState().applyMessageUpdate(String(d.conversationId ?? ''), msg)
        } else {
          void useApp.getState().reloadConversation(String(d.conversationId ?? ''))
        }
      })
      subscribe('message:hidden', (d) => {
        useApp.getState().applyMessageHidden(String(d.conversationId ?? ''), String(d.messageId ?? ''))
      })
      subscribe('receipt:update', (d) => {
        useApp.getState().applyReceipt(String(d.conversationId ?? ''), String(d.messageId ?? ''), !!d.delivered, !!d.read)
      })
      subscribe('typing', (d) => {
        const state = useApp.getState()
        const userId = String(d.userId ?? '')
        if (userId === me.id) return
        const conversationId = String(d.conversationId ?? '')
        state.setTyping(conversationId, d.isTyping ? String(d.displayName ?? '') : null)
        if (d.isTyping) {
          setTimeout(() => {
            const cur = useApp.getState().typingIn[conversationId]
            if (cur && Date.now() - cur.at > 4200) {
              useApp.getState().setTyping(conversationId, null)
            }
          }, 4500)
        }
      })
      subscribe('conv:new', () => {
        void useApp.getState().loadConversations()
      })
      subscribe('conv:update', () => {
        void useApp.getState().loadConversations()
      })
    }

    let cleanup: () => void

    // The poller runs in EVERY mode as a safety net: it self-skips while a
    // realtime transport is connected, and quietly keeps messages + sounds
    // flowing whenever the transport is missing or disconnected.
    startPolling()

    if (process.env.NEXT_PUBLIC_REALTIME_WS) {
      // ---------- production transport A: zero-dependency CF WebSocket ----------
      useApp.getState().setSocketAvailable(true)
      const rt = new RealtimeSocket(
        process.env.NEXT_PUBLIC_REALTIME_WS,
        fetchToken,
        (connected) => useApp.getState().setSocketConnected(connected)
      )
      registerAll((event, cb) => rt.on(event, cb))
      rt.connect()
      shared = rt
      cleanup = () => rt.close()
    } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      // ---------- production transport B: Supabase Realtime broadcast ----------
      // Raw Phoenix-protocol WebSocket, zero dependencies, no extra infra.
      // Fanout comes from the API via the Supabase broadcast HTTP endpoint —
      // metadata stubs only (message bodies are refetched over the API).
      useApp.getState().setSocketAvailable(true)
      supabaseTransport = true
      const sb = new SupabaseRealtimeSocket(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        me.id,
        (connected) => useApp.getState().setSocketConnected(connected)
      )
      registerAll((event, cb) => sb.on(event, cb))
      sb.connect()
      shared = sb
      cleanup = () => sb.close()
    } else if (process.env.NODE_ENV === 'development') {
      // ---------- sandbox/preview transport: socket.io via Caddy ----------
      // Dev/preview only. A production build without a configured transport
      // deliberately runs with none: retrying handshakes against serverless
      // would burn thousands of function invocations per idle tab.
      useApp.getState().setSocketAvailable(true)
      let socket: Socket | null = null
      let lastAuthRetry = 0

      const attach = (s: Socket) => {
        s.on('connect', () => useApp.getState().setSocketConnected(true))
        s.on('disconnect', () => useApp.getState().setSocketConnected(false))
        s.on('connect_error', () => {
          useApp.getState().setSocketConnected(false)
          // the handshake token may have expired — refresh it and re-authenticate
          // (guarded so a persistently failing socket cannot spam the API)
          const now = Date.now()
          if (now - lastAuthRetry > 60_000) {
            lastAuthRetry = now
            void fetch('/api/socket/token')
              .then(async (r) => (r.ok ? ((await r.json()) as { token: string }) : null))
              .then((data) => {
                if (data?.token && socket) {
                  socket.auth = { token: data.token }
                  socket.connect()
                }
              })
              .catch(() => undefined)
          }
        })
        registerAll((event, cb) => s.on(event, cb as (...args: unknown[]) => void))
      }

      void (async () => {
        // realtime needs a signed socket token — the httpOnly session cookie cannot be read here
        const token = await fetchToken()
        if (cancelled) return

        socket = io('/?XTransformPort=3003', {
          path: '/',
          auth: { token },
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        })
        attach(socket)
        shared = socket
      })()

      cleanup = () => {
        socket?.disconnect()
        useApp.getState().setSocketConnected(false)
      }
    } else {
      // ---------- production without any transport: honest offline state ----------
      // The app still works fully via fetch + refresh; realtime switches on
      // as soon as a transport is configured in the environment.
      useApp.getState().setSocketAvailable(false)
      cleanup = () => undefined
    }

    return () => {
      cancelled = true
      cleanup()
      stopPolling()
      shared = null
    }
  }, [me?.id])
}

export function emitTyping(conversationId: string, displayName: string, isTyping: boolean) {
  shared?.emit('typing', { conversationId, displayName, isTyping })
}

/** Join/leave a conversation room (used for typing indicators).
 *  Always an object so both transports (socket.io bus and the CF relay)
 *  carry the identical wire shape `{ conversationId }`. */
export function joinConversationRoom(conversationId: string | null) {
  if (!conversationId) return
  shared?.emit('join', { conversationId })
}

export function leaveConversationRoom(conversationId: string) {
  shared?.emit('leave', { conversationId })
}

// ---------- time formatting ----------

export function formatTime(iso: string, lang: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

export function formatDayLabel(iso: string, lang: string, trToday: string, trYesterday: string): string | null {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (diffDays === 0) return trToday
  if (diffDays === 1) return trYesterday
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}
