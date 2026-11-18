// Morse Messenger — global client state (zustand)

import { create } from 'zustand'
import type {
  ChatDisplayMode,
  ConversationDTO,
  InvitationDTO,
  LearnStateDTO,
  MessageDTO,
  PlayMode,
  SearchHitDTO,
  SendMode,
  SettingsDTO,
  UserDTO,
} from '@/lib/types'
import type { Lang, DictKey } from '@/lib/i18n'
import { t } from '@/lib/i18n'
import { decryptText, encryptText, publishPublicKey } from '@/lib/e2ee'
import { playChime, vibrate } from '@/lib/notification-sound'
import { isAppHidden, notifyIncomingMessage } from '@/lib/system-notifications'

export type Tab = 'chats' | 'morse' | 'learn' | 'settings'

export interface NotificationItem {
  id: string
  type: 'message' | 'invitation' | 'system'
  titleKey: DictKey
  body: string
  conversationId?: string
  createdAt: number
  read: boolean
}

interface AppState {
  me: (UserDTO & { email: string; emailVerified: boolean }) | null
  settings: SettingsDTO | null
  sessionLoaded: boolean
  socketConnected: boolean
  /** false = no realtime transport is configured in this environment */
  socketAvailable: boolean
  tab: Tab
  online: Record<string, boolean>
  conversations: ConversationDTO[]
  conversationsLoaded: boolean
  activeId: string | null
  messages: Record<string, MessageDTO[]>
  displayModes: Record<string, ChatDisplayMode>
  typingIn: Record<string, { name: string; at: number }>
  notifications: NotificationItem[]
  replyTo: MessageDTO | null
  composerDraft: Record<string, string>
  pendingInviteCode: string | null
  activeInvite: string | null
  learn: LearnStateDTO | null
  /** E2EE (beta): peer userId -> public key JWK (null when not published yet) */
  peerKeys: Record<string, string | null>
  /** E2EE (beta): messageId -> locally decrypted plaintext */
  e2eeTexts: Record<string, string>
  /** E2EE (beta): messageId -> true when decryption impossible (missing key etc.) */
  e2eeFailed: Record<string, boolean>
  // actions
  setTab: (tab: Tab) => void
  loadSession: () => Promise<void>
  setSession: (user: AppState['me']) => Promise<void>
  clearSession: () => void
  setSocketConnected: (v: boolean) => void
  setSocketAvailable: (v: boolean) => void
  setPresence: (userId: string, online: boolean) => void
  loadConversations: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  /** refetch one conversation's messages (used for oversized realtime stubs) */
  reloadConversation: (id: string, opts?: { skipListRefresh?: boolean }) => Promise<void>
  closeConversation: () => void
  startConversationWith: (userId: string) => Promise<string | null>
  sendMessage: (text: string, sendMode: SendMode, playMode: PlayMode | null) => Promise<boolean>
  editMessage: (id: string, text: string) => Promise<boolean>
  deleteForMe: (id: string) => Promise<void>
  applyMessageNew: (conversationId: string, message: MessageDTO) => Promise<void>
  applyMessageUpdate: (conversationId: string, message: MessageDTO) => void
  applyMessageHidden: (conversationId: string, messageId: string) => void
  applyReceipt: (conversationId: string, messageId: string, delivered: boolean, read: boolean) => void
  setTyping: (conversationId: string, name: string | null) => void
  addNotification: (n: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => void
  markNotificationsRead: () => void
  setReplyTo: (m: MessageDTO | null) => void
  setDraft: (conversationId: string, text: string) => void
  setDisplayMode: (conversationId: string, mode: ChatDisplayMode) => void
  updateSettings: (patch: Partial<SettingsDTO>) => Promise<void>
  updateDisplayName: (name: string) => Promise<boolean>
  loadLearn: () => Promise<void>
  setPendingInvite: (code: string | null) => void
  setActiveInvite: (code: string | null) => void
  createGroup: (name: string, memberIds: string[]) => Promise<string | null>
  toggleConvPrefs: (id: string, patch: { pinned?: boolean; muted?: boolean }) => Promise<void>
  renameGroup: (id: string, name: string) => Promise<boolean>
  addGroupMembers: (id: string, userIds: string[]) => Promise<boolean>
  toggleE2EE: (id: string, enabled: boolean) => Promise<boolean>
  searchMessages: (q: string) => Promise<SearchHitDTO[]>
  loadPeerKeys: () => Promise<void>
  decryptMessages: (messages: Array<Pick<MessageDTO, 'id' | 'conversationId' | 'text' | 'encrypted'>>) => Promise<void>
  lang: () => Lang
  tr: (key: DictKey) => string
}

const DISPLAY_MODES_KEY = 'mm_display_modes'

function loadDisplayModes(): Record<string, ChatDisplayMode> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(DISPLAY_MODES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const useApp = create<AppState>((set, get) => ({
  me: null,
  settings: null,
  sessionLoaded: false,
  socketConnected: false,
  socketAvailable: true,
  tab: 'chats',
  online: {},
  conversations: [],
  conversationsLoaded: false,
  activeId: null,
  messages: {},
  displayModes: {},
  typingIn: {},
  notifications: [],
  replyTo: null,
  composerDraft: {},
  pendingInviteCode: null,
  activeInvite: null,
  learn: null,
  peerKeys: {},
  e2eeTexts: {},
  e2eeFailed: {},

  lang: () => (get().settings?.language === 'hi' ? 'hi' : 'en'),
  tr: (key) => t(get().settings?.language === 'hi' ? 'hi' : 'en', key),

  setTab: (tab) => set({ tab }),

  loadSession: async () => {
    try {
      // fire the conversations fetch in parallel with /api/auth/me — it only
      // needs the session cookie, so the list is ready one RTT earlier
      const conversationsPromise = get().loadConversations()
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      // handle ?invite=CODE links (PRD 5.2)
      const params = new URLSearchParams(window.location.search)
      const code = params.get('invite')?.toUpperCase() ?? null
      if (code) {
        params.delete('invite')
        const rest = params.toString()
        window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
      }
      if (data.user) {
        set({
          me: data.user,
          settings: data.settings,
          sessionLoaded: true,
          displayModes: loadDisplayModes(),
          ...(code ? { activeInvite: code } : {}),
        })
        await conversationsPromise
        void publishPublicKey().then(() => get().loadPeerKeys())
      } else {
        set({
          me: null,
          settings: null,
          sessionLoaded: true,
          displayModes: loadDisplayModes(),
          ...(code ? { pendingInviteCode: code } : {}),
        })
      }
    } catch {
      set({ sessionLoaded: true })
    }
  },

  setSession: async (user) => {
    set({ me: user, sessionLoaded: true })
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    set({ me: data.user ?? user, settings: data.settings })
    const pending = get().pendingInviteCode
    if (pending) {
      set({ activeInvite: pending, pendingInviteCode: null })
    }
    void get().loadConversations()
    void publishPublicKey().then(() => get().loadPeerKeys())
  },

  clearSession: () =>
    set({
      me: null,
      settings: null,
      conversations: [],
      conversationsLoaded: false,
      activeId: null,
      messages: {},
      notifications: [],
      learn: null,
      peerKeys: {},
      e2eeTexts: {},
      e2eeFailed: {},
    }),

  setSocketConnected: (v) => set({ socketConnected: v }),
  setSocketAvailable: (v) => set({ socketAvailable: v }),
  setPresence: (userId, online) => set((s) => ({ online: { ...s.online, [userId]: online } })),

  loadConversations: async () => {
    try {
      // prev list is the diff baseline: whatever changed server-side since the
      // last fetch is treated as "arrived just now" (drives sound + open-chat
      // refresh even when realtime transport is down)
      const prev = get().conversations
      const res = await fetch('/api/conversations')
      if (!res.ok) return
      const data = await res.json()
      const next = data.conversations as ConversationDTO[]
      set((s) => ({
        conversations: next.map((c) => (c.id === s.activeId ? { ...c, unreadCount: 0 } : c)),
        conversationsLoaded: true,
      }))

      // ---- diff prev vs next: detect freshly arrived messages ----
      const me = get().me
      const settings = get().settings
      const activeId = get().activeId
      if (me && prev.length > 0) {
        const prevMap = new Map(prev.map((c) => [c.id, c]))
        for (const c of next) {
          const p = prevMap.get(c.id)
          const lastId = c.lastMessage?.id ?? null
          const prevLastId = p?.lastMessage?.id ?? null
          if (!p || lastId === prevLastId || !c.lastMessage) continue

          const incoming =
            c.lastMessage.senderId !== me.id && c.lastMessage.kind !== 'system' && !c.muted
          if (incoming) {
            const preview = c.lastMessage.encrypted
              ? (get().e2eeTexts[c.lastMessage.id] ?? '···')
              : c.lastMessage.text
            const senderName = c.isGroup
              ? (c.members.find((m) => m.id === c.lastMessage!.senderId)?.displayName ?? c.name ?? '')
              : (c.peer?.displayName ?? c.name ?? '')
            if (c.id !== activeId) {
              get().addNotification({
                type: 'message',
                titleKey: 'notifNewMessage',
                body: `${senderName}: ${(preview || '···').slice(0, 60)}`,
                conversationId: c.id,
              })
            }
            if (settings?.soundEnabled) playChime(settings.volume)
            if (settings?.vibrationEnabled) vibrate(60)
            // OS notification while the app itself is in the background
            // (other tab / screen off / other app). A visible app shows the
            // in-app bell instead — no duplicate banners.
            if (isAppHidden()) {
              void notifyIncomingMessage({
                title: senderName,
                body: (preview || '···').slice(0, 80),
                conversationId: c.id,
              })
            }
          }
          // open conversation changed (either direction) — pull the messages so
          // the visible chat updates itself without a manual refresh
          if (c.id === activeId) {
            void get().reloadConversation(c.id, { skipListRefresh: true })
          }
        }
      }

      // decrypt E2EE previews so the list never shows stale ciphertext locks
      const previews = next
        .map((c) => (c.lastMessage ? { ...c.lastMessage, conversationId: c.id } : null))
        .filter((m): m is NonNullable<typeof m> => !!m && m.encrypted)
      if (previews.length > 0) void get().decryptMessages(previews)
    } catch {
      set({ conversationsLoaded: true })
    }
  },

  openConversation: async (id) => {
    set({ activeId: id, replyTo: null })
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) return
      const data = await res.json()
      set((s) => ({ messages: { ...s.messages, [id]: data.messages } }))
      // reset unread locally + mark read
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      }))
      void fetch(`/api/conversations/${id}/read`, { method: 'POST' })
      void get().decryptMessages(data.messages)
    } catch {
      // network error — retry handled by user
    }
  },

  reloadConversation: async (id, opts) => {
    if (!id) return
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) return
      const data = await res.json()
      set((s) => ({ messages: { ...s.messages, [id]: data.messages } }))
      void get().decryptMessages(data.messages)
      if (!opts?.skipListRefresh) void get().loadConversations()
    } catch {
      // network error — next realtime event or refresh recovers
    }
  },

  closeConversation: () => set({ activeId: null, replyTo: null }),

  startConversationWith: async (userId) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) return null
      await get().loadConversations()
      return data.conversationId
    } catch {
      return null
    }
  },

  sendMessage: async (text, sendMode, playMode) => {
    const { activeId, replyTo, me, conversations } = get()
    if (!activeId || !me) return false
    try {
      // E2EE (beta): encrypt locally before the text ever reaches the server
      let payloadText = text
      const conv = conversations.find((c) => c.id === activeId)
      if (conv?.e2eeEnabled && conv.peer) {
        if (!get().peerKeys[conv.peer.id]) await get().loadPeerKeys()
        const peerKey = get().peerKeys[conv.peer.id]
        if (!peerKey) {
          get().addNotification({
            type: 'system',
            titleKey: 'errGeneric',
            body: get().tr('e2eeKeyMissing'),
          })
          return false
        }
        const ct = await encryptText(peerKey, text)
        if (!ct) return false
        payloadText = ct
      }
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payloadText, sendMode, playMode, replyToId: replyTo?.id ?? null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 403) {
          get().addNotification({ type: 'system', titleKey: 'errGeneric', body: err.message ?? 'Blocked' })
        }
        return false
      }
      const data = await res.json()
      const message = data.message as MessageDTO
      if (message.encrypted) {
        set((s) => ({ e2eeTexts: { ...s.e2eeTexts, [message.id]: text }, e2eeFailed: { ...s.e2eeFailed, [message.id]: false } }))
      }
      set((s) => ({
        messages: {
          ...s.messages,
          [activeId]: [...(s.messages[activeId] ?? []).filter((m) => m.id !== message.id), message],
        },
        replyTo: null,
        composerDraft: { ...s.composerDraft, [activeId]: '' },
        conversations: s.conversations.map((c) =>
          c.id === activeId
            ? { ...c, lastMessage: { id: message.id, kind: message.kind, text: message.text, morse: message.morse, encrypted: message.encrypted, senderId: message.senderId, createdAt: message.createdAt }, updatedAt: message.createdAt }
            : c
        ),
      }))
      return true
    } catch {
      return false
    }
  },

  editMessage: async (id, text) => {
    try {
      // E2EE (beta): re-encrypt the edited text locally
      let payloadText = text
      const entry = Object.entries(get().messages).find(([, list]) => list.some((m) => m.id === id))
      const original = entry?.[1].find((m) => m.id === id)
      if (original?.encrypted) {
        const conv = get().conversations.find((c) => c.id === original.conversationId)
        if (conv?.peer) {
          if (!get().peerKeys[conv.peer.id]) await get().loadPeerKeys()
          const peerKey = get().peerKeys[conv.peer.id]
          if (!peerKey) return false
          const ct = await encryptText(peerKey, text)
          if (!ct) return false
          payloadText = ct
        }
      }
      const res = await fetch(`/api/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payloadText }),
      })
      if (!res.ok) return false
      const data = await res.json()
      const message = data.message as MessageDTO
      if (message.encrypted) {
        set((s) => ({ e2eeTexts: { ...s.e2eeTexts, [message.id]: text } }))
      }
      set((s) => ({
        messages: {
          ...s.messages,
          [message.conversationId]: (s.messages[message.conversationId] ?? []).map((m) =>
            m.id === message.id ? message : m
          ),
        },
      }))
      return true
    } catch {
      return false
    }
  },

  deleteForMe: async (id) => {
    try {
      await fetch(`/api/messages/${id}`, { method: 'DELETE' })
      const convId = get().activeId
      if (convId) {
        set((s) => ({
          messages: { ...s.messages, [convId]: (s.messages[convId] ?? []).filter((m) => m.id !== id) },
        }))
      }
    } catch {
      // ignore
    }
  },

  applyMessageNew: async (conversationId, message) => {
    const { me, activeId } = get()
    if (!me) return
    set((s) => {
      const list = s.messages[conversationId]
      if (!list) return s
      if (list.some((m) => m.id === message.id)) {
        return {
          ...s,
          messages: {
            ...s.messages,
            [conversationId]: list.map((m) => (m.id === message.id ? message : m)),
          },
        }
      }
      return {
        ...s,
        messages: { ...s.messages, [conversationId]: [...list, message] },
      }
    })
    // E2EE (beta): try to decrypt right away so previews are ready
    if (message.encrypted) await get().decryptMessages([message])
    // update conversation list
    const isMine = message.senderId === me.id
    const conv = get().conversations.find((c) => c.id === conversationId)
    const preview = message.encrypted ? (get().e2eeTexts[message.id] ?? '') : message.text
    set((s) => ({
      conversations: s.conversations.some((c) => c.id === conversationId)
        ? s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessage: { id: message.id, kind: message.kind, text: message.text, morse: message.morse, encrypted: message.encrypted, senderId: message.senderId, createdAt: message.createdAt },
                  updatedAt: message.createdAt,
                  unreadCount: isMine || activeId === conversationId || c.muted ? c.unreadCount : c.unreadCount + 1,
                }
              : c
          )
        : s.conversations,
    }))
    if (!isMine && !conv?.muted && message.kind !== 'system') {
      const settings = get().settings
      // bell entry only for background conversations — the open chat shows the
      // message itself, an extra notification would just be noise
      if (activeId !== conversationId) {
        get().addNotification({
          type: 'message',
          titleKey: 'notifNewMessage',
          body: `${message.senderName}: ${(preview || '...').slice(0, 60)}`,
          conversationId,
        })
        // refresh list in case conversation is new
        void get().loadConversations()
      }
      // sound + vibration for BOTH background and open conversations
      if (settings?.soundEnabled) playChime(settings.volume)
      if (settings?.vibrationEnabled) vibrate(60)
      // OS notification while the app is in the background (see loadConversations)
      if (isAppHidden()) {
        void notifyIncomingMessage({
          title: message.senderName,
          body: (preview || '···').slice(0, 80),
          conversationId,
        })
      }
    }
    if (activeId === conversationId && !isMine) {
      void fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' })
      void fetch('/api/messages/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: [message.id] }),
      })
    }
    if (activeId === conversationId) {
      set((s) => ({ typingIn: { ...s.typingIn, [conversationId]: undefined } as Record<string, { name: string; at: number }> }))
    }
  },

  applyMessageUpdate: (conversationId, message) => {
    if (message.encrypted) void get().decryptMessages([message])
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) => (m.id === message.id ? message : m)),
      },
    }))
  },

  applyMessageHidden: (conversationId, messageId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.id !== messageId),
      },
    }))
  },

  applyReceipt: (conversationId, messageId, delivered, read) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === messageId
            ? { ...m, delivered: m.delivered || delivered, read: m.read || read }
            : m
        ),
      },
    }))
  },

  setTyping: (conversationId, name) => {
    set((s) => ({
      typingIn: { ...s.typingIn, [conversationId]: name ? { name, at: Date.now() } : undefined } as Record<string, { name: string; at: number }>,
    }))
  },

  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { ...n, id: Math.random().toString(36).slice(2), createdAt: Date.now(), read: false },
        ...s.notifications,
      ].slice(0, 30),
    })),

  markNotificationsRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

  setReplyTo: (m) => set({ replyTo: m }),

  setDraft: (conversationId, text) =>
    set((s) => ({ composerDraft: { ...s.composerDraft, [conversationId]: text } })),

  setDisplayMode: (conversationId, mode) => {
    set((s) => {
      const next = { ...s.displayModes, [conversationId]: mode }
      try { localStorage.setItem(DISPLAY_MODES_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return { displayModes: next }
    })
  },

  updateSettings: async (patch) => {
    const prev = get().settings
    if (!prev) return
    set({ settings: { ...prev, ...patch } })
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const data = await res.json()
        set({ settings: data })
      } else {
        // server kept the old values — mirror that locally
        set({ settings: prev })
      }
    } catch {
      set({ settings: prev })
    }
  },

  updateDisplayName: async (name) => {
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      })
      if (!res.ok) return false
      const data = await res.json()
      set((s) => (s.me ? { me: { ...s.me, displayName: data.displayName } } : s))
      return true
    } catch {
      return false
    }
  },

  loadLearn: async () => {
    try {
      const res = await fetch('/api/learn')
      if (res.ok) set({ learn: await res.json() })
    } catch {
      // ignore
    }
  },

  // ---------- E2EE (beta) + groups ----------

  loadPeerKeys: async () => {
    try {
      const res = await fetch('/api/keys')
      if (!res.ok) return
      const data = await res.json()
      const map: Record<string, string | null> = {}
      for (const p of data.peerKeys ?? []) map[p.userId] = p.publicKey
      set({ peerKeys: map })
    } catch {
      /* ignore */
    }
  },

  decryptMessages: async (messages) => {
    const targets = messages.filter((m) => m.encrypted && !get().e2eeTexts[m.id])
    if (targets.length === 0) return
    const convIds = new Set(targets.map((m) => m.conversationId))
    const convs = get().conversations.filter((c) => convIds.has(c.id) && c.e2eeEnabled && c.peer)
    if (convs.some((c) => !get().peerKeys[c.peer!.id])) await get().loadPeerKeys()

    const updates: Record<string, string> = {}
    const failed: Record<string, boolean> = {}
    for (const m of targets) {
      const conv = get().conversations.find((c) => c.id === m.conversationId)
      const peerKey = conv?.peer ? get().peerKeys[conv.peer.id] : undefined
      if (!peerKey) {
        failed[m.id] = true
        continue
      }
      try {
        updates[m.id] = await decryptText(peerKey, m.text)
      } catch {
        failed[m.id] = true
      }
    }
    if (Object.keys(updates).length > 0 || Object.keys(failed).length > 0) {
      set((s) => ({
        e2eeTexts: { ...s.e2eeTexts, ...updates },
        e2eeFailed: { ...s.e2eeFailed, ...failed },
      }))
    }
  },

  toggleE2EE: async (id, enabled) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ e2eeEnabled: enabled }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err?.message) {
          get().addNotification({ type: 'system', titleKey: 'errGeneric', body: err.message })
        }
        return false
      }
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, e2eeEnabled: enabled } : c)),
      }))
      return true
    } catch {
      return false
    }
  },

  createGroup: async (name, memberIds) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, memberIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        get().addNotification({ type: 'system', titleKey: 'errGeneric', body: err.message ?? 'Could not create group' })
        return null
      }
      const data = await res.json()
      await get().loadConversations()
      return data.conversationId
    } catch {
      return null
    }
  },

  toggleConvPrefs: async (id, patch) => {
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
    try {
      await fetch(`/api/conversations/${id}/prefs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch {
      /* optimistic — list refresh will reconcile */
    }
  },

  renameGroup: async (id, name) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return false
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, name } : c)) }))
      return true
    } catch {
      return false
    }
  },

  addGroupMembers: async (id, userIds) => {
    try {
      const res = await fetch(`/api/conversations/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      })
      if (res.ok) await get().loadConversations()
      return res.ok
    } catch {
      return false
    }
  },

  searchMessages: async (q) => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.results ?? []
    } catch {
      return []
    }
  },

  setPendingInvite: (code) => set({ pendingInviteCode: code }),

  setActiveInvite: (code) => set({ activeInvite: code }),
}))
