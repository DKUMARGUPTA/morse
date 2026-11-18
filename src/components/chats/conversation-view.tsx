'use client'

// Morse Messenger — conversation view: history, display modes, chat settings
// Phase 2: groups (info sheet, rename, add members, leave) + pin/mute.
// Phase 5: E2EE beta toggle for 1:1 chats.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MoreVertical, ShieldBan, Flag, Trash2, Loader2, Lock, Pin, PinOff, BellOff, Bell, UserPlus, LogOut, Pencil, Info } from 'lucide-react'
import { Avatar, GroupAvatar } from '@/components/shared'
import { MessageBubble } from '@/components/chats/message-bubble'
import { Composer } from '@/components/chats/composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useApp } from '@/lib/store'
import { formatDayLabel, joinConversationRoom, leaveConversationRoom } from '@/lib/socket'
import type { ChatDisplayMode, ConversationDTO, MessageDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TelegraphPad } from '@/components/chats/telegraph-pad'
import { Input } from '@/components/ui/input'
import type { UserDTO } from '@/lib/types'

export function ConversationView({ conv, onBack }: { conv: ConversationDTO; onBack: () => void }) {
  const tr = useApp((s) => s.tr)
  const messages = useApp((s) => s.messages[conv.id])
  const displayMode = useApp((s) => s.displayModes[conv.id] ?? 'text')
  const setDisplayMode = useApp((s) => s.setDisplayMode)
  const typing = useApp((s) => s.typingIn[conv.id])
  const online = useApp((s) => (conv.peer ? s.online[conv.peer.id] : false))
  const meId = useApp((s) => s.me?.id)
  const [showTelegraph, setShowTelegraph] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState(conv.name ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomAnchor = useRef<HTMLDivElement>(null)

  const isGroup = conv.isGroup
  const isOwner = conv.myRole === 'owner'
  const title = isGroup ? (conv.name ?? tr('newGroup')) : (conv.peer?.displayName ?? '')
  const blockedState = conv.blockedByMe || conv.blockedMe

  useEffect(() => {
    bottomAnchor.current?.scrollIntoView({ behavior: 'auto' })
  }, [conv.id])

  // join the conversation room for typing indicators
  useEffect(() => {
    joinConversationRoom(conv.id)
    return () => leaveConversationRoom(conv.id)
  }, [conv.id])

  useEffect(() => {
    bottomAnchor.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length])

  const grouped = useMemo(() => {
    const lang = useApp.getState().settings?.language ?? 'en'
    const out: { day: string | null; items: MessageDTO[] }[] = []
    let lastDay: string | null = null
    for (const m of messages ?? []) {
      const day = formatDayLabel(m.createdAt, lang, tr('today'), tr('yesterday'))
      if (day !== lastDay) {
        out.push({ day, items: [m] })
        lastDay = day
      } else {
        out[out.length - 1].items.push(m)
      }
    }
    return out
  }, [messages, tr])

  function startEdit(m: MessageDTO) {
    window.dispatchEvent(new CustomEvent('mm-edit-message', { detail: { id: m.id, text: useApp.getState().e2eeTexts[m.id] ?? m.text } }))
  }

  async function submitReport() {
    if (!reportReason.trim() || !conv.peer) return
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportedId: conv.peer.id, reason: reportReason }),
    })
    setReportOpen(false)
    setReportReason('')
  }

  async function removeChat() {
    await fetch(`/api/conversations/${conv.id}`, { method: 'DELETE' })
    await useApp.getState().loadConversations()
    useApp.getState().closeConversation()
  }

  async function toggleE2EE() {
    await useApp.getState().toggleE2EE(conv.id, !conv.e2eeEnabled)
  }

  async function submitRename() {
    if (!newName.trim()) return
    const okRename = await useApp.getState().renameGroup(conv.id, newName.trim())
    if (okRename) setRenameOpen(false)
  }

  const subtitle = typing
    ? `${typing.name} ${tr('typing')}...`
    : isGroup
      ? `${conv.members.length} ${tr('members')}`
      : online
        ? tr('online')
        : ''

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="flex items-center gap-2 border-b border-[#1E2C4F] bg-[#0C1428] px-3 py-2.5 md:px-4">
        <button onClick={onBack} className="rounded-full p-1.5 text-[#8CA3C7] hover:bg-[#101B33] md:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {isGroup ? (
          <GroupAvatar name={title} colors={conv.members.filter((m) => m.id !== meId).map((m) => m.avatarColor)} size="md" />
        ) : (
          <Avatar user={conv.peer!} online={online} />
        )}
        <button
          onClick={() => isGroup && setInfoOpen(true)}
          className="min-w-0 flex-1 text-left leading-tight"
          aria-label={isGroup ? tr('members') : undefined}
        >
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <span className="truncate">{title}</span>
            {conv.e2eeEnabled && <Lock className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" aria-label={tr('e2eeToggle')} />}
            {isGroup && <Info className="h-3.5 w-3.5 shrink-0 text-[#8CA3C7]" />}
          </p>
          <p className="truncate text-[11px] text-[#8CA3C7]">
            {typing ? <span className="text-[#22D3EE]">{subtitle}</span> : subtitle}
          </p>
        </button>

        <div className="flex items-center gap-0.5 rounded-lg bg-[#0A1224] p-0.5" role="tablist" aria-label={tr('displayAs')}>
          {(
            [
              ['text', 'T'],
              ['morse', '·−'],
              ['dual', 'T·−'],
            ] as [ChatDisplayMode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={displayMode === m}
              onClick={() => setDisplayMode(conv.id, m)}
              title={m}
              className={cn(
                'h-7 rounded-md px-2 font-mono text-[11px] font-medium transition-colors',
                displayMode === m ? 'bg-[#22D3EE] text-[#06121F]' : 'text-[#8CA3C7] hover:text-[#C9D6F2]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full p-1.5 text-[#8CA3C7] hover:bg-[#101B33]" aria-label={tr('conversationSettings')}>
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB]">
            <DropdownMenuLabel className="text-[#8CA3C7]">{tr('displayAs')}</DropdownMenuLabel>
            {(['text', 'morse', 'dual'] as ChatDisplayMode[]).map((m) => (
              <DropdownMenuItem key={m} onClick={() => setDisplayMode(conv.id, m)} className="gap-2 focus:bg-[#0A1224]">
                {m === 'text' ? tr('modeText') : m === 'morse' ? tr('modeMorse') : tr('modeDual')}
                {displayMode === m && <span className="ml-auto text-[#22D3EE]">✓</span>}
              </DropdownMenuItem>
            ))}
            <div className="my-1 h-px bg-[#1E2C4F]" />
            <DropdownMenuItem onClick={() => void useApp.getState().toggleConvPrefs(conv.id, { pinned: !conv.pinned })} className="gap-2 focus:bg-[#0A1224]">
              {conv.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {conv.pinned ? tr('unpin') : tr('pin')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void useApp.getState().toggleConvPrefs(conv.id, { muted: !conv.muted })} className="gap-2 focus:bg-[#0A1224]">
              {conv.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              {conv.muted ? tr('unmute') : tr('mute')}
            </DropdownMenuItem>
            {!isGroup && (
              <DropdownMenuItem onClick={() => void toggleE2EE()} className="gap-2 focus:bg-[#0A1224]">
                <Lock className="h-4 w-4" />
                <span className="flex items-center gap-1.5">
                  {tr('e2eeToggle')}
                  <span className="rounded bg-[#22D3EE]/15 px-1 text-[9px] font-bold uppercase text-[#22D3EE]">{tr('e2eeBeta')}</span>
                </span>
                <span className="ml-auto text-[#22D3EE]">{conv.e2eeEnabled ? 'ON' : 'OFF'}</span>
              </DropdownMenuItem>
            )}
            {isGroup && isOwner && (
              <>
                <DropdownMenuItem onClick={() => setRenameOpen(true)} className="gap-2 focus:bg-[#0A1224]">
                  <Pencil className="h-4 w-4" /> {tr('renameGroup')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddOpen(true)} className="gap-2 focus:bg-[#0A1224]">
                  <UserPlus className="h-4 w-4" /> {tr('addMembers')}
                </DropdownMenuItem>
              </>
            )}
            <div className="my-1 h-px bg-[#1E2C4F]" />
            {!isGroup && (
              <>
                <DropdownMenuItem
                  onClick={async () => {
                    await fetch('/api/block', {
                      method: conv.blockedByMe ? 'DELETE' : 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: conv.peer!.id }),
                    })
                    await useApp.getState().loadConversations()
                  }}
                  className="gap-2 focus:bg-[#0A1224]"
                >
                  <ShieldBan className="h-4 w-4" /> {conv.blockedByMe ? tr('unblockUser') : tr('blockUser')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReportOpen(true)} className="gap-2 focus:bg-[#0A1224]">
                  <Flag className="h-4 w-4" /> {tr('reportUser')}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="gap-2 focus:bg-red-950/40 focus:text-red-300"
            >
              <LogOut className="h-4 w-4" /> {isGroup ? tr('leaveGroup') : tr('deleteChat')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3 md:px-4">
        {!messages && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#22D3EE]" />
          </div>
        )}
        {grouped.map((g, gi) => (
          <div key={gi}>
            {g.day && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-[#0C1428] px-3 py-1 text-[10px] font-medium text-[#8CA3C7]">{g.day}</span>
              </div>
            )}
            {g.items.map((m) => (
              <div key={m.id} className="py-0.5">
                <MessageBubble
                  message={m}
                  displayMode={displayMode}
                  onStartEdit={startEdit}
                  isGroup={isGroup}
                  groupMembers={isGroup ? conv.members : undefined}
                />
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomAnchor} />
      </div>

      {conv.blockedMe && (
        <p className="border-t border-[#1E2C4F] bg-[#0C1428] px-4 py-3 text-center text-sm text-[#8CA3C7]">
          {tr('blockedYou')}
        </p>
      )}
      {!conv.blockedMe && <Composer conversationId={conv.id} blocked={conv.blockedByMe} />}

      {/* telegraph dialog */}
      <Dialog open={showTelegraph} onOpenChange={setShowTelegraph}>
        <DialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('telegraphKey')}</DialogTitle>
          </DialogHeader>
          <TelegraphPad
            compact
            onSend={(text) => {
              setShowTelegraph(false)
              void useApp.getState().sendMessage(text, 'dual', 'sound')
            }}
          />
        </DialogContent>
      </Dialog>

      {/* leave/delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB]">
          <AlertDialogHeader>
            <AlertDialogTitle>{isGroup ? tr('leaveGroup') : tr('deleteChat')}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8CA3C7]">
              {isGroup ? tr('leaveGroupNote') : tr('deleteChatNote')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#1E2C4F] bg-transparent text-[#C9D6F2] hover:bg-[#0A1224]">
              {tr('clear')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeChat()} className="bg-red-500/90 text-white hover:bg-red-500">
              {isGroup ? tr('leaveGroup') : tr('deleteChat')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr('reportUser')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={tr('reportReason')}
              className="h-10 border-[#1E2C4F] bg-[#0A1224] placeholder:text-[#8CA3C7]"
            />
            <button
              onClick={() => void submitReport()}
              disabled={!reportReason.trim()}
              className="h-10 w-full rounded-xl bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
            >
              {tr('reportUser')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* group info dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-[#8CA3C7]">
              {conv.members.length} {tr('members')}
            </p>
            <div className="space-y-1.5">
              {conv.members.map((m: UserDTO & { role?: string }) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-[#1E2C4F] p-2.5">
                  <Avatar user={m} size="sm" online={useApp.getState().online[m.id]} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.displayName}
                    {m.id === meId && <span className="text-[#8CA3C7]"> · {tr('you')}</span>}
                  </span>
                  {m.role === 'owner' && (
                    <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#22D3EE]">
                      {tr('owner')}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {isOwner && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setNewName(conv.name ?? '')
                    setInfoOpen(false)
                    setRenameOpen(true)
                  }}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
                >
                  <Pencil className="h-4 w-4" /> {tr('renameGroup')}
                </button>
                <button
                  onClick={() => {
                    setInfoOpen(false)
                    setAddOpen(true)
                  }}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
                >
                  <UserPlus className="h-4 w-4" /> {tr('addMembers')}
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr('renameGroup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label={tr('groupName')}
              maxLength={60}
              className="h-10 border-[#1E2C4F] bg-[#0A1224]"
              onKeyDown={(e) => e.key === 'Enter' && void submitRename()}
            />
            <button
              onClick={() => void submitRename()}
              disabled={!newName.trim()}
              className="h-10 w-full rounded-xl bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
            >
              {tr('renameGroup')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* add members dialog */}
      {addOpen && (
        <AddMembersDialog
          conv={conv}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

/** Owner-only member picker for an existing group. */
function AddMembersDialog({ conv, onClose }: { conv: ConversationDTO; onClose: () => void }) {
  const tr = useApp((s) => s.tr)
  const addGroupMembers = useApp((s) => s.addGroupMembers)
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<UserDTO[]>([])
  const [picked, setPicked] = useState<UserDTO[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      fetch(`/api/users?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => alive && setUsers(data.users ?? []))
        .catch(() => undefined)
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const existing = new Set(conv.members.map((m) => m.id))
  const selectable = users.filter((u) => !existing.has(u.id))

  async function add() {
    if (picked.length === 0 || busy) return
    setBusy(true)
    try {
      const okAdd = await addGroupMembers(conv.id, picked.map((u) => u.id))
      if (okAdd) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr('addMembers')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('searchUsers')}
            className="h-10 border-[#1E2C4F] bg-[#0A1224] placeholder:text-[#8CA3C7]"
          />
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setPicked((p) => p.filter((x) => x.id !== u.id))}
                  className="flex items-center gap-1.5 rounded-full bg-[#22D3EE]/15 px-2.5 py-1 text-xs text-[#22D3EE]"
                >
                  {u.displayName} ×
                </button>
              ))}
            </div>
          )}
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {selectable.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#8CA3C7]">{tr('noUsers')}</p>
            ) : (
              selectable.map((u) => {
                const isPicked = picked.some((x) => x.id === u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => setPicked((p) => (isPicked ? p.filter((x) => x.id !== u.id) : [...p, u]))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
                      isPicked ? 'border-[#22D3EE] bg-[#22D3EE]/10' : 'border-transparent hover:border-[#1E2C4F] hover:bg-[#0A1224]'
                    )}
                  >
                    <Avatar user={u} size="sm" />
                    <span className="flex-1 font-medium">{u.displayName}</span>
                    {isPicked && <span className="text-[#22D3EE]">✓</span>}
                  </button>
                )
              })
            )}
          </div>
          <button
            onClick={() => void add()}
            disabled={picked.length === 0 || busy}
            className="h-10 w-full rounded-xl bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
          >
            {busy ? '...' : `${tr('addMembers')}${picked.length > 0 ? ` (${picked.length})` : ''}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
