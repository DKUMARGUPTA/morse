'use client'

// Morse Messenger — new conversation dialog: invite link + QR (PRD 5.2) and user picker

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/shared'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { InvitationDTO, UserDTO } from '@/lib/types'
import { Link2, Copy, QrCode, Users, Ban, UserPlus } from 'lucide-react'

export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const tr = useApp((s) => s.tr)
  const me = useApp((s) => s.me)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('newChat')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="invite">
          <TabsList className="grid w-full grid-cols-3 bg-[#0A1224]">
            <TabsTrigger value="invite" className="gap-1.5 data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              <Link2 className="h-4 w-4" /> {tr('inviteTab')}
            </TabsTrigger>
            <TabsTrigger value="people" className="gap-1.5 data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              <Users className="h-4 w-4" /> {tr('usersTab')}
            </TabsTrigger>
            <TabsTrigger value="group" className="gap-1.5 data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              <UserPlus className="h-4 w-4" /> {tr('groupTab')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="invite" className="mt-4">
            <InvitePanel myName={me?.displayName ?? ''} />
          </TabsContent>
          <TabsContent value="people" className="mt-4">
            <PeoplePanel onPicked={() => onClose()} />
          </TabsContent>
          <TabsContent value="group" className="mt-4">
            <GroupPanel onCreated={() => onClose()} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function InvitePanel({ myName }: { myName: string }) {
  const tr = useApp((s) => s.tr)
  const addNotification = useApp((s) => s.addNotification)
  const [invites, setInvites] = useState<InvitationDTO[]>([])
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [latestCode, setLatestCode] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    const res = await fetch('/api/invitations')
    if (res.ok) {
      const data = await res.json()
      setInvites(data.invitations)
      if (data.invitations[0]) setLatestCode(data.invitations[0].code)
    }
  }, [])

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  useEffect(() => {
    if (!latestCode) return
    const url = `${window.location.origin}/?invite=${latestCode}`
    QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: '#0A1224', light: '#E7EEFB' },
    })
      .then(setQr)
      .catch(() => setQr(null))
  }, [latestCode])

  async function createInvite() {
    setBusy(true)
    try {
      const res = await fetch('/api/invitations', { method: 'POST' })
      if (res.ok) {
        await loadInvites()
      } else {
        const data = await res.json().catch(() => ({}))
        addNotification({ type: 'system', titleKey: 'errGeneric', body: data.message ?? 'Could not create invite' })
      }
    } finally {
      setBusy(false)
    }
  }

  async function revoke(code: string) {
    await fetch(`/api/invitations/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke' }),
    })
    await loadInvites()
  }

  async function copyLink(code: string) {
    const url = `${window.location.origin}/?invite=${code}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* clipboard unavailable */
    }
  }

  const url = latestCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/?invite=${latestCode}` : ''

  return (
    <div className="space-y-4">
      <Button
        onClick={createInvite}
        disabled={busy}
        className="h-11 w-full bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9]"
      >
        {busy ? '...' : tr('createInvite')}
      </Button>

      {latestCode && (
        <div className="space-y-3 rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-4">
          <div className="flex justify-center" aria-hidden>
            {qr ? (
              <img src={qr} alt={`QR code for invitation ${latestCode}`} className="rounded-lg" width={180} height={180} />
            ) : (
              <QrCode className="h-16 w-16 text-[#8CA3C7]" />
            )}
          </div>
          <p className="break-all text-center font-mono text-xs text-[#C9D6F2]">{url}</p>
          <Button
            variant="outline"
            onClick={() => copyLink(latestCode)}
            className="h-10 w-full border-[#1E2C4F] bg-transparent hover:bg-[#101B33]"
          >
            <Copy className="mr-2 h-4 w-4" /> {tr('copyLink')}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-[#8CA3C7]">{tr('inviteNote')}</p>
        </div>
      )}

      {invites.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8CA3C7]">
            {tr('invitePending')} ({myName ? '' : ''}{invites.length})
          </p>
          <div className="space-y-1.5">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-[#1E2C4F] px-3 py-2">
                <span className="font-mono text-xs text-[#C9D6F2]">#{inv.code}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyLink(inv.code)}
                    className="rounded-md p-1.5 text-[#8CA3C7] hover:bg-[#101B33] hover:text-[#22D3EE]"
                    aria-label={tr('copyLink')}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => revoke(inv.code)}
                    className="rounded-md p-1.5 text-[#8CA3C7] hover:bg-red-950/40 hover:text-red-300"
                    aria-label={tr('revoke')}
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PeoplePanel({ onPicked }: { onPicked: () => void }) {
  const tr = useApp((s) => s.tr)
  const startConversationWith = useApp((s) => s.startConversationWith)
  const openConversation = useApp((s) => s.openConversation)
  const setTab = useApp((s) => s.setTab)
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<UserDTO[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

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

  async function pick(userId: string) {
    setBusyId(userId)
    try {
      const convId = await startConversationWith(userId)
      if (convId) {
        setTab('chats')
        void openConversation(convId)
        onPicked()
      }
    } finally {
      setBusyId(null)
    }
  }
  return (
    <div className="space-y-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr('searchUsers')}
        className="h-10 border-[#1E2C4F] bg-[#0A1224] placeholder:text-[#8CA3C7]"
      />
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {users.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8CA3C7]">{tr('noUsers')}</p>
        ) : (
          users.map((u) => (
            <button
              key={u.id}
              onClick={() => pick(u.id)}
              disabled={busyId === u.id}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left hover:border-[#1E2C4F] hover:bg-[#0A1224]',
                busyId === u.id && 'opacity-60'
              )}
            >
              <Avatar user={u} />
              <span className="font-medium">{u.displayName}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function GroupPanel({ onCreated }: { onCreated: () => void }) {
  const tr = useApp((s) => s.tr)
  const createGroup = useApp((s) => s.createGroup)
  const openConversation = useApp((s) => s.openConversation)
  const setTab = useApp((s) => s.setTab)
  const [name, setName] = useState('')
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

  function toggle(u: UserDTO) {
    setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]))
  }

  async function create() {
    if (!name.trim() || picked.length === 0 || busy) return
    setBusy(true)
    try {
      const convId = await createGroup(name.trim(), picked.map((u) => u.id))
      if (convId) {
        setTab('chats')
        void openConversation(convId)
        onCreated()
      }
    } finally {
      setBusy(false)
    }
  }

  const canCreate = name.trim().length > 0 && picked.length > 0 && !busy

  return (
    <div className="space-y-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={tr('groupNamePlaceholder')}
        aria-label={tr('groupName')}
        maxLength={60}
        className="h-10 border-[#1E2C4F] bg-[#0A1224] placeholder:text-[#8CA3C7]"
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr('searchUsers')}
        aria-label={tr('pickMembers')}
        className="h-10 border-[#1E2C4F] bg-[#0A1224] placeholder:text-[#8CA3C7]"
      />
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((u) => (
            <button
              key={u.id}
              onClick={() => toggle(u)}
              className="flex items-center gap-1.5 rounded-full bg-[#22D3EE]/15 px-2.5 py-1 text-xs text-[#22D3EE]"
            >
              {u.displayName} ×
            </button>
          ))}
        </div>
      )}
      <div className="max-h-60 space-y-1 overflow-y-auto">
        {users.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8CA3C7]">{tr('noUsers')}</p>
        ) : (
          users.map((u) => {
            const isPicked = picked.some((x) => x.id === u.id)
            return (
              <button
                key={u.id}
                onClick={() => toggle(u)}
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
      <Button
        onClick={create}
        disabled={!canCreate}
        className="h-11 w-full bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
      >
        {busy ? '...' : `${tr('createGroup')}${picked.length > 0 ? ` · ${picked.length + 1} ${tr('members')}` : ''}`}
      </Button>
    </div>
  )
}
