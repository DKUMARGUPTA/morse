'use client'

// Morse Messenger — message bubble with display modes, playback and actions
// Phase 2: group sender labels + system message tokens.
// Phase 5: E2EE (beta) — plaintext resolved client-side, morse computed locally.

import { useMemo } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MorseMono, systemText } from '@/components/shared'
import { useApp } from '@/lib/store'
import { useSignalPlayer } from '@/hooks/use-signal-player'
import { formatTime } from '@/lib/socket'
import { textToMorse } from '@/lib/morse'
import type { ChatDisplayMode, MessageDTO, UserDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Check, CheckCheck, MoreVertical, Pencil, Reply, Trash2, Copy, Volume2, Sun, Vibrate, Lock } from 'lucide-react'

const CHANNEL_ICONS = { sound: Volume2, light: Sun, vibration: Vibrate } as const

export function MessageBubble({
  message,
  displayMode,
  onStartEdit,
  isGroup = false,
  groupMembers,
}: {
  message: MessageDTO
  displayMode: ChatDisplayMode
  onStartEdit: (m: MessageDTO) => void
  isGroup?: boolean
  groupMembers?: UserDTO[]
}) {
  const tr = useApp((s) => s.tr)
  const meId = useApp((s) => s.me?.id)
  const setReplyTo = useApp((s) => s.setReplyTo)
  const deleteForMe = useApp((s) => s.deleteForMe)
  const e2eeText = useApp((s) => s.e2eeTexts[message.id])
  const e2eeFailed = useApp((s) => s.e2eeFailed[message.id] ?? false)
  const replyParentText = useApp((s) =>
    message.replyTo ? s.e2eeTexts[message.replyTo.id] : undefined
  )
  const { play, playing } = useSignalPlayer()
  const isMine = message.senderId === meId

  const editAllowed = useMemo(
    () => isMine && Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000 && message.kind !== 'system',
    [isMine, message]
  )

  // E2EE (beta): plaintext lives client-side; morse is derived locally for playback
  const plaintext = message.encrypted ? (e2eeText ?? null) : message.text
  const encLocked = !!message.encrypted && (e2eeFailed || plaintext === null)

  const effectiveMorse = useMemo(() => {
    if (message.morse) return message.morse
    if (message.encrypted && plaintext) return textToMorse(plaintext).morse || null
    return null
  }, [message.morse, message.encrypted, plaintext])

  if (message.kind === 'system') {
    return (
      <div className="my-3 flex justify-center">
        <p className="rounded-full border border-[#1E2C4F] bg-[#0C1428] px-3 py-1 text-center text-[11px] text-[#8CA3C7]">
          {message.encrypted ? (plaintext ?? tr('e2eeEncryptedMsg')) : systemText(message.text, (k) => tr(k))}
        </p>
      </div>
    )
  }

  const ChannelIcon = message.playMode ? CHANNEL_ICONS[message.playMode] ?? Volume2 : Volume2
  const showMorse = !!effectiveMorse && (displayMode === 'morse' || displayMode === 'dual')
  const showText = displayMode === 'text' || displayMode === 'dual' || !effectiveMorse
  const senderColor = message.senderColor

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintext ?? '')
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className={cn('group flex w-full gap-2 px-1', isMine ? 'justify-end' : 'justify-start')}>
      {!isMine && <div className="w-8 shrink-0" aria-hidden />}

      <div className={cn('relative max-w-[85%] sm:max-w-[70%]', isMine ? 'items-end' : 'items-start')}>
        {isGroup && !isMine && (
          <p className="mb-0.5 px-1 text-[10px] font-semibold" style={{ color: senderColor }}>
            {message.senderName}
          </p>
        )}
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
            isMine
              ? 'rounded-br-md bg-[#22D3EE] text-[#06121F]'
              : 'rounded-bl-md border border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB]'
          )}
        >
          {message.replyTo && (
            <div
              className={cn(
                'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs',
                isMine ? 'border-[#06121F]/60 bg-[#06121F]/10 text-[#06121F]/80' : 'border-[#22D3EE] bg-[#0A1224] text-[#8CA3C7]'
              )}
            >
              <span className="font-semibold">{message.replyTo.senderName}</span>
              <p className="line-clamp-2">
                {message.replyTo.text
                  ? replyParentText !== undefined
                    ? replyParentText
                    : message.replyTo.text.length > 40 && /^\S+\.\S+/.test(message.replyTo.text)
                      ? `🔒 ${tr('e2eeEncryptedMsg')}`
                      : message.replyTo.text
                  : ''}
              </p>
            </div>
          )}

          {encLocked ? (
            <p className="flex items-center gap-1.5 italic opacity-80">
              <Lock className="h-3.5 w-3.5" /> {tr('e2eeEncryptedMsg')}
            </p>
          ) : (
            <>
              {showText && <p className="whitespace-pre-wrap break-words">{plaintext}</p>}
              {showMorse && (
                <p className={cn('mt-1', isMine ? 'text-[#06121F]/85' : 'text-[#22D3EE]')}>
                  <MorseMono className="text-xs">{effectiveMorse}</MorseMono>
                </p>
              )}
            </>
          )}

          <div
            className={cn(
              'mt-1 flex items-center justify-end gap-1 text-[10px]',
              isMine ? 'text-[#06121F]/70' : 'text-[#8CA3C7]'
            )}
          >
            {message.encrypted && <Lock className="h-3 w-3" aria-label={tr('e2eeToggle')} />}
            {message.editedAt && <span className="italic">{tr('edited')}</span>}
            <span>{formatTime(message.createdAt, useApp.getState().settings?.language ?? 'en')}</span>
            {isMine && <StatusTicks message={message} />}
          </div>
        </div>

        {/* action row */}
        {!encLocked && (
          <div
            className={cn(
              'absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-[#1E2C4F] bg-[#0C1428]/95 p-0.5 shadow-lg transition-opacity',
              isMine ? 'right-full mr-1.5' : 'left-full ml-1.5',
              'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100',
              playing && '!opacity-100'
            )}
          >
            {effectiveMorse && (
              <button
                onClick={() => play(effectiveMorse!, message.playMode ?? 'sound')}
                className={cn('rounded-full p-1.5 hover:bg-[#101B33]', playing ? 'text-[#22D3EE]' : 'text-[#8CA3C7]')}
                aria-label={tr('playSignal')}
                title={`${tr('playSignal')} (${message.playMode ?? 'sound'})`}
              >
                <ChannelIcon className="h-4 w-4" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full p-1.5 text-[#8CA3C7] hover:bg-[#101B33]" aria-label="Message actions">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isMine ? 'end' : 'start'}
                className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB]"
              >
                <DropdownMenuItem onClick={() => setReplyTo(message)} className="gap-2 focus:bg-[#0A1224]">
                  <Reply className="h-4 w-4" /> {tr('reply')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copy} className="gap-2 focus:bg-[#0A1224]">
                  <Copy className="h-4 w-4" /> Copy
                </DropdownMenuItem>
                {editAllowed && (
                  <DropdownMenuItem onClick={() => onStartEdit(message)} className="gap-2 focus:bg-[#0A1224]">
                    <Pencil className="h-4 w-4" /> {tr('edit')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => void deleteForMe(message.id)}
                  className="gap-2 focus:bg-red-950/40 focus:text-red-300"
                >
                  <Trash2 className="h-4 w-4" /> {tr('deleteForMe')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusTicks({ message }: { message: MessageDTO }) {
  if (message.read) return <CheckCheck className="h-3.5 w-3.5 text-[#0E7490]" aria-label="Read" />
  if (message.delivered) return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Delivered" />
  return <Check className="h-3.5 w-3.5 opacity-70" aria-label="Sent" />
}
