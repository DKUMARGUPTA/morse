'use client'

// Morse Messenger — root application component (single-route app shell)

import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { useSocket } from '@/lib/socket'
import { primeAudio } from '@/lib/notification-sound'
import { AuthView } from '@/components/auth-view'
import { MainShell } from '@/components/main-shell'
import { LightOverlay } from '@/components/shared'
import { InviteDialog } from '@/components/chats/invite-dialog'
import { PwaInstallBanner, ServiceWorkerRegister } from '@/components/pwa/pwa-install'

export default function App() {
  const sessionLoaded = useApp((s) => s.sessionLoaded)
  const me = useApp((s) => s.me)
  const activeInvite = useApp((s) => s.activeInvite)
  const setActiveInvite = useApp((s) => s.setActiveInvite)

  useEffect(() => {
    // unlock Web Audio on the first user gesture — required on mobile for
    // notification chimes to be audible later
    primeAudio()
    void useApp.getState().loadSession()
  }, [])

  useSocket()

  if (!sessionLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0A1224]">
        <div className="flex items-center gap-2" aria-label="Loading">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#22D3EE]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#22D3EE] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#22D3EE] [animation-delay:300ms]" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#0A1224] text-[#E7EEFB]">
      <ServiceWorkerRegister />
      <LightOverlay />
      {!me ? <AuthView /> : <MainShell />}
      {me && <PwaInstallBanner />}
      {activeInvite && me && (
        <InviteDialog code={activeInvite} onClose={() => setActiveInvite(null)} />
      )}
    </div>
  )
}
