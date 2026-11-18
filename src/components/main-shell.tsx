'use client'

// Morse Messenger — main shell: header, tabs, navigation

import { useMemo } from 'react'
import { MessageCircle, Radio, BookOpen, Settings as SettingsIcon, Bell, Wifi, WifiOff } from 'lucide-react'
import { useApp, Tab } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ChatList } from '@/components/chats/chat-list'
import { MorseStudio } from '@/components/morse/morse-studio'
import { LearnView } from '@/components/learn/learn-view'
import { SettingsView } from '@/components/settings/settings-view'
import { NotificationBell } from '@/components/notification-bell'
import { PwaInstallSidebarButton } from '@/components/pwa/pwa-install'
import { NotificationPrompt } from '@/components/pwa/notification-prompt'
import { VerifyEmailBanner } from '@/components/verify-banner'

const TABS: { id: Tab; icon: React.ReactNode; key: 'navChats' | 'navMorse' | 'navLearn' | 'navSettings' }[] = [
  { id: 'chats', icon: <MessageCircle className="h-5 w-5" />, key: 'navChats' },
  { id: 'morse', icon: <Radio className="h-5 w-5" />, key: 'navMorse' },
  { id: 'learn', icon: <BookOpen className="h-5 w-5" />, key: 'navLearn' },
  { id: 'settings', icon: <SettingsIcon className="h-5 w-5" />, key: 'navSettings' },
]

export function MainShell() {
  const tr = useApp((s) => s.tr)
  // subscribing to language ensures nav/header re-render when it changes
  // (tr itself is a stable fn that reads the store at call time)
  const lang = useApp((s) => s.settings?.language ?? 'en')
  const tab = useApp((s) => s.tab)
  const setTab = useApp((s) => s.setTab)
  const socketConnected = useApp((s) => s.socketConnected)
  const socketAvailable = useApp((s) => s.socketAvailable)
  const notifications = useApp((s) => s.notifications)

  const unreadNotifs = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])
  const title = tr(tab === 'chats' ? 'navChats' : tab === 'morse' ? 'navMorse' : tab === 'learn' ? 'navLearn' : 'navSettings')

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0A1224]" data-lang={lang} lang={lang === 'hi' ? 'hi' : 'en'}>
      {/* desktop side navigation */}
      <nav
        aria-label="Main navigation"
        className="hidden w-56 shrink-0 flex-col border-r border-[#1E2C4F] bg-[#0C1428] p-4 md:flex"
      >
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#22D3EE]/40 bg-[#101B33]">
            <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden>
              <circle cx="4" cy="13" r="2.4" fill="#22D3EE" />
              <rect x="9" y="11.4" width="9" height="3.2" rx="1.6" fill="#22D3EE" />
              <circle cx="22" cy="13" r="2.4" fill="#22D3EE" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Morse Messenger</p>
            <p className="flex items-center gap-1 text-[10px] text-[#8CA3C7]">
              {socketConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-emerald-400" /> {tr('connected')}
                </>
              ) : !socketAvailable ? (
                <>
                  <WifiOff className="h-3 w-3 text-[#8CA3C7]" /> {tr('realtimeOff')}
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-amber-400" /> {tr('connecting')}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-[#22D3EE]/15 text-[#22D3EE]'
                  : 'text-[#8CA3C7] hover:bg-[#101B33] hover:text-[#C9D6F2]'
              )}
            >
              {t.icon}
              {tr(t.key)}
            </button>
          ))}
          <PwaInstallSidebarButton />
        </div>
        <div className="mt-auto px-2 text-[10px] leading-relaxed text-[#8CA3C7]">
          Morse code is encoding, not encryption.
        </div>
      </nav>

      {/* content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile header */}
        <header className="flex items-center justify-between border-b border-[#1E2C4F] bg-[#0C1428] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden>
              <circle cx="4" cy="13" r="2.4" fill="#22D3EE" />
              <rect x="9" y="11.4" width="9" height="3.2" rx="1.6" fill="#22D3EE" />
              <circle cx="22" cy="13" r="2.4" fill="#22D3EE" />
            </svg>
            <h1 className="text-sm font-bold">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {!socketConnected && <WifiOff className="h-4 w-4 text-amber-400" aria-label={tr('connecting')} />}
            <NotificationBell
              unread={unreadNotifs}
              label={<Bell className="h-5 w-5 text-[#C9D6F2]" />}
            />
          </div>
        </header>

        {/* desktop header (chats tab renders its own header inside) */}
        {tab !== 'chats' && (
          <header className="hidden items-center justify-between border-b border-[#1E2C4F] px-6 py-4 md:flex">
            <h1 className="text-lg font-bold">{title}</h1>
            <NotificationBell unread={unreadNotifs} label={<Bell className="h-5 w-5 text-[#C9D6F2]" />} />
          </header>
        )}

        <VerifyEmailBanner />
        <NotificationPrompt />

        <main className="min-h-0 flex-1 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {tab === 'chats' && <ChatList />}
          {tab === 'morse' && <MorseStudio />}
          {tab === 'learn' && <LearnView />}
          {tab === 'settings' && <SettingsView />}
        </main>

        {/* mobile bottom navigation */}
        <nav
          aria-label="Main navigation"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#1E2C4F] bg-[#0C1428]/95 backdrop-blur md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                tab === t.id ? 'text-[#22D3EE]' : 'text-[#8CA3C7]'
              )}
            >
              {t.icon}
              {tr(t.key)}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
