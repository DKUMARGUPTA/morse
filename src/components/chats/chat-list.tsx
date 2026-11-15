'use client'

// Morse Messenger — chat list (mobile: single pane, desktop: two-pane)
// Phase 2: groups, pin/mute, and message search across conversations.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, MessageCircle, Bell, Pin, BellOff, Lock } from 'lucide-react'
import { Avatar, GroupAvatar, systemText } from '@/components/shared'
import { ConversationView } from '@/components/chats/conversation-view'
import { NewChatDialog } from '@/components/chats/new-chat-dialog'
import { NotificationBell } from '@/components/notification-bell'
import { useApp } from '@/lib/store'
import { formatTime } from '@/lib/socket'
import type { SearchHitDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ChatList() {
  const tr = useApp((s) => s.tr)
  const conversations = useApp((s) => s.conversations)
  const conversationsLoaded = useApp((s) => s.conversationsLoaded)
  const activeId = useApp((s) => s.activeId)
  const openConversation = useApp((s) => s.openConversation)
  const e2eeTexts = useApp((s) => s.e2eeTexts)
  const unreadNotifs = useApp((s) => s.notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0))
  const [q, setQ] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [hits, setHits] = useState<SearchHitDTO[]>([])
  const searchSeq = useRef(0)

  // server-side message search (debounced); E2EE conversations are searched locally
  useEffect(() => {
    const needle = q.trim()
    if (needle.length < 2) {
      setHits([])
      return
    }
    const seq = ++searchSeq.current
    const timer = setTimeout(async () => {
      try {
        const results = await useApp.getState().searchMessages(needle)
        if (seq === searchSeq.current) setHits(results)
      } catch {
        if (seq === searchSeq.current) setHits([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter((c) => {
      const title = (c.isGroup ? c.name : c.peer?.displayName) ?? ''
      if (title.toLowerCase().includes(needle)) return true
      // last message preview (decrypt E2EE when possible)
      const last = c.lastMessage
      if (!last) return false
      const text = last.encrypted ? (e2eeTexts[last.id] ?? '') : last.text
      return text.toLowerCase().includes(needle)
    })
  }, [conversations, q, e2eeTexts])

  const active = conversations.find((c) => c.id === activeId) ?? null
  const meId = useApp.getState().me?.id

  function convTitle(c: (typeof conversations)[number]) {
    return c.isGroup ? (c.name ?? tr('newGroup')) : (c.peer?.displayName ?? '')
  }

  function lastPreview(c: (typeof conversations)[number]): string {
    const last = c.lastMessage
    if (!last) return tr('startChat')
    if (last.kind === 'system') return systemText(last.text, (k) => tr(k))
    const text = last.encrypted ? (e2eeTexts[last.id] ?? tr('e2eeEncryptedMsg')) : last.text
    if (c.isGroup && last.senderId !== meId) {
      const sender = c.members.find((m) => m.id === last.senderId)?.displayName
      return sender ? `${sender}: ${text}` : text
    }
    return `${last.senderId === meId ? `${tr('you')}: ` : ''}${text}`
  }

  return (
    <div className="flex h-full">
      {/* list pane */}
      <div
        className={cn(
          'flex min-h-0 w-full flex-col border-r border-[#1E2C4F] md:w-80 md:shrink-0',
          active && 'hidden md:flex'
        )}
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-lg font-bold">{tr('navChats')}</h2>
          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <NotificationBell unread={unreadNotifs} label={<Bell className="h-5 w-5 text-[#C9D6F2]" />} />
            </div>
            <button
              onClick={() => setNewChatOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#22D3EE] text-[#06121F] transition hover:bg-[#67E8F9]"
              aria-label={tr('newChat')}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-[#1E2C4F] bg-[#0C1428] px-3">
            <Search className="h-4 w-4 shrink-0 text-[#3D527A]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('searchChats')}
              aria-label={tr('searchChats')}
              className="h-10 w-full bg-transparent text-sm text-[#E7EEFB] placeholder:text-[#3D527A] focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {!conversationsLoaded ? (
            <div className="space-y-2 px-2 pt-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-[#101B33]" />
              ))}
            </div>
          ) : filtered.length === 0 && hits.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1E2C4F] bg-[#101B33]">
                <MessageCircle className="h-7 w-7 text-[#22D3EE]" />
              </div>
              <p className="font-semibold">{tr('noChats')}</p>
              <p className="text-sm text-[#8CA3C7]">{tr('noChatsHint')}</p>
              <button
                onClick={() => setNewChatOpen(true)}
                className="mt-1 h-10 rounded-xl bg-[#22D3EE] px-4 text-sm font-semibold text-[#06121F] hover:bg-[#67E8F9]"
              >
                {tr('startChat')}
              </button>
            </div>
          ) : (
            <>
              {filtered.map((c) => {
                const last = c.lastMessage
                const isGroup = c.isGroup
                return (
                  <button
                    key={c.id}
                    onClick={() => void openConversation(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-[#101B33]',
                      activeId === c.id && 'bg-[#22D3EE]/10'
                    )}
                  >
                    {isGroup ? (
                      <GroupAvatar
                        name={convTitle(c)}
                        colors={c.members.filter((m) => m.id !== meId).map((m) => m.avatarColor)}
                      />
                    ) : (
                      <Avatar user={c.peer!} online={useApp.getState().online[c.peer!.id]} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                          <span className="truncate">{convTitle(c)}</span>
                          {c.pinned && <Pin className="h-3 w-3 shrink-0 text-[#22D3EE]" aria-label={tr('pinned')} />}
                          {c.muted && <BellOff className="h-3 w-3 shrink-0 text-[#8CA3C7]" aria-label={tr('mutedLabel')} />}
                          {c.e2eeEnabled && <Lock className="h-3 w-3 shrink-0 text-[#22D3EE]" aria-label={tr('e2eeToggle')} />}
                        </p>
                        {last && (
                          <span className="shrink-0 text-[10px] text-[#8CA3C7]">
                            {formatTime(last.createdAt, useApp.getState().settings?.language ?? 'en')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-[#8CA3C7]">{lastPreview(c)}</p>
                        {c.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#22D3EE] px-1.5 text-[10px] font-bold text-[#06121F]">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}

              {hits.length > 0 && (
                <div className="mt-3">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[#3D527A]">
                    {tr('messagesFound')}
                  </p>
                  {hits.map((h) => (
                    <button
                      key={h.messageId}
                      onClick={() => void openConversation(h.conversationId)}
                      className="flex w-full flex-col gap-0.5 rounded-xl p-2.5 text-left transition-colors hover:bg-[#101B33]"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-[#C9D6F2]">
                          {h.convTitle} · {h.senderName}
                        </p>
                        <span className="shrink-0 text-[10px] text-[#3D527A]">
                          {formatTime(h.createdAt, useApp.getState().settings?.language ?? 'en')}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[#8CA3C7]">{h.text}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* conversation pane */}
      <div className={cn('min-w-0 flex-1', !active && 'hidden md:block')}>
        {active ? (
          <ConversationView conv={active} onBack={() => useApp.getState().closeConversation()} />
        ) : (
          <div className="hidden h-full flex-col items-center justify-center gap-3 text-center md:flex">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-[#1E2C4F] bg-[#101B33]">
              <svg width="40" height="40" viewBox="0 0 26 26" fill="none" aria-hidden>
                <circle cx="4" cy="13" r="2.4" fill="#22D3EE" />
                <rect x="9" y="11.4" width="9" height="3.2" rx="1.6" fill="#22D3EE" />
                <circle cx="22" cy="13" r="2.4" fill="#22D3EE" />
              </svg>
            </div>
            <p className="text-sm text-[#8CA3C7]">{tr('selectChat')}</p>
          </div>
        )}
      </div>

      {newChatOpen && <NewChatDialog onClose={() => setNewChatOpen(false)} />}
    </div>
  )
}
