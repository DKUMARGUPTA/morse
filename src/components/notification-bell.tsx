'use client'

// Morse Messenger — in-app notification centre (PRD 5.9 MVP)

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useApp } from '@/lib/store'
import { formatTime } from '@/lib/socket'

export function NotificationBell({ unread, label }: { unread: number; label: React.ReactNode }) {
  const notifications = useApp((s) => s.notifications)
  const markRead = useApp((s) => s.markNotificationsRead)
  const tr = useApp((s) => s.tr)
  const setTab = useApp((s) => s.setTab)
  const openConversation = useApp((s) => s.openConversation)

  return (
    <Popover onOpenChange={(open) => open && markRead()}>
      <PopoverTrigger asChild>
        <button aria-label={tr('notifTitle')} className="relative rounded-full p-1.5 hover:bg-[#101B33]">
          {label}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#22D3EE] px-1 text-[9px] font-bold text-[#06121F]">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 border-[#1E2C4F] bg-[#101B33] p-0 text-[#E7EEFB]">
        <div className="border-b border-[#1E2C4F] px-4 py-3 text-sm font-semibold">{tr('notifTitle')}</div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#8CA3C7]">{tr('notifEmpty')}</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (n.conversationId) {
                    setTab('chats')
                    void openConversation(n.conversationId)
                  }
                }}
                className={`block w-full border-b border-[#1E2C4F]/50 px-4 py-3 text-left hover:bg-[#0A1224] ${
                  !n.read ? 'bg-[#22D3EE]/5' : ''
                }`}
              >
                <p className="text-xs font-semibold text-[#22D3EE]">{tr(n.titleKey)}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-[#C9D6F2]">{n.body}</p>
                <p className="mt-1 text-[10px] text-[#8CA3C7]">{formatTime(new Date(n.createdAt).toISOString(), 'en')}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
