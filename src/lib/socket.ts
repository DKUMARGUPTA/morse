// Morse Messenger — socket client + global helpers (flash overlay bus, formatting)
// Two transports with an identical event contract:
//   • socket.io bus (default: sandbox/preview via Caddy XTransformPort:3003)
//   • self-contained reconnecting WebSocket to the zero-dependency Cloudflare
//     realtime worker (enabled with NEXT_PUBLIC_REALTIME_WS — production path)

import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useApp } from '@/lib/store'
import { RealtimeSocket } from '@/lib/realtime-ws'
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

    // one handler set for both transports — the wire contract is identical
    const registerAll: RegisterAll = (subscribe) => {
      subscribe('presence', (d) => {
        useApp.getState().setPresence(String(d.userId ?? ''), !!d.online)
      })
      subscribe('presence:sync', (d) => {
        const online = Array.isArray(d.online) ? (d.online as string[]) : []
        for (const id of online) useApp.getState().setPresence(String(id), true)
      })
      subscribe('message:new', (d) => {
        void useApp.getState().applyMessageNew(String(d.conversationId ?? ''), d.message as MessageDTO)
      })
      subscribe('message:update', (d) => {
        useApp.getState().applyMessageUpdate(String(d.conversationId ?? ''), d.message as MessageDTO)
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

    if (process.env.NEXT_PUBLIC_REALTIME_WS) {
      // ---------- production transport: zero-dependency CF WebSocket ----------
      const rt = new RealtimeSocket(
        process.env.NEXT_PUBLIC_REALTIME_WS,
        fetchToken,
        (connected) => useApp.getState().setSocketConnected(connected)
      )
      registerAll((event, cb) => rt.on(event, cb))
      rt.connect()
      shared = rt
      cleanup = () => rt.close()
    } else {
      // ---------- sandbox/preview transport: socket.io via Caddy ----------
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
    }

    return () => {
      cancelled = true
      cleanup()
      shared = null
    }
  }, [me?.id])
}

export function emitTyping(conversationId: string, displayName: string, isTyping: boolean) {
  shared?.emit('typing', { conversationId, displayName, isTyping })
}

/** Join/leave a conversation room (used for typing indicators). */
export function joinConversationRoom(conversationId: string | null) {
  if (!conversationId) return
  shared?.emit('join', conversationId)
}

export function leaveConversationRoom(conversationId: string) {
  shared?.emit('leave', conversationId)
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
