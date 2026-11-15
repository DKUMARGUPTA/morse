// Morse Messenger — Morse code engine (PRD 5.4)
// Pure TypeScript module, reusable across client and server.
// NOTE: Morse code is an encoding system, not encryption (PRD 5.4).

export const MORSE_TABLE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
  '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
  '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
  '$': '...-..-', '@': '.--.-.',
}

const REVERSE_TABLE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_TABLE).map(([k, v]) => [v, k])
)

export const MORSE_LETTER_SEPARATOR = ' '
export const MORSE_WORD_SEPARATOR = ' / '

export function isMorseSupportedChar(ch: string): boolean {
  return Object.prototype.hasOwnProperty.call(MORSE_TABLE, ch.toUpperCase())
}

/** Returns list of characters in `text` that cannot be encoded. */
export function findUnsupportedChars(text: string): string[] {
  const unsupported = new Set<string>()
  for (const ch of text) {
    if (ch === '\n' || ch === '\r') continue
    if (ch === ' ') continue
    if (!isMorseSupportedChar(ch)) unsupported.add(ch)
  }
  return Array.from(unsupported)
}

export interface MorseConvertResult {
  morse: string
  unsupported: string[]
  ok: boolean
}

export function textToMorse(text: string): MorseConvertResult {
  const unsupported = findUnsupportedChars(text)
  const words = text
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
  const morseWords = words.map((word) =>
    word
      .split('')
      .filter((ch) => isMorseSupportedChar(ch))
      .map((ch) => MORSE_TABLE[ch])
      .join(MORSE_LETTER_SEPARATOR)
  )
  const morse = morseWords.filter(Boolean).join(MORSE_WORD_SEPARATOR)
  return { morse, unsupported, ok: unsupported.length === 0 && morse.length > 0 }
}

export interface MorseDecodeResult {
  text: string
  unknownTokens: string[]
}

export function morseToText(morse: string): MorseDecodeResult {
  const unknownTokens: string[] = []
  const words = morse.trim().split(/\s*\/\s*/).filter(Boolean)
  const decodedWords = words.map((word) =>
    word
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        const ch = REVERSE_TABLE[token]
        if (!ch) {
          unknownTokens.push(token)
          return ''
        }
        return ch
      })
      .join('')
  )
  return { text: decodedWords.join(' ').trim(), unknownTokens }
}

/** Normalize any user-typed morse into standard `. - / ` spacing. */
export function normalizeMorse(input: string): string {
  return input
    .replace(/[^.\-/|\s_]/g, '')
    .replace(/[_|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim()
}

// ---------------------------------------------------------------------------
// Timing model (PARIS standard): unit = 1.2 / WPM seconds
// dot = 1u, dash = 3u, intra-character gap = 1u, letter gap = 3u, word gap = 7u
// ---------------------------------------------------------------------------

export interface MorseTimedElement {
  /** signal or gap */
  type: 'dot' | 'dash' | 'letterGap' | 'wordGap'
  startMs: number
  durationMs: number
  /** letter or word this element belongs to (for display highlight) */
  context?: string
}

export function unitMs(wpm: number): number {
  return 1200 / Math.max(1, wpm)
}

export function buildTimeline(morse: string, wpm: number): MorseTimedElement[] {
  const u = unitMs(wpm)
  const elements: MorseTimedElement[] = []
  let t = 0
  const words = morse.trim().split(/\s*\/\s*/).filter(Boolean)
  words.forEach((word, wi) => {
    const letters = word.trim().split(/\s+/).filter(Boolean)
    letters.forEach((letter, li) => {
      const symbols = letter.split('')
      symbols.forEach((s, si) => {
        const dur = s === '-' ? 3 * u : u
        elements.push({ type: s === '-' ? 'dash' : 'dot', startMs: t, durationMs: dur })
        t += dur
        if (si < symbols.length - 1) {
          elements.push({ type: 'letterGap', startMs: t, durationMs: u })
          t += u
        }
      })
      if (li < letters.length - 1) {
        elements.push({ type: 'letterGap', startMs: t, durationMs: 3 * u - u })
        t += 3 * u - u
      }
    })
    if (wi < words.length - 1) {
      elements.push({ type: 'wordGap', startMs: t, durationMs: 7 * u - 3 * u })
      t += 7 * u - 3 * u
    }
  })
  return elements
}

export function timelineDurationMs(elements: MorseTimedElement[]): number {
  const last = elements[elements.length - 1]
  return last ? last.startMs + last.durationMs : 0
}

/** Vibration pattern ([on, off, ...] in ms) for Vibration API. */
export function vibrationPattern(elements: MorseTimedElement[]): number[] {
  const pattern: number[] = []
  for (const el of elements) {
    if (el.type === 'dot' || el.type === 'dash') {
      pattern.push(Math.round(el.durationMs))
    } else {
      pattern.push(Math.round(el.durationMs))
    }
  }
  return pattern
}

/** Estimate playback duration for UI display. */
export function estimateDurationMs(morse: string, wpm: number): number {
  return timelineDurationMs(buildTimeline(morse, wpm))
}
