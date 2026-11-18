import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Morse Messenger',
  description: 'The rules for using Morse Messenger: accounts, acceptable use, encryption, availability.',
}

const H2 = 'mt-8 text-lg font-semibold text-[#22D3EE]'
const P = 'mt-3 leading-relaxed text-[#C9D6F2]'
const LI = 'ml-5 mt-2 list-disc leading-relaxed text-[#C9D6F2]'

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-14">
      <p className="text-sm uppercase tracking-widest text-[#8CA3C7]">Morse Messenger</p>
      <h1 className="mt-2 text-3xl font-bold text-[#E7EEFB]">Terms of Service</h1>
      <p className={P}>
        Last updated: 18 November 2025. By creating an account or using Morse Messenger you agree
        to these terms. They are deliberately short and readable.
      </p>

      <h2 className={H2}>1. The service</h2>
      <p className={P}>
        Morse Messenger is a free, invitation-only messaging web app (PWA) with optional
        end-to-end encryption and Morse-code features. It is provided as-is while it is in active
        development; features may change and there is no guaranteed uptime.
      </p>

      <h2 className={H2}>2. Accounts</h2>
      <ul>
        <li className={LI}>One account per person. You are responsible for keeping your password safe and for everything done through your account.</li>
        <li className={LI}>You must provide an accurate email address — sign-up verification is sent there.</li>
        <li className={LI}>Accounts are personal. You may not sell, share or transfer accounts or invitation codes for money.</li>
      </ul>

      <h2 className={H2}>3. Acceptable use</h2>
      <ul>
        <li className={LI}>No harassment, threats, hate speech, sexual content involving minors, or illegal content of any kind.</li>
        <li className={LI}>No spam, bulk unsolicited invitations, automated scraping, or attempts to probe, scan or break the service or other users&apos; accounts.</li>
        <li className={LI}>No impersonating other people. Use a display name you are entitled to use.</li>
        <li className={LI}>We may suspend or delete accounts that violate these rules. Serious reports may be preserved where required by law.</li>
      </ul>

      <h2 className={H2}>4. Encryption</h2>
      <p className={P}>
        Regular chats are stored server-side so history survives device changes. End-to-end
        encrypted (beta) chats are encrypted on your device and cannot be read by us; we also
        cannot recover E2EE history you lose. Do not use Morse Messenger as the only place for
        information you cannot afford to lose.
      </p>

      <h2 className={H2}>5. Your content</h2>
      <p className={P}>
        You keep ownership of what you write. You grant us the limited technical right to store,
        transmit and display your messages in order to operate the service. If you delete your
        account, that right ends with the deletion.
      </p>

      <h2 className={H2}>6. Availability and liability</h2>
      <p className={P}>
        The service is provided &quot;as is&quot; without warranties of any kind. To the maximum
        extent permitted by law, we are not liable for lost messages, lost E2EE history, missed
        notifications, or indirect damages arising from your use of the service. Nothing in these
        terms limits liability that cannot be limited by law.
      </p>

      <h2 className={H2}>7. Termination</h2>
      <p className={P}>
        You can stop using the service at any time and delete your account from Settings →
        Account → Delete, which removes your data immediately. We may terminate accounts that
        break these terms.
      </p>

      <h2 className={H2}>8. Changes</h2>
      <p className={P}>
        Material changes to these terms will be announced in the app before they take effect.
        Continued use after an announcement means acceptance.
      </p>

      <p className="mt-12 text-sm text-[#8CA3C7]">
        <a href="/privacy" className="text-[#22D3EE] hover:underline">Privacy Policy</a>
        <span className="mx-2">·</span>
        <a href="/" className="text-[#22D3EE] hover:underline">Back to Morse Messenger</a>
      </p>
    </main>
  )
}
