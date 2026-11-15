'use client'

// Morse Messenger — Morse Studio (PRD 5.4 translator, 5.6 signal engine, 5.7 telegraph key)

import { useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TelegraphPad } from '@/components/chats/telegraph-pad'
import { useApp } from '@/lib/store'
import { textToMorse, morseToText, normalizeMorse, findUnsupportedChars } from '@/lib/morse'
import { useSignalPlayer } from '@/hooks/use-signal-player'
import { canVibrate, SignalChannel } from '@/lib/signal-engine'
import { Copy, ArrowLeftRight, Pause, Play, Repeat, Square, Volume2, Sun, Vibrate, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type Direction = 't2m' | 'm2t'

export function MorseStudio() {
  const tr = useApp((s) => s.tr)
  return (
    <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{tr('studioTitle')}</h2>
        </div>
        <Tabs defaultValue="translator">
          <TabsList className="grid w-full grid-cols-2 bg-[#0C1428]">
            <TabsTrigger value="translator" className="data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              {tr('translator')}
            </TabsTrigger>
            <TabsTrigger value="key" className="data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              {tr('telegraphKey')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="translator" className="mt-4">
            <Translator />
          </TabsContent>
          <TabsContent value="key" className="mt-4">
            <TelegraphPad />
          </TabsContent>
        </Tabs>

        <p className="flex items-start gap-2 rounded-xl border border-[#1E2C4F] bg-[#0C1428] p-3 text-[11px] leading-relaxed text-[#8CA3C7]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22D3EE]" />
          {tr('aboutBody1')} {tr('aboutBody2')}
        </p>
      </div>
    </div>
  )
}

function Translator() {
  const tr = useApp((s) => s.tr)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const [direction, setDirection] = useState<Direction>('t2m')
  const [input, setInput] = useState('HELLO')
  const [channel, setChannel] = useState<SignalChannel>('sound')
  const [repeat, setRepeat] = useState(false)
  const { play, stop, playing } = useSignalPlayer()

  const result = useMemo(() => {
    if (direction === 't2m') {
      const { morse, unsupported } = textToMorse(input)
      return { primary: morse, secondary: '', unsupported }
    }
    const normalized = normalizeMorse(input)
    const { text, unknownTokens } = morseToText(normalized)
    return { primary: text, secondary: normalized, unsupported: unknownTokens }
  }, [direction, input])

  const morseForPlayback = direction === 't2m' ? result.primary : normalizeMorse(input)
  const unsupported = direction === 't2m' ? findUnsupportedChars(input) : []

  function swap() {
    setDirection((d) => {
      if (d === 't2m') {
        const normalized = normalizeMorse(input)
        setInput(morseToText(normalized).text)
        return 'm2t'
      }
      const { morse } = textToMorse(input)
      setInput(morse)
      return 't2m'
    })
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(result.primary)
    } catch {
      /* clipboard unavailable */
    }
  }

  const s = settings ?? { wpm: 12, frequency: 600, volume: 70 }

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="mb-1.5 block text-xs font-medium text-[#8CA3C7]">
          {direction === 't2m' ? tr('textToMorse') : tr('morseToText')}
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          aria-label={direction === 't2m' ? tr('textToMorse') : tr('morseToText')}
          className="w-full resize-none rounded-xl border border-[#1E2C4F] bg-[#0C1428] p-3 text-sm text-[#E7EEFB] placeholder:text-[#3D527A] focus:outline-none focus:ring-1 focus:ring-[#22D3EE]"
          placeholder={direction === 't2m' ? 'HELLO' : '.... . .-.. .-.. ---'}
        />
      </div>

      <div className="flex items-center justify-center">
        <button
          onClick={swap}
          className="flex h-9 items-center gap-2 rounded-full border border-[#1E2C4F] bg-[#0C1428] px-4 text-xs font-medium text-[#8CA3C7] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" /> {tr('swap')}
        </button>
      </div>

      <div className="rounded-xl border border-[#1E2C4F] bg-[#0C1428] p-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-[#8CA3C7]">
            {direction === 't2m' ? tr('morseOutput') : tr('decodedText')}
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={copyOutput}
              className="rounded-md p-1.5 text-[#8CA3C7] hover:text-[#22D3EE]"
              aria-label="Copy"
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p
          className={cn(
            'min-h-12 break-all text-lg font-semibold text-[#E7EEFB]',
            direction === 't2m' && 'font-mono tracking-[0.25em] text-[#22D3EE]'
          )}
        >
          {result.primary || '—'}
        </p>
        {unsupported.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-300">
            {tr('unsupportedChars')} {unsupported.slice(0, 10).join(' ')}
          </p>
        )}
      </div>

      {/* playback */}
      <div className="rounded-xl border border-[#1E2C4F] bg-[#0C1428] p-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => (playing ? stop() : play(morseForPlayback, channel, repeat))}
            disabled={!morseForPlayback}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#22D3EE] text-sm font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
          >
            {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? tr('stop') : tr('play')}
          </button>
          <button
            onClick={() => setRepeat((r) => !r)}
            aria-pressed={repeat}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border',
              repeat ? 'border-[#22D3EE] bg-[#22D3EE]/15 text-[#22D3EE]' : 'border-[#1E2C4F] text-[#8CA3C7]'
            )}
            title={tr('repeat')}
          >
            <Repeat className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-[#0A1224] p-1" role="tablist" aria-label={tr('channel')}>
          {(
            [
              ['sound', Volume2, tr('chSound')],
              ['light', Sun, tr('chLight')],
              ['vibration', Vibrate, tr('chVibration')],
              ['all', Repeat, tr('chAll')],
            ] as [SignalChannel, typeof Volume2, string][]
          ).map(([ch, Icon, label]) => (
            <button
              key={ch}
              role="tab"
              aria-selected={channel === ch}
              onClick={() => setChannel(ch)}
              className={cn(
                'flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors',
                channel === ch ? 'bg-[#22D3EE] text-[#06121F]' : 'text-[#8CA3C7] hover:text-[#C9D6F2]'
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {channel === 'vibration' && !canVibrate() && (
          <p className="mb-3 text-[11px] text-amber-300">{tr('noVibrationSupport')}</p>
        )}

        <div className="space-y-3">
          <SliderRow
            label={tr('wpm')}
            value={s.wpm}
            min={5}
            max={35}
            step={1}
            suffix=" WPM"
            onChange={(v) => void updateSettings({ wpm: v })}
          />
          <SliderRow
            label={tr('frequency')}
            value={s.frequency}
            min={300}
            max={1200}
            step={20}
            suffix=" Hz"
            onChange={(v) => void updateSettings({ frequency: v })}
          />
          <SliderRow
            label={tr('volume')}
            value={s.volume}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) => void updateSettings({ volume: v })}
          />
        </div>
        <p className="mt-2 text-[11px] text-[#8CA3C7]">{tr('speedNote')}</p>
      </div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-[#8CA3C7]">
        <span>{label}</span>
        <span className="font-mono text-[#C9D6F2]">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-[#22D3EE]"
      />
    </div>
  )
}
