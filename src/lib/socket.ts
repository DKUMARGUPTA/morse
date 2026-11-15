// Morse Messenger — socket client + global helpers (flash overlay bus, formatting)

import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useApp } from '@/lib/store'
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

let shared: Socket | null = null

export function useSocket() {
  const me = useApp((s) => s.me)

  useEffect(() => {
    if (!me) return
    const socket: Socket = io('/?XTransformPort=3003', {
      path: '/',
      auth: { userId: me.id },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })
    shared = socket

    socket.on('connect', () => useApp.getState().setSocketConnected(true))
    socket.on('disconnect', () => useApp.getState().setSocketConnected(false))
    socket.on('connect_error', () => useApp.getState().setSocketConnected(false))

    socket.on('presence', (data: { userId: string; online: boolean }) => {
      useApp.getState().setPresence(data.userId, data.online)
    })

    socket.on(
      'message:new',
      (data: { conversationId: string; message: MessageDTO }) => {
        void useApp.getState().applyMessageNew(data.conversationId, data.message)
      }
    )

    socket.on('message:update', (data: { conversationId: string; message: MessageDTO }) => {
      useApp.getState().applyMessageUpdate(data.conversationId, data.message)
    })

    socket.on('message:hidden', (data: { conversationId: string; messageId: string }) => {
      useApp.getState().applyMessageHidden(data.conversationId, data.messageId)
    })

    socket.on(
      'receipt:update',
      (data: { conversationId: string; messageId: string; delivered: boolean; read: boolean }) => {
        useApp.getState().applyReceipt(data.conversationId, data.messageId, data.delivered, data.read)
      }
    )

    socket.on(
      'typing',
      (data: { conversationId: string; userId: string; displayName: string; isTyping: boolean }) => {
        const state = useApp.getState()
        if (data.userId === me.id) return
        state.setTyping(data.conversationId, data.isTyping ? data.displayName : null)
        if (data.isTyping) {
          setTimeout(() => {
            const cur = useApp.getState().typingIn[data.conversationId]
            if (cur && Date.now() - cur.at > 4200) {
              useApp.getState().setTyping(data.conversationId, null)
            }
          }, 4500)
        }
      }
    )

    socket.on('conv:new', () => {
      void useApp.getState().loadConversations()
    })

    socket.on('conv:update', () => {
      void useApp.getState().loadConversations()
    })

    return () => {
      socket.disconnect()
      shared = null
      useApp.getState().setSocketConnected(false)
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
