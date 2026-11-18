import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Morse Messenger',
  description: 'What Morse Messenger stores, what it never collects, and who processes your data.',
}

const H2 = 'mt-8 text-lg font-semibold text-[#22D3EE]'
const P = 'mt-3 leading-relaxed text-[#C9D6F2]'
const LI = 'ml-5 mt-2 list-disc leading-relaxed text-[#C9D6F2]'

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-14">
      <p className="text-sm uppercase tracking-widest text-[#8CA3C7]">Morse Messenger</p>
      <h1 className="mt-2 text-3xl font-bold text-[#E7EEFB]">Privacy Policy</h1>
      <p className={P}>
        Last updated: 18 November 2025. Morse Messenger is an invitation-only encrypted messenger
        that runs entirely in your browser as a PWA. This page explains, in plain language, what we
        store and what we deliberately do not collect.
      </p>

      <h2 className={H2}>What we store</h2>
      <ul>
        <li className={LI}>Your account: email address, display name, a random avatar colour, and a salted password hash (scrypt). We never store your password itself.</li>
        <li className={LI}>Your messages. For regular chats the text is stored server-side so you can read your history on any device. For end-to-end encrypted (E2EE, beta) chats, only client-side ciphertext is stored — the server cannot read it.</li>
        <li className={LI}>Delivery metadata: who sent what and when, read/delivery receipts, conversation membership. This is what powers ticks and unread counts.</li>
        <li className={LI}>Push notification subscriptions (browser endpoint and keys) if you enable push — used only to wake your device when a message arrives. Push payloads contain sender and conversation references only, never message text.</li>
        <li className={LI}>Morse learning progress (characters practised, daily counts) if you use the Learn tab.</li>
      </ul>

      <h2 className={H2}>What we never collect</h2>
      <ul>
        <li className={LI}>Your phone number — sign-up is email and invitation only.</li>
        <li className={LI}>Your contacts — we never upload, read or match your address book.</li>
        <li className={LI}>Location data, advertising identifiers, or behavioural/advertising trackers of any kind. There are no ads and no third-party analytics scripts.</li>
      </ul>

      <h2 className={H2}>What Morse can see</h2>
      <p className={P}>
        In end-to-end encrypted (beta) chats, we see only ciphertext — never the text. For regular
        chats, and for every message's delivery on either setting, the server necessarily handles
        the metadata it needs to run the service: who messaged whom and when, message size, and
        read/delivery receipts. Message content is only ever inspected when you explicitly report a
        message for abuse. There is no advertising, no profiling and no analytics anywhere in the
        product.
      </p>

      <h2 className={H2}>End-to-end encryption (beta)</h2>
      <p className={P}>
        When you enable E2EE on a chat, messages are encrypted in your browser with AES-GCM using a
        key derived from an ECDH P-256 exchange. Private keys never leave your device. This also
        means: if you clear your browser storage, your E2EE history cannot be recovered — there is
        no backup we could offer even if you asked.
      </p>

      <h2 className={H2}>Service providers (processors)</h2>
      <ul>
        <li className={LI}><strong className="text-[#E7EEFB]">Vercel</strong> — application hosting and edge network (United States).</li>
        <li className={LI}><strong className="text-[#E7EEFB]">Supabase</strong> — Postgres database, authentication infrastructure and realtime message bus (United States).</li>
        <li className={LI}><strong className="text-[#E7EEFB]">Resend or your SMTP provider</strong> — delivery of the sign-up verification email.</li>
        <li className={LI}><strong className="text-[#E7EEFB]">Browser push services</strong> (Google/Apple/Mozilla/Microsoft endpoints) — deliver push notifications to your device when enabled.</li>
      </ul>

      <h2 className={H2}>Your data, your control</h2>
      <ul>
        <li className={LI}>Data export: Settings → Account → Export downloads your conversations and profile as JSON.</li>
        <li className={LI}>Account deletion: Settings → Account → Delete removes your account, conversations, messages, receipts, invitations, push subscriptions and learning progress permanently and immediately.</li>
        <li className={LI}>Verification emails are sent once at sign-up; verification tokens are stored only as SHA-256 hashes and expire within days.</li>
      </ul>

      <h2 className={H2}>Children</h2>
      <p className={P}>
        Morse Messenger is not directed at children under 13, and we do not knowingly create
        accounts for them. If you believe a child has an account, contact us and we will remove it.
      </p>

      <h2 className={H2}>Contact</h2>
      <p className={P}>
        Questions, data requests or abuse reports: use the in-app report function, or write to the
        project repository (github.com/DKUMARGUPTA/morse). We respond to verified requests within
        30 days.
      </p>

      <p className="mt-12 text-sm text-[#8CA3C7]">
        <a href="/terms" className="text-[#22D3EE] hover:underline">Terms of Service</a>
        <span className="mx-2">·</span>
        <a href="/" className="text-[#22D3EE] hover:underline">Back to Morse Messenger</a>
      </p>
    </main>
  )
}
