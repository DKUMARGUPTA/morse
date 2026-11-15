# Roadmap

Priorities are informed by what the mature private messengers do well — Signal
(default-on E2EE, Double Ratchet, minimal metadata), Telegram (polish and
performance), SimpleX (no user IDs, link/QR-based contact establishment) and
the offline-first PWA pattern (IndexedDB + Background Sync).

## P0 — trust and portability (next)
- **Default-on E2EE for new 1:1 conversations** — encrypted-by-default like Signal; keep the toggle for groups.
- **Disappearing messages** — per-conversation TTL (24h / 7d / 90d), enforced at read time, cleaned by a periodic job.
- **Hosted realtime** — package `mini-services/chat-service` for Railway/Render/Fly so Vercel deployments get live delivery, presence and typing.
- **QR-code contact invitations** — the `qrcode` dependency is already present; render invite codes as scannable QR (SimpleX-style connection).

## P1 — stronger encryption
- **Signal-style Double Ratchet** (X3DH + ratcheting) for forward secrecy and post-compromise security.
- **Multi-device key sync** — encrypted key backup/passphrase so a new device restores the identity.
- **Key verification UX** — promote the existing key fingerprint to safety-number style verification with a "key changed" warning banner.
- **Group E2EE** via per-sender symmetric keys or MLS once 1:1 ratcheting lands.

## P2 — offline-first and performance
- **IndexedDB message cache** — instant conversation open, offline history browsing.
- **Background send queue** — messages composed offline are sent on reconnect (Background Sync API).
- **Local encrypted search** — search decrypted history in a Web Worker.
- **Vercel-native fallback** — lightweight polling mode when the relay is unreachable, with an explicit "live" indicator (exists) and auto-resync.

## P3 — growth features
- Web Push notifications (service worker is already registered).
- Encrypted media and voice notes (binary E2EE pipeline).
- Optional 2FA (TOTP) on login.
- Voice/video calls (needs TURN infra — evaluate after realtime hosting).
- Metadata minimization (SimpleX-style anonymous invite routing).

## Engineering hygiene (ongoing)
- Replace the in-memory rate limiter with a shared store when scaling beyond one region.
- Add CI coverage for the E2EE round-trip (encrypt → decrypt in headless browser).
- Structured logging + error tracking (e.g. Sentry) for the API routes.
