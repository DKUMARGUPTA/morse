// Morse Messenger — notification sound engine (zero dependencies).
//
// Browsers (especially iOS Safari / Android Chrome) only allow audio after a
// user gesture. We therefore keep ONE shared AudioContext that is created and
// resumed on the first pointer/key interaction, so later programmatic chimes
// — fired when a message arrives while the user is just reading — can sound.

let ctx: AudioContext | null = null
let primed = false
let lastChimeAt = 0

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

/** Attach once: create the AudioContext and resume it on the first gesture.
 *  Safe to call repeatedly; cheap no-op afterwards. */
export function primeAudio(): void {
  if (primed || typeof window === 'undefined') return
  primed = true

  const unlock = () => {
    const c = getCtx()
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined)
  }
  // capture + passive: never block scrolling or other handlers
  const opts: AddEventListenerOptions = { capture: true, passive: true }
  for (const ev of ['pointerdown', 'touchstart', 'keydown'] as const) {
    window.addEventListener(ev, unlock, opts)
  }
  unlock()
}

/** Short pleasant two-tone chime ("ding-DONG") for incoming messages.
 *  @param volume 0–100, from user settings (default 70)
 *  @param force  bypass the dedupe window (used by the settings test button) */
export function playChime(volume = 70, force = false): void {
  const c = getCtx()
  if (!c) return
  const now = Date.now()
  if (!force && now - lastChimeAt < 900) return // batch storms → one chime
  lastChimeAt = now

  try {
    if (c.state === 'suspended') {
      // Needs a prior gesture; if none happened yet the resume stays pending
      // and we simply stay silent instead of throwing.
      void c.resume().catch(() => undefined)
    }
    if (c.state !== 'running') return

    const t0 = c.currentTime + 0.02
    const peak = Math.max(0.06, Math.min(1, volume / 100)) * 0.45

    const note = (freq: number, start: number, dur: number) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain)
      gain.connect(c.destination)
      osc.start(start)
      osc.stop(start + dur + 0.05)
    }

    note(880, t0, 0.18) // A5 — "ding"
    note(1174.66, t0 + 0.12, 0.3) // D6 — "DONG"
  } catch {
    /* audio unavailable — never break the app over a sound */
  }
}

/** Fire-and-forget haptic tick (Android; iOS ignores it inside web pages). */
export function vibrate(ms = 60): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* noop */
  }
}
