'use client'

// Morse Messenger — PWA install UI:
//  - ServiceWorkerRegister: registers /sw.js once per session
//  - PwaInstallBanner: floating dismissible install card (promptable / iOS)
//  - PwaInstallSidebarButton: desktop sidebar entry
//  - PwaInstallSection: Settings card (status-aware: installed / install / iOS steps / manual)

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { SectionCard } from '@/components/shared'
import { cn } from '@/lib/utils'
import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
    if (document.readyState === 'complete') register()
    else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])
  return null
}

/** Floating install card — appears 2.5s after login when installable, dismissable for 7 days */
export function PwaInstallBanner() {
  const tr = useApp((s) => s.tr)
  const addNotification = useApp((s) => s.addNotification)
  const { installed, showBanner, promptable, ios, promptInstall, dismiss } = usePwaInstall()
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!showBanner) return
    timerRef.current = setTimeout(() => setVisible(true), 2500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [showBanner])

  if (installed || !showBanner || !visible) return null

  async function handleInstall() {
    const outcome = await promptInstall()
    dismiss()
    if (outcome === 'accepted') {
      addNotification({ type: 'system', titleKey: 'appInstalledTitle', body: tr('appInstalledBody') })
    }
  }

  return (
    <div
      role="dialog"
      aria-label={tr('installApp')}
      className="fixed inset-x-4 bottom-20 z-50 md:inset-x-auto md:bottom-6 md:right-6 md:max-w-sm"
    >
      <div className="rounded-2xl border border-[#22D3EE]/30 bg-[#101B33]/95 p-4 shadow-xl shadow-black/40 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#22D3EE]/40 bg-[#0A1224]">
            <Smartphone className="h-5 w-5 text-[#22D3EE]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#E7EEFB]">{tr('installApp')}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#8CA3C7]">{tr('installTagline')}</p>
          </div>
          <button
            onClick={dismiss}
            aria-label={tr('later')}
            className="rounded-lg p-1 text-[#8CA3C7] transition-colors hover:text-[#8CA3C7]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          {promptable ? (
            <button
              onClick={() => void handleInstall()}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-[#22D3EE] text-sm font-semibold text-[#0A1224] transition-colors hover:bg-[#67E8F9]"
            >
              <Download className="h-4 w-4" /> {tr('installNow')}
            </button>
          ) : (
            // iOS Safari / no prompt event: show the manual steps inline instead of a dead button
            <p className="flex flex-1 items-center gap-2 text-[11px] leading-snug text-[#8CA3C7]">
              <Share className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" aria-hidden />
              {ios ? tr('installIosHint') : tr('installManualHint')}
            </p>
          )}
          <button
            onClick={dismiss}
            className={cn(
              'flex h-9 items-center justify-center rounded-xl border border-[#1E2C4F] px-4 text-sm text-[#8CA3C7] transition-colors hover:text-[#C9D6F2]',
              !promptable && 'w-full'
            )}
          >
            {tr('later')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Desktop sidebar entry — only while the browser can prompt */
export function PwaInstallSidebarButton() {
  const tr = useApp((s) => s.tr)
  const addNotification = useApp((s) => s.addNotification)
  const { installed, promptable, promptInstall, dismiss } = usePwaInstall()

  if (installed || !promptable) return null

  return (
    <button
      onClick={async () => {
        const outcome = await promptInstall()
        dismiss()
        if (outcome === 'accepted') {
          addNotification({ type: 'system', titleKey: 'appInstalledTitle', body: tr('appInstalledBody') })
        }
      }}
      className="mt-1 flex h-10 items-center gap-3 rounded-xl border border-dashed border-[#22D3EE]/40 px-3 text-sm font-medium text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
    >
      <Download className="h-4 w-4" /> {tr('installApp')}
    </button>
  )
}

/** Settings section — status aware */
export function PwaInstallSection() {
  const tr = useApp((s) => s.tr)
  const addNotification = useApp((s) => s.addNotification)
  const { state, promptInstall, dismiss } = usePwaInstall()

  async function handleInstall() {
    const outcome = await promptInstall()
    dismiss()
    if (outcome === 'accepted') {
      addNotification({ type: 'system', titleKey: 'appInstalledTitle', body: tr('appInstalledBody') })
    }
  }

  return (
    <SectionCard title={tr('installApp')}>
      <div className="space-y-3">
        {state === 'installed' && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3">
            <Download className="h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-sm text-emerald-300">{tr('installedBadge')}</p>
          </div>
        )}

        {state === 'promptable' && (
          <>
            <p className="text-[11px] leading-relaxed text-[#8CA3C7]">{tr('installTagline')}</p>
            <button
              onClick={() => void handleInstall()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#22D3EE] text-sm font-semibold text-[#0A1224] transition-colors hover:bg-[#67E8F9]"
            >
              <Download className="h-4 w-4" /> {tr('installNow')}
            </button>
          </>
        )}

        {state === 'ios' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-3">
            <Share className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" />
            <p className="text-[11px] leading-relaxed text-[#8CA3C7]">{tr('installIosHint')}</p>
          </div>
        )}

        {state === 'manual' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-3">
            <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" />
            <p className="text-[11px] leading-relaxed text-[#8CA3C7]">{tr('installManualHint')}</p>
          </div>
        )}

        <p className="text-[10px] text-[#8CA3C7]">PWA · display: standalone · offline-ready</p>
      </div>
    </SectionCard>
  )
}
