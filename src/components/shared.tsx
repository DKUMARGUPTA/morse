'use client'

// Morse Messenger — shared UI atoms

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { subscribeFlash } from '@/lib/socket'
import type { UserDTO } from '@/lib/types'

export function Avatar({
  user,
  size = 'md',
  online,
  className,
}: {
  user: Pick<UserDTO, 'displayName' | 'avatarColor'>
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
  className?: string
}) {
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-12 w-12 text-sm',
    xl: 'h-20 w-20 text-2xl',
  }
  const initials = user.displayName
    .split(/\s+/)
    .map((p) => Array.from(p)[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        aria-hidden
        className={cn('flex items-center justify-center rounded-full font-semibold text-[#06121F] select-none', sizes[size])}
        style={{ backgroundColor: user.avatarColor }}
      >
        {initials || '?'}
      </div>
      {online && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0A1224] bg-emerald-400"
          title="Online"
        />
      )}
    </div>
  )
}

export function MorseMono({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('font-mono tracking-[0.18em] break-all', className)} aria-label="Morse code">
      {children}
    </span>
  )
}

/** Stacked-initials avatar for group conversations. */
export function GroupAvatar({
  name,
  colors,
  size = 'md',
  className,
}: {
  name: string
  colors: string[]
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const sizes = {
    sm: 'h-8 w-8 text-[9px]',
    md: 'h-10 w-10 text-[11px]',
    lg: 'h-12 w-12 text-xs',
    xl: 'h-20 w-20 text-xl',
  }
  const palette = ['#22D3EE', '#34D399', '#F472B6', '#FBBF24', '#A78BFA', '#60A5FA']
  // Array.from iterates by code point — emoji/surrogate names keep their glyphs
  const initials = Array.from(name.trim().split(/\s+/))
    .map((p) => Array.from(p)[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const bg = palette[name.length % palette.length]
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-2xl border-2 border-[#0A1224] font-bold text-[#06121F] select-none',
          sizes[size]
        )}
        style={{ backgroundColor: bg }}
      >
        {initials || '#'}
      </div>
      {colors.length > 0 && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0A1224]"
          style={{ backgroundColor: colors[0] }}
        />
      )}
    </div>
  )
}

/** Human text for system messages (server stores stable tokens). */
export function systemText(raw: string, trSys: (key: 'sysChatStarted' | 'sysAdded' | 'sysLeft' | 'sysEncryptionOn') => string): string {
  if (raw === 'CHAT_STARTED_VIA_INVITATION') return trSys('sysChatStarted')
  if (raw === 'ENCRYPTION_ON') return trSys('sysEncryptionOn')
  if (raw.startsWith('MEMBER_LEFT:')) return `${raw.slice('MEMBER_LEFT:'.length)} ${trSys('sysLeft')}`
  if (raw.startsWith('MEMBER_ADDED:')) return `${raw.slice('MEMBER_ADDED:'.length)} ${trSys('sysAdded')}`
  return raw
}

/** Fullscreen screen-light overlay used by the signal engine's light channel. */
export function LightOverlay() {
  const [on, setOn] = useState(false)
  useEffect(() => subscribeFlash(setOn), [])
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-0 z-[100] transition-opacity duration-75',
        on ? 'bg-cyan-200 opacity-95' : 'opacity-0'
      )}
      style={{ background: on ? '#CFFAFE' : 'transparent' }}
    />
  )
}

export function SectionCard({ title, children, action }: { title?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1E2C4F] bg-[#101B33] p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h3 className="text-sm font-semibold text-[#C9D6F2]">{title}</h3> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Dot() {
  return <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-[#22D3EE] align-middle" />
}
