'use client'

// Morse Messenger — incoming invitation dialog (PRD 5.2: preview then accept/reject)

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/shared'
import { useApp } from '@/lib/store'

interface Preview {
  code: string
  status: string
  expiresAt: string
  creator: { id: string; displayName: string; avatarColor: string }
  expired: boolean
}

export function InviteDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const tr = useApp((s) => s.tr)
  const meId = useApp((s) => s.me?.id)
  const openConversation = useApp((s) => s.openConversation)
  const setTab = useApp((s) => s.setTab)
  const loadConversations = useApp((s) => s.loadConversations)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/invitations/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (alive) {
          setPreview(data.invitation ?? null)
          setLoading(false)
        }
      })
      .catch(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [code])

  async function act(action: 'accept' | 'decline') {
    if (!preview) return
    setBusy(true)
    try {
      const res = await fetch(`/api/invitations/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (res.ok && action === 'accept' && data.conversationId) {
        await loadConversations()
        setTab('chats')
        void openConversation(data.conversationId)
        onClose()
        return
      }
      if (res.ok && action === 'decline') onClose()
    } finally {
      setBusy(false)
    }
  }

  const usable = !!preview && !preview.expired && preview.status === 'pending'
  const selfInvite = !!preview && meId === preview.creator.id

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-[#22D3EE]" aria-hidden>
              -·-·-
            </span>
            {tr('inviteTitle')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#22D3EE] border-t-transparent" />
          </div>
        ) : !preview ? (
          <p className="py-6 text-center text-sm text-[#8CA3C7]">{tr('inviteExpired')}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-4">
              <Avatar user={preview.creator} size="lg" />
              <div>
                <p className="text-xs text-[#8CA3C7]">{tr('invitedBy')}</p>
                <p className="font-semibold">{preview.creator.displayName}</p>
                <p className="mt-0.5 font-mono text-[10px] text-[#3D527A]">#{preview.code}</p>
              </div>
            </div>

            {!usable && <p className="text-center text-sm text-amber-300">{tr('inviteExpired')}</p>}
            {selfInvite && (
              <p className="text-center text-sm text-amber-300">
                This is your own invitation link — share it with someone else.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy || !usable || selfInvite}
                onClick={() => act('decline')}
                className="h-11 flex-1 border-[#1E2C4F] bg-transparent text-[#C9D6F2] hover:bg-[#0A1224]"
              >
                {tr('decline')}
              </Button>
              <Button
                disabled={busy || !usable || selfInvite}
                onClick={() => act('accept')}
                className="h-11 flex-1 bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9]"
              >
                {tr('accept')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
