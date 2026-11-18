'use client'

// Morse Messenger — composer with Text / Morse / Dual send modes (PRD 5.5),
// live morse preview, telegraph key access and typing indicator.

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TelegraphPad } from '@/components/chats/telegraph-pad'
import { useApp } from '@/lib/store'
import { emitTyping } from '@/lib/socket'
import { textToMorse } from '@/lib/morse'
import { useSignalPlayer } from '@/hooks/use-signal-player'
import type { PlayMode, SendMode } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Send, Radio, Volume2, Sun, Vibrate, X, Pencil } from 'lucide-react'

const MODES: SendMode[] = ['text', 'morse', 'dual']

export function Composer({
  conversationId,
  blocked,
}: {
  conversationId: string
  blocked: boolean
}) {
  const tr = useApp((s) => s.tr)
  const me = useApp((s) => s.me)
  const draft = useApp((s) => s.composerDraft[conversationId] ?? '')
  const setDraft = useApp((s) => s.setDraft)
  const sendMessage = useApp((s) => s.sendMessage)
  const replyTo = useApp((s) => s.replyTo)
  const setReplyTo = useApp((s) => s.setReplyTo)
  const [mode, setMode] = useState<SendMode>('text')
  const [channel, setChannel] = useState<PlayMode>('sound')
  const [keyOpen, setKeyOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingRef = useRef<{ on: boolean; at: number }>({ on: false, at: 0 })
  const { play } = useSignalPlayer()

  const editMessage = useApp((s) => s.editMessage)
  // decrypted text for the reply banner (replyTo.text may be ciphertext)
  const replyE2eeText = useApp((s) => (s.replyTo ? s.e2eeTexts[s.replyTo.id] : undefined))

  // allow bubble menu to start an edit session
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; text: string }>).detail
      setEditing(detail)
      setDraft(conversationId, detail.text)
    }
    window.addEventListener('mm-edit-message', handler)
    return () => window.removeEventListener('mm-edit-message', handler)
  }, [conversationId, setDraft])

  const { morse, unsupported } = textToMorse(draft)
  const canSend = draft.trim().length > 0 && !blocked

  function notifyTyping(value: string) {
    if (!me) return
    const now = Date.now()
    if (value && (!typingRef.current.on || now - typingRef.current.at > 2000)) {
      typingRef.current = { on: true, at: now }
      emitTyping(conversationId, me.displayName, true)
    } else if (!value && typingRef.current.on) {
      typingRef.current = { on: false, at: now }
      emitTyping(conversationId, me.displayName, false)
    }
  }

  async function submit() {
    const text = draft.trim()
    if (!text || !canSend || sending) return
    setError(null)
    setSending(true)
    setDraft(conversationId, '')
    emitTyping(conversationId, me?.displayName ?? '', false)
    typingRef.current = { on: false, at: 0 }
    try {
      if (editing) {
        const okEdit = await editMessage(editing.id, text)
        if (!okEdit) {
          // put the text back — losing it would be worse than the error
          setDraft(conversationId, text)
          setError(tr('errEdit'))
        }
        setEditing(null)
        return
      }
      const okSend = await sendMessage(text, mode, mode === 'text' ? null : channel)
      if (!okSend) {
        // restore the draft so a failed send never destroys typed text
        setDraft(conversationId, text)
        setError(tr('errNetwork'))
      }
    } finally {
      setSending(false)
    }
  }

  const modeLabels: Record<SendMode, string> = {
    text: tr('modeText'),
    morse: tr('modeMorse'),
    dual: tr('modeDual'),
  }

  if (blocked) {
    return (
      <div className="border-t border-[#1E2C4F] bg-[#0C1428] px-4 py-4 text-center text-sm text-[#8CA3C7]">
        {tr('blockedByYou')}
      </div>
    )
  }

  return (
    <div className="border-t border-[#1E2C4F] bg-[#0C1428]">
      {replyTo && (
        <div className="flex items-center justify-between gap-2 border-b border-[#1E2C4F]/60 px-4 py-2">
          <div className="min-w-0 border-l-2 border-[#22D3EE] pl-2 text-xs">
            <p className="font-semibold text-[#22D3EE]">{tr('replyTo')}: {replyTo.senderName}</p>
            <p className="truncate text-[#8CA3C7]">{replyE2eeText ?? `🔒 ${tr('e2eeEncryptedMsg')}`}</p>
          </div>
          <button onClick={() => setReplyTo(null)} aria-label={tr('cancelReply')} className="p-2 text-[#8CA3C7] hover:text-[#C9D6F2]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {editing && (
        <div className="flex items-center justify-between gap-2 border-b border-[#1E2C4F]/60 bg-[#22D3EE]/5 px-4 py-2">
          <p className="flex items-center gap-1.5 text-xs text-[#22D3EE]">
            <Pencil className="h-3.5 w-3.5" /> {tr('editWindowNote')}
          </p>
          <button
            onClick={() => {
              setEditing(null)
              setDraft(conversationId, '')
            }}
            aria-label={tr('cancelEdit')}
            className="p-2 text-[#8CA3C7] hover:text-[#C9D6F2]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode !== 'text' && draft.trim() && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs tracking-[0.2em] text-[#22D3EE]">
            {morse || '—'}
          </p>
          {morse && (
            <button
              onClick={() => play(morse, channel)}
              className="rounded-md p-1 text-[#8CA3C7] hover:text-[#22D3EE]"
              aria-label={tr('playSignal')}
            >
              <Radio className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {mode !== 'text' && unsupported.length > 0 && (
        <p className="px-4 pt-1 text-[11px] text-amber-300">
          {tr('unsupportedChars')} {unsupported.slice(0, 8).join(' ')}
        </p>
      )}

      <div className="flex items-end gap-2 px-3 py-2.5">
        <button
          onClick={() => setKeyOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1E2C4F] text-[#8CA3C7] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
          aria-label={tr('telegraphKey')}
          title={tr('telegraphKey')}
        >
          <Radio className="h-5 w-5" />
        </button>

        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(conversationId, e.target.value)
            notifyTyping(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          rows={1}
          placeholder={tr('typeMessage')}
          aria-label={tr('typeMessage')}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-[#1E2C4F] bg-[#0A1224] px-3 py-2.5 text-base text-[#E7EEFB] placeholder:text-[#8CA3C7] focus:outline-none focus:ring-1 focus:ring-[#22D3EE] md:text-sm"
        />

        <button
          onClick={submit}
          disabled={!canSend || sending}
          aria-label={tr('send')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#22D3EE] text-[#06121F] transition hover:bg-[#67E8F9] disabled:opacity-40"
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
        <div className="flex gap-1 rounded-lg bg-[#0A1224] p-0.5" role="tablist" aria-label={tr('sendAs')}>
          {MODES.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                mode === m ? 'bg-[#22D3EE] text-[#06121F]' : 'text-[#8CA3C7] hover:text-[#C9D6F2]'
              )}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {mode !== 'text' && (
          <div className="flex items-center gap-0.5 rounded-lg bg-[#0A1224] p-0.5" aria-label={tr('channel')}>
            {(
              [
                ['sound', Volume2],
                ['light', Sun],
                ['vibration', Vibrate],
              ] as [PlayMode, typeof Volume2][]
            ).map(([ch, Icon]) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                aria-label={ch}
                title={ch}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  channel === ch ? 'bg-[#22D3EE]/20 text-[#22D3EE]' : 'text-[#8CA3C7] hover:text-[#C9D6F2]'
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-300">{error}</p>}

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('telegraphKey')}</DialogTitle>
          </DialogHeader>
          <TelegraphPad
            compact
            onSend={(text) => {
              setKeyOpen(false)
              setDraft(conversationId, text)
              if (inputRef.current) inputRef.current.focus()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
