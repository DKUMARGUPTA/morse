'use client'

// Morse Messenger — Learn module (PRD 5.8): reference, quiz, daily drill, progress
// Phase 3: word drill, 14-day activity strip, achievements.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionCard } from '@/components/shared'
import { useApp } from '@/lib/store'
import { MORSE_TABLE } from '@/lib/morse'
import { useSignalPlayer } from '@/hooks/use-signal-player'
import { cn } from '@/lib/utils'
import { Flame, CheckCircle2, XCircle, Play, Volume2, Award, Headphones } from 'lucide-react'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const NUMBERS = '0123456789'.split('')
const PUNCT = ['.', ',', '?', "'", '!', '/', '(', ')', '&', ':', ';', '=', '+', '-', '_', '"', '$', '@']
const ALL_CHARS = [...LETTERS, ...NUMBERS]

const DRILL_WORDS = [
  'HELLO', 'SOS', 'MORSE', 'RADIO', 'CODE', 'PARIS', 'SIGNAL', 'DOT', 'DASH',
  'ECHO', 'DELTA', 'OSCAR', 'INDIA', 'CHAT', 'FRIEND', 'LIGHT', 'SOUND', 'TAP',
]

function makeQuestion(pool: string[], allChars: string[]): { current: string; options: string[] } {
  const usePool = pool.length >= 4 ? pool : allChars
  const ch = usePool[Math.floor(Math.random() * usePool.length)]
  const distractors = new Set<string>()
  while (distractors.size < 3) {
    const cand = allChars[Math.floor(Math.random() * allChars.length)]
    if (cand !== ch) distractors.add(cand)
  }
  return { current: ch, options: [ch, ...Array.from(distractors)].sort(() => Math.random() - 0.5) }
}

function wordToMorse(word: string): string {
  return word
    .split('')
    .map((ch) => MORSE_TABLE[ch] ?? '')
    .filter(Boolean)
    .join(' / ')
}

