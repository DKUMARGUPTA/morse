# Roadmap

Priorities are informed by what the mature private messengers do well — Signal
(default-on E2EE, Double Ratchet, minimal metadata), Telegram (polish and
performance), SimpleX (no user IDs, link/QR-based contact establishment) and
the offline-first PWA pattern (IndexedDB + Background Sync).

## P0 — trust, portability and reachability (next)
- **Default-on E2EE for new 1:1 conversations** — encrypted-by-default like Signal; keep the toggle for groups.
- **Disappearing messages** — per-conversation TTL (24h / 7d / 90d), enforced at read time, cleaned by a periodic job.
- **QR-code contact invitations** — the `qrcode` dependency is already present; render invite codes as scannable QR (SimpleX-style connection).
- **Push payload niceties** — localized notification body (currently generic), per-conversation unread counts, and iOS install-first onboarding (iOS requires a home-screen install for push).

> Done previously: **hosted realtime** (Supabase broadcast transport is live in
> production; the Cloudflare Worker remains the stricter upgrade path), the
> **Vercel-native polling fallback** (visibility-gated poller that self-skips
> while realtime is healthy), **Web Push notifications** (VAPID-keyed,
> metadata-only payloads, `PushSubscription` table, Settings toggle with
> permission + denied-state handling, SW click-through to the conversation),
> **background system notifications** (SW-shown banners when the app is hidden,
> push deduped while a page client exists) and **email verification**
> (sha256-hashed single-use tokens, Resend/SMTP providers, resend banner).

## P1 — stronger encryption
- **Signal-style Double Ratchet** (X3DH + ratcheting) for forward secrecy and post-compromise security.
- **Multi-device key sync** — encrypted key backup/passphrase so a new device restores the identity.
- **Key verification UX** — promote the existing key fingerprint to safety-number style verification with a "key changed" warning banner.
- **Group E2EE** via per-sender symmetric keys or MLS once 1:1 ratcheting lands.

## P2 — offline-first and performance
- **IndexedDB message cache** — instant conversation open, offline history browsing.
- **Background send queue** — messages composed offline are sent on reconnect (Background Sync API).
- **Local encrypted search** — search decrypted history in a Web Worker.
- **Vercel-native fallback** — lightweight polling mode when the relay is unreachable, with an explicit "live" indicator (exists) and auto-resync. **Done** — `src/lib/poller.ts` (5s, visibility-gated, self-skips while realtime is connected; also drives notification sounds and open-chat auto-refresh).

## P3 — growth features
- Message reactions and forwarding (standard chat UX both are absent).
- Voice notes and encrypted media (binary E2EE pipeline) — the most-requested feature in comparable open-source messengers.
- Koch-method / Farnsworth-spacing learning path in Learn mode (the CW-community standard: full-speed audio from lesson one, characters added one by one).
- Optional 2FA (TOTP) on login.
- Voice/video calls (needs TURN infra — evaluate after realtime hosting).
- Metadata minimization (SimpleX-style anonymous invite routing).

## Engineering hygiene (ongoing)
- Replace the in-memory rate limiter with a shared store when scaling beyond one region.
- Add unit tests (vitest + jsdom) for the store-level diff/sound logic and the poller; CI currently only lints + typechecks (a production build step was added after a build env mismatch nearly slipped through).
- Add CI coverage for the E2EE round-trip (encrypt → decrypt in headless browser).
- Structured logging + error tracking (e.g. Sentry) for the API routes.
