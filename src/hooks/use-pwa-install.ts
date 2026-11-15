'use client'

// Morse Messenger — PWA install hook
// Captures `beforeinstallprompt` (module-level so it survives remounts),
// detects standalone mode, iOS Safari (no prompt event → manual steps),
// and a dismiss-with-TTL for the install banner.

import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'morse.pwa.dismissedAt'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // re-ask after 7 days

// module-level cache: beforeinstallprompt can fire before React mounts
let deferredPrompt: BeforeInstallPromptEvent | null = null
const capturedListeners = new Set<() => void>()

function notifyCaptured() {
  capturedListeners.forEach((fn) => fn())
}

export type InstallState = 'installed' | 'promptable' | 'ios' | 'manual' | 'unavailable'

export function usePwaInstall() {
  const [promptable, setPromptable] = useState(!!deferredPrompt)
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const syncCaptured = useCallback(() => setPromptable(!!deferredPrompt), [])

  useEffect(() => {
    // standalone / display-mode detection
    const standaloneMq = window.matchMedia('(display-mode: standalone)')
    const isIosDevice =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    const syncStandalone = () =>
      setStandalone(standaloneMq.matches || (window.navigator as { standalone?: boolean }).standalone === true)

    syncStandalone()
    setIos(isIosDevice)
    setDismissedAt(readDismissedAt())

    // capture install prompt (preventDefault → we own the UX)
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      notifyCaptured()
    }
    const onInstalled = () => {
      deferredPrompt = null
      setPromptable(false)
      setStandalone(true)
      window.localStorage.removeItem(DISMISS_KEY)
    }

    standaloneMq.addEventListener('change', syncStandalone)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    capturedListeners.add(syncCaptured)
    // in case the event already fired before mount
    notifyCaptured()

    return () => {
      standaloneMq.removeEventListener('change', syncStandalone)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      capturedListeners.delete(syncCaptured)
    }
  }, [syncCaptured])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable'
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      deferredPrompt = null
      setPromptable(false)
      if (outcome === 'accepted') setStandalone(true)
      return outcome
    } catch {
      return 'unavailable'
    }
  }, [])

  const dismiss = useCallback(() => {
    const now = Date.now()
    try {
      window.localStorage.setItem(DISMISS_KEY, String(now))
    } catch {
      /* storage unavailable */
    }
    setDismissedAt(now)
  }, [])

  const recentlyDismissed = dismissedAt !== null && Date.now() - dismissedAt < DISMISS_TTL_MS
  const installed = standalone

  const state: InstallState = installed
    ? 'installed'
    : promptable
      ? 'promptable'
      : ios
        ? 'ios'
        : 'manual'

  const showBanner = !installed && (promptable || ios) && !recentlyDismissed

  return { state, installed, promptable, ios, showBanner, promptInstall, dismiss }
}

function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    return raw ? Number(raw) || null : null
  } catch {
    return null
  }
}
