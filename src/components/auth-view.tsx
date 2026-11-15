'use client'

// Morse Messenger — onboarding + authentication screen

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio, Circle, Minus, Waves, BookOpen } from 'lucide-react'
import { useApp } from '@/lib/store'
import type { DictKey } from '@/lib/i18n'

export function AuthView() {
  const tr = useApp((s) => s.tr)
  const setSession = useApp((s) => s.setSession)
  const [step, setStep] = useState(0) // 0..2 onboarding, 3 = auth
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slides: { icon: React.ReactNode; titleKey: DictKey; bodyKey: DictKey }[] = [
    { icon: <Waves className="h-8 w-8 text-[#22D3EE]" />, titleKey: 'onb1Title', bodyKey: 'onb1Body' },
    { icon: <Radio className="h-8 w-8 text-[#22D3EE]" />, titleKey: 'onb2Title', bodyKey: 'onb2Body' },
    { icon: <BookOpen className="h-8 w-8 text-[#22D3EE]" />, titleKey: 'onb3Title', bodyKey: 'onb3Body' },
  ]

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const endpoint = mode === 'signin' ? '/api/auth/login' : '/api/auth/register'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? tr('errGeneric'))
        return
      }
      await setSession(data)
    } catch {
      setError(tr('errNetwork'))
    } finally {
      setBusy(false)
    }
  }

  if (step < 3) {
    const slide = slides[step]
    return (
      <div className="flex min-h-dvh flex-col bg-[#0A1224] text-[#E7EEFB]">
        <header className="flex items-center gap-3 px-6 pt-10">
          <Sigil />
          <div>
            <h1 className="text-lg font-bold leading-tight">{tr('appName')}</h1>
            <p className="text-xs text-[#8CA3C7]">{tr('tagline')}</p>
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[#1E2C4F] bg-[#101B33]">
            {slide.icon}
          </div>
          <div className="max-w-sm space-y-3">
            <h2 className="text-2xl font-bold">{tr(slide.titleKey)}</h2>
            <p className="text-sm leading-relaxed text-[#8CA3C7]">{tr(slide.bodyKey)}</p>
          </div>
          <div className="flex items-center gap-2" role="tablist" aria-label="Onboarding progress">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={i === step ? 'h-2 w-6 rounded-full bg-[#22D3EE]' : 'h-2 w-2 rounded-full bg-[#1E2C4F]'}
              />
            ))}
          </div>
        </main>
        <footer className="space-y-3 px-8 pb-10">
          <Button
            onClick={() => setStep(step + 1)}
            className="h-12 w-full rounded-xl bg-[#22D3EE] text-[#06121F] font-semibold hover:bg-[#67E8F9]"
          >
            {step < 2 ? tr('next') : tr('getStarted')}
          </Button>
          <button onClick={() => setStep(3)} className="w-full text-center text-sm text-[#8CA3C7] hover:text-[#C9D6F2]">
            {tr('skip')}
          </button>
        </footer>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0A1224] text-[#E7EEFB]">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <Sigil />
          <div>
            <h1 className="text-xl font-bold">{tr('appName')}</h1>
            <p className="text-xs text-[#8CA3C7]">{tr('tagline')}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1E2C4F] bg-[#101B33] p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[#0A1224] p-1">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null) }}
                className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                  mode === m ? 'bg-[#22D3EE] text-[#06121F]' : 'text-[#8CA3C7] hover:text-[#C9D6F2]'
                }`}
              >
                {m === 'signin' ? tr('signIn') : tr('signUp')}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-[#C9D6F2]">{tr('displayName')}</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Aarav"
                  maxLength={40}
                  autoComplete="name"
                  className="h-11 border-[#1E2C4F] bg-[#0A1224] text-[#E7EEFB] placeholder:text-[#3D527A] focus-visible:ring-[#22D3EE]"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[#C9D6F2]">{tr('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="h-11 border-[#1E2C4F] bg-[#0A1224] text-[#E7EEFB] placeholder:text-[#3D527A] focus-visible:ring-[#22D3EE]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#C9D6F2]">{tr('password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="h-11 border-[#1E2C4F] bg-[#0A1224] text-[#E7EEFB] placeholder:text-[#3D527A] focus-visible:ring-[#22D3EE]"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-xl bg-[#22D3EE] text-[#06121F] font-semibold hover:bg-[#67E8F9] disabled:opacity-60"
            >
              {busy ? tr('authWorking') : mode === 'signin' ? tr('signIn') : tr('signUp')}
            </Button>
          </form>
        </div>

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-5 text-center text-sm text-[#8CA3C7] hover:text-[#C9D6F2]"
        >
          {mode === 'signin' ? tr('noAccount') : tr('haveAccount')}{' '}
          <span className="font-semibold text-[#22D3EE]">{mode === 'signin' ? tr('signUp') : tr('signIn')}</span>
        </button>

        <div className="mt-10 flex items-center justify-center gap-4 text-[#22D3EE]/70" aria-hidden>
          <Circle className="h-3 w-3 fill-current" />
          <Minus className="h-3 w-6" />
          <Circle className="h-3 w-3 fill-current" />
          <Circle className="h-3 w-3 fill-current" />
          <Minus className="h-3 w-6" />
        </div>
      </main>
    </div>
  )
}

function Sigil() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#22D3EE]/40 bg-[#101B33]">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
        <circle cx="4" cy="13" r="2.4" fill="#22D3EE" />
        <rect x="9" y="11.4" width="9" height="3.2" rx="1.6" fill="#22D3EE" />
        <circle cx="22" cy="13" r="2.4" fill="#22D3EE" />
      </svg>
    </div>
  )
}