export function LearnView() {
  const tr = useApp((s) => s.tr)
  const learn = useApp((s) => s.learn)
  const loadLearn = useApp((s) => s.loadLearn)

  useEffect(() => {
    void loadLearn()
  }, [loadLearn])

  return (
    <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{tr('learnTitle')}</h2>
          {learn && (
            <div className="flex items-center gap-3 text-xs text-[#8CA3C7]">
              <span className="flex items-center gap-1 rounded-full border border-[#1E2C4F] bg-[#0C1428] px-2.5 py-1">
                <Flame className="h-3.5 w-3.5 text-amber-400" /> {learn.streak} {tr('streak')}
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-[#1E2C4F] bg-[#0C1428] px-2.5 py-1 sm:flex">
                {learn.practicedToday} {tr('practicedToday')}
              </span>
            </div>
          )}
        </div>

        <Tabs defaultValue="reference">
          <TabsList className="grid w-full grid-cols-4 bg-[#0C1428]">
            <TabsTrigger value="reference" className="data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              {tr('reference')}
            </TabsTrigger>
            <TabsTrigger value="quiz" className="data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              {tr('quiz')}
            </TabsTrigger>
            <TabsTrigger value="drill" className="data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              {tr('drill')}
            </TabsTrigger>
            <TabsTrigger value="progress" className="data-[state=active]:bg-[#22D3EE] data-[state=active]:text-[#06121F]">
              {tr('progress')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="reference" className="mt-4">
            <Reference />
          </TabsContent>
          <TabsContent value="quiz" className="mt-4">
            <Quiz />
          </TabsContent>
          <TabsContent value="drill" className="mt-4">
            <Drill />
          </TabsContent>
          <TabsContent value="progress" className="mt-4">
            <Progress />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function Reference() {
  const tr = useApp((s) => s.tr)
  const { play } = useSignalPlayer()
  const [active, setActive] = useState<string | null>(null)

  const card = (ch: string) => (
    <button
      key={ch}
      onClick={() => {
        setActive(ch)
        play(MORSE_TABLE[ch], 'sound')
      }}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border p-2.5 transition-colors',
        active === ch
          ? 'border-[#22D3EE] bg-[#22D3EE]/10'
          : 'border-[#1E2C4F] bg-[#0C1428] hover:border-[#22D3EE]/50'
      )}
      aria-label={`${ch}: ${MORSE_TABLE[ch]}`}
    >
      <span className="text-base font-bold text-[#E7EEFB]">{ch}</span>
      <span className="font-mono text-xs tracking-[0.15em] text-[#22D3EE]">{MORSE_TABLE[ch]}</span>
    </button>
  )

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-xs text-[#8CA3C7]">
        <Volume2 className="h-3.5 w-3.5 text-[#22D3EE]" /> {tr('tapToListen')}
      </p>
      <SectionCard title={tr('letters')}>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">{LETTERS.map(card)}</div>
      </SectionCard>
      <SectionCard title={tr('numbers')}>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">{NUMBERS.map(card)}</div>
      </SectionCard>
      <SectionCard title={tr('punctuation')}>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">{PUNCT.map(card)}</div>
      </SectionCard>
    </div>
  )
}

function Quiz() {
  const tr = useApp((s) => s.tr)
  const { play } = useSignalPlayer()
  const loadLearn = useApp((s) => s.loadLearn)
  const [pool, setPool] = useState<string[]>([])
  const [question, setQuestion] = useState<{ current: string; options: string[] }>(() => makeQuestion([], ALL_CHARS))
  const [answer, setAnswer] = useState<string | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })

  const current = question.current
  const options = question.options

  function nextQuestion() {
    setQuestion(makeQuestion(pool, ALL_CHARS))
    setAnswer(null)
  }

  async function choose(opt: string) {
    if (answer || !current) return
    setAnswer(opt)
    const correct = opt === current
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }))
    if (correct) setPool((p) => [...new Set([...p, current])])
    try {
      await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: current, correct }),
      })
      void loadLearn()
    } catch {
      /* offline — progress syncs next time */
    }
  }

  if (!current) return null

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-[#8CA3C7]">{tr('quizPrompt')}</p>
          <button
            onClick={() => play(MORSE_TABLE[current], 'sound')}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22D3EE] text-[#06121F] shadow-[0_0_30px_rgba(34,211,238,0.3)] transition hover:bg-[#67E8F9]"
            aria-label={tr('quizPlayAgain')}
          >
            <Play className="h-6 w-6" />
          </button>
          <p className="font-mono text-sm tracking-[0.3em] text-[#22D3EE]">
            {answer ? MORSE_TABLE[current] : '· · · − − −'}
          </p>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((opt) => {
          const revealed = !!answer
          const isRight = opt === current
          return (
            <button
              key={opt}
              onClick={() => void choose(opt)}
              disabled={revealed}
              className={cn(
                'flex h-16 items-center justify-center rounded-xl border text-2xl font-bold transition-colors',
                !revealed && 'border-[#1E2C4F] bg-[#0C1428] text-[#E7EEFB] hover:border-[#22D3EE]/60',
                revealed && isRight && 'border-emerald-400 bg-emerald-400/10 text-emerald-300',
                revealed && !isRight && opt === answer && 'border-red-400 bg-red-400/10 text-red-300',
                revealed && !isRight && opt !== answer && 'border-[#1E2C4F] bg-[#0C1428] text-[#8CA3C7]'
              )}
            >
              <span className="flex items-center gap-1.5">
                {opt}
                {revealed && isRight && <CheckCircle2 className="h-5 w-5" />}
                {revealed && !isRight && opt === answer && <XCircle className="h-5 w-5" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-[#8CA3C7]">
          {answer ? (
            answer === current ? (
              <span className="font-semibold text-emerald-300">{tr('quizCorrect')}</span>
            ) : (
              <>
                {tr('quizWrong')} <span className="font-bold text-[#E7EEFB]">{current}</span>
              </>
            )
          ) : (
            `${score.right}/${score.total}`
          )}
        </p>
        <button
          onClick={nextQuestion}
          disabled={!answer}
          className="h-10 rounded-xl bg-[#22D3EE] px-5 text-sm font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
        >
          {tr('quizNext')}
        </button>
      </div>
    </div>
  )
}

function Drill() {
  const tr = useApp((s) => s.tr)
  const { play } = useSignalPlayer()
  const loadLearn = useApp((s) => s.loadLearn)
  const [word, setWord] = useState(() => DRILL_WORDS[Math.floor(Math.random() * DRILL_WORDS.length)])
  const [input, setInput] = useState('')
  const [result, setResult] = useState<null | boolean>(null)
  const [session, setSession] = useState({ right: 0, total: 0 })

  const check = useCallback(async () => {
    if (result !== null || !input.trim()) return
    const correct = input.trim().toUpperCase() === word
    setResult(correct)
    setSession((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }))
    try {
      await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'drill' }),
      })
      void loadLearn()
    } catch {
      /* offline — progress syncs next time */
    }
  }, [input, word, result, loadLearn])

  function next() {
    let nextWord = word
    while (nextWord === word && DRILL_WORDS.length > 1) {
      nextWord = DRILL_WORDS[Math.floor(Math.random() * DRILL_WORDS.length)]
    }
    setWord(nextWord)
    setInput('')
    setResult(null)
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="flex items-center gap-1.5 text-sm text-[#8CA3C7]">
            <Headphones className="h-4 w-4 text-[#22D3EE]" /> {tr('drillPrompt')}
          </p>
          <button
            onClick={() => play(wordToMorse(word), 'sound')}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22D3EE] text-[#06121F] shadow-[0_0_30px_rgba(34,211,238,0.3)] transition hover:bg-[#67E8F9]"
            aria-label={tr('play')}
          >
            <Play className="h-6 w-6" />
          </button>
          {result !== null && (
            <p className="font-mono text-xs tracking-[0.2em] text-[#22D3EE]">{wordToMorse(word)}</p>
          )}
        </div>
      </SectionCard>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void check()}
          disabled={result !== null}
          aria-label={tr('drillPrompt')}
          placeholder="..."
          className={cn(
            'h-12 flex-1 rounded-xl border bg-[#0C1428] px-4 text-center text-lg font-bold uppercase tracking-widest focus:outline-none',
            result === null && 'border-[#1E2C4F] text-[#E7EEFB]',
            result === true && 'border-emerald-400 text-emerald-300',
            result === false && 'border-red-400 text-red-300'
          )}
        />
        {result === null ? (
          <button
            onClick={() => void check()}
            disabled={!input.trim()}
            className="h-12 rounded-xl bg-[#22D3EE] px-6 text-sm font-semibold text-[#06121F] hover:bg-[#67E8F9] disabled:opacity-40"
          >
            {tr('drillCheck')}
          </button>
        ) : (
          <button
            onClick={next}
            className="h-12 rounded-xl bg-[#22D3EE] px-6 text-sm font-semibold text-[#06121F] hover:bg-[#67E8F9]"
          >
            {tr('drillNext')}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        {result === null ? (
          <p className="text-[#8CA3C7]">{session.right}/{session.total}</p>
        ) : result ? (
          <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> {tr('quizCorrect')}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[#8CA3C7]">
            <XCircle className="h-5 w-5 text-red-300" /> {tr('drillWas')}{' '}
            <span className="font-bold text-[#E7EEFB]">{word}</span>
          </p>
        )}
      </div>
    </div>
  )
}

function Progress() {
  const tr = useApp((s) => s.tr)
  const learn = useApp((s) => s.learn)

  if (!learn || learn.progress.length === 0) {
    return <p className="py-10 text-center text-sm text-[#8CA3C7]">{tr('noProgress')}</p>
  }

  const rows = [...learn.progress].sort((a, b) => {
    const ar = a.correct + a.wrong
    const br = b.correct + b.wrong
    return br - ar
  })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatBox value={String(learn.streak)} label={tr('streak')} />
        <StatBox value={String(learn.practicedToday)} label={tr('practicedToday')} />
        <StatBox value={String(learn.progress.reduce((acc, r) => acc + r.correct, 0))} label={tr('correctAnswers')} />
      </div>

      <ActivityStrip />
      <Achievements />

      {rows.map((r) => {
        const total = r.correct + r.wrong
        const pct = total ? Math.round((r.correct / total) * 100) : 0
        return (
          <div key={r.character} className="flex items-center gap-3 rounded-xl border border-[#1E2C4F] bg-[#0C1428] p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#101B33] text-lg font-bold text-[#E7EEFB]">
              {r.character}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex justify-between text-xs text-[#8CA3C7]">
                <span>{tr('mastery')}</span>
                <span className="font-mono">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#0A1224]">
                <div
                  className={cn('h-full rounded-full', pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-[#22D3EE]' : 'bg-amber-400')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-[11px] text-[#8CA3C7]">
              {r.correct}/{total}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 14-day activity heatmap strip (Phase 3) */
function ActivityStrip() {
  const tr = useApp((s) => s.tr)
  const learn = useApp((s) => s.learn)
  const cells = useMemo(() => {
    const byDate = new Map((learn?.history ?? []).map((h) => [h.date, h.count]))
    const out: { date: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ date: key, count: byDate.get(key) ?? 0 })
    }
    return out
  }, [learn?.history])

  return (
    <SectionCard title={tr('activity')}>
      <div className="flex items-end justify-between gap-1">
        {cells.map((c) => {
          const level = c.count === 0 ? 0 : c.count < 3 ? 1 : c.count < 8 ? 2 : 3
          return (
            <div key={c.date} className="flex flex-1 flex-col items-center gap-1" title={`${c.date}: ${c.count}`}>
              <div
                className={cn(
                  'h-8 w-full max-w-6 rounded-md',
                  level === 0 && 'bg-[#0A1224]',
                  level === 1 && 'bg-[#22D3EE]/30',
                  level === 2 && 'bg-[#22D3EE]/60',
                  level === 3 && 'bg-[#22D3EE]'
                )}
              />
              <span className="text-[8px] text-[#8CA3C7]">{c.date.slice(8)}</span>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

/** Achievements computed from learn state (Phase 3) */
function Achievements() {
  const tr = useApp((s) => s.tr)
  const learn = useApp((s) => s.learn)
  if (!learn) return null

  const totalCorrect = learn.progress.reduce((acc, r) => acc + r.correct, 0)
  const letters = learn.progress.filter((r) => LETTERS.includes(r.character))
  const allLettersSharp =
    letters.length === 26 && letters.every((r) => r.correct + r.wrong > 0 && r.correct / (r.correct + r.wrong) >= 0.8)

  const badges = [
    { key: 'achFirstQuiz', desc: 'achFirstQuizDesc', earned: totalCorrect >= 1 },
    { key: 'achTenQuiz', desc: 'achTenQuizDesc', earned: totalCorrect >= 10 },
    { key: 'achFiftyQuiz', desc: 'achFiftyQuizDesc', earned: totalCorrect >= 50 },
    { key: 'achStreak3', desc: 'achStreak3Desc', earned: learn.streak >= 3 },
    { key: 'achStreak7', desc: 'achStreak7Desc', earned: learn.streak >= 7 },
    { key: 'achAlphabet', desc: 'achAlphabetDesc', earned: allLettersSharp },
  ] as const

  return (
    <SectionCard title={tr('achievements')}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {badges.map((b) => (
          <div
            key={b.key}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors',
              b.earned ? 'border-[#22D3EE]/60 bg-[#22D3EE]/10' : 'border-[#1E2C4F] bg-[#0A1224] opacity-50'
            )}
          >
            <Award className={cn('h-5 w-5', b.earned ? 'text-[#22D3EE]' : 'text-[#8CA3C7]')} />
            <p className={cn('text-xs font-semibold', b.earned ? 'text-[#22D3EE]' : 'text-[#8CA3C7]')}>
              {tr(b.key)}
            </p>
            <p className="text-[10px] leading-snug text-[#8CA3C7]">{tr(b.desc)}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#1E2C4F] bg-[#0C1428] p-3 text-center">
      <p className="text-2xl font-bold text-[#22D3EE]">{value}</p>
      <p className="text-[10px] text-[#8CA3C7]">{label}</p>
    </div>
  )
}
