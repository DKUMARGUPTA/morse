// Morse Messenger — Signal Engine (PRD 5.6)
// Converts Morse sequences into sound (Web Audio API), screen-light flashes
// and vibration (Vibration API) with capability testing and graceful fallback.

import { buildTimeline, timelineDurationMs, vibrationPattern, MorseTimedElement } from './morse'

export type SignalChannel = 'sound' | 'light' | 'vibration' | 'all'

export interface SignalSettings {
  wpm: number
  frequency: number
  volume: number // 0-100
}

export interface SignalCallbacks {
  /** called when a dot/dash becomes active (light flash / UI highlight) */
  onSignalActive?: (active: boolean) => void
  /** called when playback finishes (or is stopped) */
  onDone?: (completed: boolean) => void
  /** progress 0..1 for UI */
  onProgress?: (fraction: number) => void
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function canAudio(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window
}

/**
 * SignalPlayer schedules a morse sequence on the selected channels.
 * Sound uses Web Audio API sample-accurate scheduling; light and vibration
 * use timers driven by the same timeline so all channels stay in sync.
 */
export class SignalPlayer {
  private ctx: AudioContext | null = null
  private rafId: number | null = null
  private stopTimer: number | null = null
  private playing = false
  private offsetMs = 0
  private startedAt = 0
  private elements: MorseTimedElement[] = []
  private settings: SignalSettings
  private channel: SignalChannel
  private cb: SignalCallbacks
  private pendingVibration: number[] = []
  private vibrationStarted = false

  constructor(settings: SignalSettings, channel: SignalChannel, cb: SignalCallbacks = {}) {
    this.settings = settings
    this.channel = channel
    this.cb = cb
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get duration(): number {
    return timelineDurationMs(this.elements)
  }

  load(morse: string) {
    this.elements = buildTimeline(morse, this.settings.wpm)
    this.offsetMs = 0
  }

  play(fromMs?: number) {
    if (this.playing) return
    if (this.elements.length === 0) return
    this.playing = true
    if (typeof fromMs === 'number') this.offsetMs = fromMs
    const useSound = (this.channel === 'sound' || this.channel === 'all') && canAudio()
    const useLight = this.channel === 'light' || this.channel === 'all' || this.channel === 'sound' ? this.channel !== 'vibration' : false
    const useVibration =
      (this.channel === 'vibration' || this.channel === 'all') && canVibrate()

    // Sound scheduling
    if (useSound) {
      try {
        this.ctx = this.ctx || new AudioContext()
        if (this.ctx.state === 'suspended') void this.ctx.resume()
        const ctx = this.ctx
        const t0 = ctx.currentTime + 0.06
        const vol = Math.min(100, Math.max(0, this.settings.volume)) / 100 * 0.5
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = this.settings.frequency
        gain.gain.setValueAtTime(0, t0)
        for (const el of this.elements) {
          if (el.type !== 'dot' && el.type !== 'dash') continue
          const s = t0 + (el.startMs + this.offsetMs) / 1000
          const e = s + el.durationMs / 1000
          if (e <= t0) continue
          const ramp = 0.006
          gain.gain.setValueAtTime(0, Math.max(t0, s))
          gain.gain.linearRampToValueAtTime(vol, s + ramp)
          gain.gain.setValueAtTime(vol, Math.max(t0, e - ramp))
          gain.gain.linearRampToValueAtTime(0, e)
        }
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t0)
        const totalS = (timelineDurationMs(this.elements) - this.offsetMs) / 1000
        osc.stop(t0 + Math.max(0.05, totalS) + 0.05)
        this.osc = osc
      } catch {
        // audio unavailable — continue with other channels
      }
    }

    // Light + vibration driven by timers
    if (useLight || this.channel === 'sound') {
      // light accompanies sound playback too (screen signal as feedback)
      this.scheduleLightFrom(this.offsetMs)
    }
    if (useVibration) {
      this.pendingVibration = vibrationPattern(
        this.elements.filter((el) => {
          if (el.type !== 'dot' && el.type !== 'dash') return false
          return el.startMs + el.durationMs > this.offsetMs
        })
      )
      this.pendingVibration.unshift(Math.max(0, Math.round(this.offsetMs)))
      try {
        navigator.vibrate(this.pendingVibration)
        this.vibrationStarted = true
      } catch {
        this.vibrationStarted = false
      }
    }

    this.startedAt = performance.now()
    const remaining = timelineDurationMs(this.elements) - this.offsetMs
    this.stopTimer = window.setTimeout(() => this.finish(true), Math.max(50, remaining + 120))
    this.tick()
  }

  private osc: OscillatorNode | null = null

  private scheduleLightFrom(offsetMs: number) {
    const step = () => {
      if (!this.playing) return
      const t = this.offsetMs + (performance.now() - this.startedAt)
      const active = this.elements.some(
        (el) =>
          (el.type === 'dot' || el.type === 'dash') &&
          t >= el.startMs &&
          t < el.startMs + el.durationMs
      )
      this.cb.onSignalActive?.(active)
    }
    this.lightRaf = window.setInterval(step, 32)
  }

  private lightRaf: number | null = null

  private tick() {
    if (!this.playing) return
    const t = this.offsetMs + (performance.now() - this.startedAt)
    const total = timelineDurationMs(this.elements)
    this.cb.onProgress?.(Math.min(1, Math.max(0, t / total)))
    if (this.channel !== 'vibration') {
      // highlight active element (used by Studio UI)
      const active = this.elements.find(
        (el) => (el.type === 'dot' || el.type === 'dash') && t >= el.startMs && t < el.startMs + el.durationMs
      )
      this.cb.onSignalActive?.(!!active)
    }
    this.rafId = requestAnimationFrame(() => this.tick())
  }

  pause() {
    if (!this.playing) return
    this.offsetMs = this.offsetMs + (performance.now() - this.startedAt)
    this.teardown(false)
  }

  stop() {
    this.offsetMs = 0
    this.teardown(false)
  }

  private teardown(completed: boolean) {
    this.playing = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    if (this.lightRaf !== null) {
      clearInterval(this.lightRaf)
      this.lightRaf = null
    }
    if (this.vibrationStarted) {
      try { navigator.vibrate(0) } catch { /* noop */ }
      this.vibrationStarted = false
    }
    try { this.osc?.stop() } catch { /* noop */ }
    this.osc = null
    try { this.ctx?.suspend() } catch { /* noop */ }
    this.cb.onSignalActive?.(false)
    this.cb.onDone?.(completed)
  }

  private finish(completed: boolean) {
    this.offsetMs = 0
    this.teardown(completed)
  }
}
