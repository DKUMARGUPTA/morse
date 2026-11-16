'use client'

// Morse Messenger — gentle prompt to turn on notifications.
// Shows while permission is 'default'. A dismissal is respected for 3 days,
// then the prompt quietly comes back once (it disappears as soon as
// permission is granted or denied).

import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { useApp } from '@/lib/store'
import { pushSupported, enablePush } from '@/lib/push-client'
import { notificationPermission } from '@/lib/system-notifications'

const DISMISS_KEY = 'mm-notif-prompt'
const RESHOW_MS = 3 * 24 * 60 * 60 * 1000

export function NotificationPrompt() {
  const tr = useApp((s) => s.tr)
  const me = useApp((s) => s.me)
  const addNotification = useApp((s) => s.addNotification)
  const [permission, setPermission] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    setDismissed(dismissedAt > 0 && Date.now() - dismissedAt < RESHOW_MS)
    setPermission(notificationPermission())
    const refresh = () => setPermission(notificationPermission())
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  if (!me || dismissed || working) return null
  if (permission !== 'default' || !pushSupported()) return null

  async function enable() {
    setWorking(true)
    try {
      const res = await enablePush()
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
      if (res.ok) {
        addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('notifsEnabled') })
      }
      setPermission(notificationPermission())
    } finally {
      setWorking(false)
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  return (
    <div className="mx-2 mt-2 flex items-center gap-3 rounded-xl border border-[#22D3EE]/30 bg-[#22D3EE]/5 px-3 py-2.5 md:mx-4 md:mt-3">
      <BellRing className="h-4 w-4 shrink-0 text-[#22D3EE]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#E7EEFB]">{tr('notifPromptTitle')}</p>
        <p className="truncate text-[11px] text-[#8CA3C7]">{tr('notifPromptBody')}</p>
      </div>
      <button
        onClick={() => void enable()}
        className="shrink-0 rounded-lg bg-[#22D3EE] px-3 py-1.5 text-xs font-bold text-[#0A1224] hover:bg-[#22D3EE]/90"
      >
        {tr('notifPromptEnable')}
      </button>
      <button onClick={dismiss} aria-label={tr('clear')} className="shrink-0 text-[#8CA3C7] hover:text-[#E7EEFB]">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
