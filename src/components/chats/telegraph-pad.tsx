'use client'

// Morse Messenger — Telegraph Key pad (PRD 5.7)
// Tap-and-hold keying with automatic letter/word gap detection, live decode,
// undo / reset, adjustable timing sensitivity and keyboard support.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { morseToText, textToMorse, unitMs } from '@/lib/morse'
import { useSignalPlayer } from '@/hooks/use-signal-player'
import { cn } from '@/lib/utils'
import { Undo2, RotateCcw, Volume2 } from 'lucide-react'

export function TelegraphPad({ onSend, compact }: { onSend?: (text: string) => void; compact?: boolean }) {
  const tr = useApp((s) => s.tr)
  const settings = useApp((s) => s.settings)
  const { play } = useSignalPlayer()
  const wpm = settings?.wpm ?? 12
  const [sensitivity, setSensitivity] = useState(1.6) // hold threshold factor
  const [elements, setElements] = useState<('.' | '-')[]>([])
  const [committed, setCommitted] = useState('') // decoded text so far
  const [pressed, setPressed] = useState(false)
  const [lastKey, setLastKey] = useState<'.' | '-' | null>(null)
  const downAt = useRef(0)
  const letterTimer = useRef<number | null>(null)
  const wordTimer = useRef<number | null>(null)
  const keyHeld = useRef(false)

  const u = unitMs(wpm)
  const dotThresholdMs = u * sensitivity

  const currentMorse = elements.join('')
  const decodeCurrent = currentMorse ? morseToText(currentMorse).text : ''

  const clearTimers = useCallback(() => {
    if (letterTimer.current) window.clearTimeout(letterTimer.current)
    if (wordTimer.current) window.clearTimeout(wordTimer.current)
    letterTimer.current = null
    wordTimer.current = null
  }, [])

  const commitLetter = useCallback(() => {
    setElements((els) => {
      if (els.length > 0) {
        const decoded = morseToText(els.join('')).text
        setCommitted((c) => c + decoded)
      }
      return []
    })
    // after a committed letter, a longer pause means a word gap
    if (wordTimer.current) window.clearTimeout(wordTimer.current)
    wordTimer.current = window.setTimeout(() => {
      setCommitted((c) => (c.length > 0 && !c.endsWith(' ') ? c + ' ' : c))
    }, u * 3 * 1.4)
  }, [u])

  const onDown = useCallback(() => {
    if (keyHeld.current) return
    keyHeld.current = true
    clearTimers()
    downAt.current = performance.now()
    setPressed(true)
    try { navigator.vibrate?.(20) } catch { /* noop */ }
  }, [clearTimers])

  const onUp = useCallback(() => {
    if (!keyHeld.current) return
    keyHeld.current = false
    setPressed(false)
    const dur = performance.now() - downAt.current
    const el: '.' | '-' = dur < dotThresholdMs ? '.' : '-'
    setLastKey(el)
    setElements((els) => [...els, el])
    // if no further press, commit this letter after the letter gap
    if (letterTimer.current) window.clearTimeout(letterTimer.current)
    letterTimer.current = window.setTimeout(commitLetter, u * 3 * 1.3)
  }, [dotThresholdMs, u, commitLetter])

  // keyboard alternative (accessibility, PRD 5.7)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        onDown()
      }
    }
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        onUp()
      }
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [onDown, onUp])

  useEffect(() => () => clearTimers(), [clearTimers])

  const undo = () => {
    clearTimers()
    setElements((els) => {
      if (els.length > 0) return els.slice(0, -1)
      setCommitted((c) => c.replace(/\s$/, '').slice(0, -1))
      return els
    })
  }

  const reset = () => {
    clearTimers()
    setElements([])
    setCommitted('')
  }

  const finalText = (committed + decodeCurrent).trim()
  const { morse: finalMorse } = textToMorse(finalText)

  return (
    <div className="space-y-4">
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); onDown() }}
        onPointerUp={(e) => { e.preventDefault(); onUp() }}
        onPointerLeave={() => onUp()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={tr('telegraphKey')}
        className={cn(
          'flex w-full select-none flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all duration-75',
          compact ? 'h-36' : 'h-44',
          pressed
            ? 'border-[#22D3EE] bg-[#22D3EE]/25 shadow-[0_0_40px_rgba(34,211,238,0.35)]'
            : 'border-[#1E2C4F] bg-[#0A1224] hover:border-[#22D3EE]/50'
        )}
      >
        <span className={cn('font-mono text-3xl', pressed ? 'text-[#22D3EE]' : 'text-[#8CA3C7]')}>
          {pressed ? '▼' : lastKey === '-' ? '—' : lastKey === '.' ? '•' : '▼'}
        </span>
        <span className="px-4 text-center text-xs text-[#8CA3C7]">{tr('tapHold')}</span>
        <span className="font-mono text-sm tracking-[0.3em] text-[#C9D6F2]">
          {elements.map((el, i) => (
            <span key={i} className={cn(el === '.' ? 'text-[#22D3EE]' : 'text-[#FBBF24]')}>
              {el === '.' ? '·' : '-'}
            </span>
          ))}
        </span>
      </button>

      <div className="rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-3">
        <p className="text-[10px] uppercase tracking-wide text-[#8CA3C7]">{tr('decoded')}</p>
        <p className="min-h-6 break-all text-lg font-semibold text-[#E7EEFB]">{finalText || '—'}</p>
        {finalText && (
          <p className="mt-1 break-all font-mono text-xs tracking-[0.2em] text-[#22D3EE]">{finalMorse}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={undo}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:bg-[#101B33]"
        >
          <Undo2 className="h-4 w-4" /> {tr('undo')}
        </button>
        <button
          onClick={reset}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:bg-[#101B33]"
        >
          <RotateCcw className="h-4 w-4" /> {tr('reset')}
        </button>
        {finalText && (
          <button
            onClick={() => play(finalMorse, 'sound')}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:bg-[#101B33]"
          >
            <Volume2 className="h-4 w-4" /> {tr('play')}
          </button>
        )}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-[#8CA3C7]">
          <span>{tr('sensitivity')}</span>
          <span className="font-mono">{sensitivity.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={2.6}
          step={0.1}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          aria-label={tr('sensitivity')}
          className="w-full accent-[#22D3EE]"
        />
      </div>

      {onSend && (
        <button
          disabled={!finalText}
          onClick={() => onSend(finalText)}
          className="h-11 w-full rounded-xl bg-[#22D3EE] font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
        >
          {tr('keySend')}: {finalText.slice(0, 24) || '—'}
        </button>
      )}
    </div>
  )
}
