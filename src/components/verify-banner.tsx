'use client'

// Morse Messenger — "verify your email" banner (shown until emailVerifiedAt).
// Soft verification: the app works without it; the banner keeps the ask visible.

import { useState } from 'react'
import { MailCheck, X } from 'lucide-react'
import { useApp } from '@/lib/store'

export function VerifyEmailBanner() {
  const tr = useApp((s) => s.tr)
  const me = useApp((s) => s.me)
  const addNotification = useApp((s) => s.addNotification)
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)

  if (!me || me.emailVerified || dismissed) return null

  async function resend() {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch('/api/auth/verify/resend', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('emailSent') })
      } else if (res.status === 503) {
        addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('emailNotConfigured') })
      } else if (res.status === 429) {
        addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('emailTooMany') })
      } else {
        addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('emailSendFailed') })
      }
    } catch {
      addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('emailSendFailed') })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-2 mt-2 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 md:mx-4 md:mt-3">
      <MailCheck className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#E7EEFB]">{tr('verifyBannerTitle')}</p>
        <p className="truncate text-[11px] text-[#8CA3C7]">
          {tr('verifyBannerBody').replace('{email}', me.email)}
        </p>
      </div>
      <button
        onClick={() => void resend()}
        disabled={sending}
        className="shrink-0 rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
      >
        {sending ? '…' : tr('resendEmail')}
      </button>
      <button onClick={() => setDismissed(true)} aria-label={tr('clear')} className="shrink-0 text-[#8CA3C7] hover:text-[#E7EEFB]">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
