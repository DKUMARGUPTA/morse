'use client'

// Signal playback hook — wraps the SignalPlayer for React components

import { useCallback, useEffect, useRef, useState } from 'react'
import { SignalPlayer, SignalChannel } from '@/lib/signal-engine'
import { setFlash } from '@/lib/socket'
import { useApp } from '@/lib/store'

export function useSignalPlayer() {
  const settings = useApp((s) => s.settings)
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState(false)
  const playerRef = useRef<SignalPlayer | null>(null)
  const repeatRef = useRef(false)
  const morseRef = useRef('')

  const stop = useCallback(() => {
    repeatRef.current = false
    playerRef.current?.stop()
    playerRef.current = null
    setPlaying(false)
    setActive(false)
    setFlash(false)
  }, [])

  const play = useCallback(
    (morse: string, channel: SignalChannel = 'sound', repeat = false) => {
      if (!morse) return
      playerRef.current?.stop()
      const s = settings ?? { wpm: 12, frequency: 600, volume: 70, language: 'en', readReceipts: true, soundEnabled: true, vibrationEnabled: true }
      const p = new SignalPlayer(
        { wpm: s.wpm, frequency: s.frequency, volume: s.volume },
        channel,
        {
          onSignalActive: (a) => {
            setActive(a)
            if (channel === 'light' || channel === 'all') setFlash(a)
          },
          onDone: (completed) => {
            setPlaying(false)
            setActive(false)
            setFlash(false)
            if (completed && repeatRef.current) {
              // restart loop on next tick to avoid deep recursion
              setTimeout(() => {
                if (!repeatRef.current) return
                const cur = playerRef.current
                if (cur) {
                  cur.load(morseRef.current)
                  setPlaying(true)
                  cur.play()
                }
              }, 600)
            }
          },
        }
      )
      morseRef.current = morse
      repeatRef.current = repeat
      p.load(morse)
      playerRef.current = p
      setPlaying(true)
      p.play()
    },
    [settings]
  )

  useEffect(
    () => () => {
      playerRef.current?.stop()
      setFlash(false)
    },
    []
  )

  return { play, stop, playing, active }
}
