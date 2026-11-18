'use client'

// Morse Messenger — Settings (PRD 5.1, 5.9, 5.10): profile, language, notifications,
// signal defaults, privacy, security, blocked users, account export/delete, about.

import { useEffect, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Avatar, SectionCard } from '@/components/shared'
import { useApp } from '@/lib/store'
import { useSignalPlayer } from '@/hooks/use-signal-player'
import { canVibrate } from '@/lib/signal-engine'
import { playChime } from '@/lib/notification-sound'
import { enablePush, disablePush, getPushState, pushSupported, type PushState } from '@/lib/push-client'
import { showSystemNotification } from '@/lib/system-notifications'
import { keyFingerprint, publishPublicKey, resetLocalKeypair } from '@/lib/e2ee'
import { cn } from '@/lib/utils'
import { PwaInstallSection } from '@/components/pwa/pwa-install'
import { Check, Download, Globe, LogOut, ShieldCheck, Trash2, Lock, KeyRound } from 'lucide-react'

export function SettingsView() {
  const tr = useApp((s) => s.tr)
  const me = useApp((s) => s.me)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const updateDisplayName = useApp((s) => s.updateDisplayName)
  const clearSession = useApp((s) => s.clearSession)
  const { play } = useSignalPlayer()

  const [name, setName] = useState(me?.displayName ?? '')
  const [nameSaved, setNameSaved] = useState(false)
  const [blocked, setBlocked] = useState<{ id: string; displayName: string; avatarColor: string }[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    fetch('/api/block')
      .then((r) => r.json())
      .then((data) => setBlocked(data.blocked ?? []))
      .catch(() => undefined)
  }, [])

  async function saveName() {
    if (!name.trim() || name === me?.displayName) return
    const okName = await updateDisplayName(name.trim())
    if (okName) {
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    }
  }

  async function unblock(userId: string) {
    await fetch('/api/block', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setBlocked((b) => b.filter((x) => x.id !== userId))
  }

  async function signOut() {
    // stop this device receiving pushes for this account BEFORE the session dies
    // (404/410 after logout would leave a live subscription row on the server)
    await disablePush().catch(() => undefined)
    await fetch('/api/auth/logout', { method: 'POST' })
    clearSession()
  }

  async function signOutAll() {
    await disablePush().catch(() => undefined)
    await fetch('/api/auth/me', { method: 'POST' })
    clearSession()
  }

  async function deleteAccount() {
    const res = await fetch('/api/account/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: deleteConfirm }),
    })
    if (res.ok) {
      await disablePush().catch(() => undefined)
      clearSession()
    }
  }

  if (!me || !settings) return null
  const lang = settings.language

  return (
    <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        {/* profile */}
        <SectionCard title={tr('profile')}>
          <div className="flex items-center gap-4">
            <Avatar user={me} size="xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  maxLength={40}
                  aria-label={tr('displayName')}
                  className="h-10 border-[#1E2C4F] bg-[#0A1224] text-[#E7EEFB]"
                />
                <button
                  onClick={saveName}
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                    nameSaved ? 'border-emerald-400 text-emerald-300' : 'border-[#1E2C4F] text-[#8CA3C7] hover:text-[#22D3EE]'
                  )}
                  aria-label="Save name"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
              <p className="truncate text-xs text-[#8CA3C7]">{me.email}</p>
            </div>
          </div>
        </SectionCard>

        {/* language */}
        <SectionCard title={tr('language')}>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['en', 'English'],
                ['hi', 'हिन्दी'],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                onClick={() => void updateSettings({ language: code })}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors',
                  lang === code
                    ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                    : 'border-[#1E2C4F] text-[#8CA3C7] hover:text-[#C9D6F2]'
                )}
              >
                <Globe className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* app install (PWA) */}
        <PwaInstallSection />

        {/* notifications */}
        <SectionCard title={tr('notifications')}>
          <div className="space-y-3">
            <SettingRow
              label={tr('inAppSound')}
              checked={settings.soundEnabled}
              onChange={(v) => void updateSettings({ soundEnabled: v })}
            />
            <SettingRow
              label={tr('inAppVibration')}
              checked={settings.vibrationEnabled}
              onChange={(v) => void updateSettings({ vibrationEnabled: v })}
            />
            <button
              onClick={() => playChime(settings.volume, true)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
            >
              {tr('testSound')}
            </button>
            <p className="text-[11px] text-[#8CA3C7]">{tr('testSoundNote')}</p>
            <PushRow />
          </div>
        </SectionCard>

        {/* signal defaults */}
        <SectionCard title={tr('signalSettings')}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label={tr('wpm')} value={`${settings.wpm}`} />
              <MiniStat label={tr('frequency')} value={`${settings.frequency}`} />
              <MiniStat label={tr('volume')} value={`${settings.volume}`} />
            </div>
            <button
              onClick={() => play('.... . .-.. .-.. ---', 'sound')}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
            >
              {tr('play')}: .... . .-.. .-.. ---
            </button>
            <p className="text-[11px] text-[#8CA3C7]">{tr('speedNote')}</p>
          </div>
        </SectionCard>

        {/* privacy */}
        <SectionCard title={tr('privacy')}>
          <SettingRow
            label={tr('readReceipts')}
            note={tr('readReceiptsNote')}
            checked={settings.readReceipts}
            onChange={(v) => void updateSettings({ readReceipts: v })}
          />
        </SectionCard>

        {/* encryption (beta) — Phase 5 */}
        <EncryptionSection />

        {/* security */}
        <SectionCard title={tr('security')}>
          <button
            onClick={() => void signOutAll()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm font-medium text-[#C9D6F2] hover:border-amber-400/50 hover:text-amber-300"
          >
            <ShieldCheck className="h-4 w-4" /> {tr('signOutAll')}
          </button>
          <p className="mt-2 text-[11px] text-[#8CA3C7]">{tr('signOutAllNote')}</p>
        </SectionCard>

        {/* blocked users */}
        <SectionCard title={tr('blockedUsers')}>
          {blocked.length === 0 ? (
            <p className="py-2 text-sm text-[#8CA3C7]">{tr('noBlocked')}</p>
          ) : (
            <div className="space-y-1.5">
              {blocked.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-[#1E2C4F] p-2.5">
                  <Avatar user={u} size="sm" />
                  <span className="flex-1 truncate text-sm">{u.displayName}</span>
                  <button
                    onClick={() => void unblock(u.id)}
                    className="rounded-lg border border-[#1E2C4F] px-3 py-1.5 text-xs text-[#8CA3C7] hover:text-[#22D3EE]"
                  >
                    {tr('unblockUser')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* account */}
        <SectionCard title={tr('account')}>
          <div className="space-y-2">
            <a
              href="/api/account/export"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm font-medium text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
            >
              <Download className="h-4 w-4" /> {tr('exportData')}
            </a>
            <p className="text-[11px] text-[#8CA3C7]">{tr('exportNote')}</p>
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-900/50 text-sm font-medium text-red-300 hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" /> {tr('deleteAccount')}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm font-medium text-[#C9D6F2] hover:bg-[#0A1224]"
            >
              <LogOut className="h-4 w-4" /> {tr('signOut')}
            </button>
          </div>
        </SectionCard>

        {/* about + disclaimers (PRD 17 product principles) */}
        <SectionCard title={tr('about')}>
          <div className="space-y-2 text-[11px] leading-relaxed text-[#8CA3C7]">
            <p>{tr('aboutBody1')}</p>
            <p>{tr('aboutBody2')}</p>
            <p>{tr('aboutBody3')}</p>
            {!canVibrate() && <p>{tr('noVibrationSupport')}</p>}
            <p className="pt-1 font-mono text-[10px] text-[#8CA3C7]">Morse Messenger · MVP build · PWA</p>
          </div>
        </SectionCard>
      </div>

      {/* delete account confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="border-[#1E2C4F] bg-[#101B33] text-[#E7EEFB]">
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('deleteAccount')}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8CA3C7]">{tr('deleteAccountNote')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={tr('deleteAccountConfirm')}
            className="h-10 border-[#1E2C4F] bg-[#0A1224] placeholder:text-[#8CA3C7]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#1E2C4F] bg-transparent text-[#C9D6F2] hover:bg-[#0A1224]">
              {tr('clear')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteAccount()}
              disabled={deleteConfirm !== me.displayName}
              className="bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-40"
            >
              {tr('deleteAccount')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SettingRow({
  label,
  note,
  checked,
  onChange,
}: {
  label: string
  note?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm text-[#E7EEFB]">{label}</span>
        {note && <span className="mt-0.5 block text-[11px] leading-snug text-[#8CA3C7]">{note}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#22D3EE]" />
    </label>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-2.5 text-center">
      <p className="font-mono text-sm font-bold text-[#22D3EE]">{value}</p>
      <p className="truncate text-[10px] text-[#8CA3C7]">{label}</p>
    </div>
  )
}

/** Web Push (ROADMAP P0): system notifications even when the app is closed. */
function PushRow() {
  const tr = useApp((s) => s.tr)
  const [state, setState] = useState<PushState | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    void getPushState().then(setState)
  }, [])

  async function toggle(on: boolean) {
    setWorking(true)
    try {
      if (on) {
        const res = await enablePush()
        if (!res.ok) {
          // 'denied' still reads back as denied below; surface other failures
          if (res.error === 'key' || res.error === 'subscribe') {
            alert(tr('pushError'))
          }
        }
      } else {
        await disablePush()
      }
      setState(await getPushState())
    } finally {
      setWorking(false)
    }
  }

  if (state === 'unsupported' || !pushSupported()) return null

  async function sendTest() {
    // Direct user-gesture test of the OS notification layer — bypasses the
    // subscribed check on purpose so it works before and after enabling push.
    const ok = await showSystemNotification({ title: 'Morse Messenger', body: tr('pushTestBody') })
    if (!ok) alert(tr('pushDenied'))
  }

  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm text-[#E7EEFB]">{tr('pushNotifications')}</span>
          {state === 'denied' ? (
            <span className="mt-0.5 block text-[11px] leading-snug text-amber-400/90">{tr('pushDenied')}</span>
          ) : (
            <span className="mt-0.5 block text-[11px] leading-snug text-[#8CA3C7]">{tr('pushNote')}</span>
          )}
        </span>
        <Switch
          checked={state === 'subscribed'}
          disabled={working || state === 'denied'}
          onCheckedChange={(v) => void toggle(v)}
          className="data-[state=checked]:bg-[#22D3EE]"
        />
      </label>
      <button
        onClick={() => void sendTest()}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-sm text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
      >
        {tr('pushTest')}
      </button>
    </div>
  )
}

/** Encryption (Beta): device key status, fingerprint, reset (Phase 5) */
function EncryptionSection() {
  const tr = useApp((s) => s.tr)
  const addNotification = useApp((s) => s.addNotification)
  const [fp, setFp] = useState<string | null>(null)
  const [published, setPublished] = useState<boolean | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [fpRes, keysRes] = await Promise.all([
          import('@/lib/e2ee').then((m) => m.ensureKeypair()),
          fetch('/api/keys').then((r) => (r.ok ? r.json() : null)),
        ])
        if (fpRes) setFp(await keyFingerprint(fpRes.publicKeyJwk))
        setPublished(!!keysRes?.publicKey)
      } catch {
        setPublished(false)
      }
    })()
  }, [])

  async function republish() {
    const result = await publishPublicKey()
    setPublished(result === 'ok')
    if (result === 'ok') {
      addNotification({ type: 'system', titleKey: 'notifTitle', body: tr('keyPublished') })
    } else if (result === 'conflict') {
      addNotification({ type: 'system', titleKey: 'keyConflict', body: tr('keyConflictBody') })
    }
  }

  async function resetKey() {
    resetLocalKeypair()
    // this device deliberately takes over: confirm overrides the server's conflict guard
    const result = await publishPublicKey({ confirm: true })
    setPublished(result === 'ok')
    try {
      const pair = await import('@/lib/e2ee').then((m) => m.ensureKeypair())
      if (pair) setFp(await keyFingerprint(pair.publicKeyJwk))
    } catch {
      /* noop */
    }
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {tr('encryptionSection')}
          <span className="rounded bg-[#22D3EE]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#22D3EE]">
            {tr('e2eeBeta')}
          </span>
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" />
          <p className="text-[11px] leading-relaxed text-[#8CA3C7]">{tr('e2eeNote')}</p>
        </div>
        {fp && (
          <div className="rounded-xl border border-[#1E2C4F] bg-[#0A1224] p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8CA3C7]">
              <KeyRound className="h-3.5 w-3.5" /> {tr('keyFingerprint')}
            </p>
            <p className="break-all font-mono text-xs text-[#22D3EE]">{fp}</p>
            <p className="mt-1.5 text-[10px] text-[#8CA3C7]">
              {published === null ? '...' : published ? '✓ ' + tr('keyPublished') : tr('publishKey')}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void republish()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#1E2C4F] text-xs font-medium text-[#C9D6F2] hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
          >
            <KeyRound className="h-4 w-4" /> {tr('publishKey')}
          </button>
          <button
            onClick={() => void resetKey()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-900/50 text-xs font-medium text-amber-300 hover:bg-amber-950/30"
          >
            <Trash2 className="h-4 w-4" /> {tr('resetKey')}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-[#8CA3C7]">{tr('resetKeyNote')}</p>
      </div>
    </SectionCard>
  )
}
