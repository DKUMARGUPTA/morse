# Morse Messenger

[![CI](https://github.com/DKUMARGUPTA/morse/actions/workflows/ci.yml/badge.svg)](https://github.com/DKUMARGUPTA/morse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DKUMARGUPTA/morse&env=AUTH_SECRET,DATABASE_URL)

**Chat normally. Talk in Morse.** — A global chat platform with built-in Morse code communication: convert any message to Morse and send it through **sound, screen light or vibration**, practice with an interactive tutor, and chat in a familiar messaging UI.

> MVP build of the Morse Messenger PRD v1.0.

## Features

- **Familiar chat** — 1:1 conversations via invite links + QR codes, real-time delivery with typing indicators, read receipts, unread badges
- **Morse composer** — every message can be composed in three modes: Text / Morse / Dual (side-by-side preview)
- **Signal channels** — transmit Morse via Web Audio tones, screen-light overlay (for cameras/optics), or device vibration; graceful capability detection and fallbacks
- **Telegraph key** — a real straight-key style input: press timing translates directly into dots and dashes
- **Morse Studio** — free playground: translate, play, tune WPM / frequency / volume
- **Learn mode** — reference cards, listen-and-identify quizzes, streaks and achievements with daily practice tracking
- **E2EE (beta)** — end-to-end encrypted 1:1 chats using ECDH P-256 + AES-GCM; private keys never leave the device
- **Safety** — block users (server-enforced), report conversations, account data export & deletion
- **Bilingual UI** — full English / हिन्दी switching
- **PWA** — installable (home-screen app), offline-ready via service worker

> **Note:** Morse code is an *encoding*, not encryption. E2EE is beta and should only be called fully secure after an independent security review.

## Tech stack

| Layer | Tech |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui, lucide-react |
| State | Zustand |
| Database | Supabase Postgres via Prisma ORM |
| Realtime | Zero-dependency Cloudflare Worker + Durable Object (production) · socket.io relay mini-service (sandbox/preview) |
| Auth | Email + scrypt password hashing, JWT httpOnly cookies |

## Project structure

```
├── prisma/                  # schema.prisma (Postgres) + schema.postgres.prisma
├── src/
│   ├── app/                 # Next.js app router + API routes
│   ├── components/          # chats, morse studio, learn, settings, pwa
│   ├── hooks/               # signal player, PWA install, toasts
│   └── lib/                 # morse engine, signal engine, auth, i18n, store, socket
├── mini-services/
│   ├── chat-service/        # socket.io realtime relay (port 3003, sandbox/preview)
│   └── realtime-worker/     # zero-dependency Cloudflare Worker + Durable Object (production)
├── supabase/                # migration guide + SQL schema
└── scripts/                 # data migration, icon generation, test suites
```

## Getting started

### 1. Install

```bash
bun install        # or npm install
```

### 2. Environment

```bash
cp .env.example .env
# fill in AUTH_SECRET + Supabase Postgres DATABASE_URL (see .env.example comments)
```

### 3. Database

```bash
bunx prisma generate
bunx prisma db push
```

### 4. Run

```bash
npm run dev                      # app on :3000
cd mini-services/chat-service && bun index.ts   # realtime relay on :3003
```

Behind a proxy (Caddy config included) the socket client reaches the relay via
`/?XTransformPort=3003` path rewriting.

## Morse timing

Standard international timing at configurable WPM: dot = 1 unit, dash = 3,
intra-character gap = 1, character gap = 3, word gap = 7. The word **PARIS**
defines the WPM reference. Text ⇄ Morse conversion lives in `src/lib/morse.ts`.

## Security model

- **Sessions** — scrypt-hashed passwords, HS256 JWTs in httpOnly SameSite cookies (`secure` in production); `tokenVersion` invalidates every session on password change / sign-out-everywhere
- **Realtime auth** — the relay rejects unauthenticated handshakes; clients present a short-lived signed socket token (`/api/socket/token`) verified with the same `AUTH_SECRET`
- **Room membership** — in production the realtime worker verifies conversation membership via a secret-guarded internal API before joining a room (fail-closed); server→relay broadcasts require a shared internal secret
- **Brute force** — sliding-window rate limits: login 5/min per account + 10/min per IP, registration 5/min per IP (HTTP 429)
- **Headers** — CSP, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy on every route
- **E2EE (beta, opt-in per conversation)** — ECDH P-256 key agreement, AES-GCM-256 payloads; the server only stores ciphertext and can never search it. No forward secrecy yet — the honest limitation list lives in [docs/SECURITY.md](docs/SECURITY.md)
- Deleted messages stay deleted; nothing can prevent screenshots on the receiver's device

## Testing

```bash
npm run lint                        # eslint
npx tsc --noEmit                    # typecheck (app + realtime worker)
./scripts/api-smoke-test.sh         # 22-step API flow against a running dev server
bun scripts/socket-auth-test.mjs    # socket.io handshake security
bun scripts/realtime-e2e-test.mjs   # full-stack: API → CF worker → live delivery (needs wrangler dev)
bun mini-services/realtime-worker/tests/ws-relay-test.mjs        # relay suite (18 assertions)
bun mini-services/realtime-worker/tests/membership-test.mjs      # room membership enforcement
```

The smoke test creates two disposable `@morse.test` users, exercises auth → conversations → messages → receipts → keys → export, then deletes them. `scripts/cleanup-qa-users.ts` removes any leftovers.

## Deployment

**Vercel + Supabase (recommended)**

1. Import the repo on Vercel (framework auto-detected)
2. Set `DATABASE_URL` (Supabase session-pooler URI) and `AUTH_SECRET` (`openssl rand -base64 32`)
3. Deploy — `prisma generate` runs automatically on install; push the schema once from any machine with DB access: `bunx prisma db push`

### Realtime (zero-dependency Cloudflare Worker — free)

The socket.io relay needs a long-running process, so production realtime runs on
a **self-contained Cloudflare Worker + Durable Object** (~300 lines of first-party
code, no npm packages, WebSocket Hibernation = free tier friendly):

1. `cd mini-services/realtime-worker` — full guide in [its README](mini-services/realtime-worker/README.md)
2. `bunx wrangler secret put AUTH_SECRET` (same value as the app) and `INTERNAL_SECRET`, then `bunx wrangler deploy`
3. In Vercel set `NEXT_PUBLIC_REALTIME_WS`, `SOCKET_INTERNAL_URL`, `SOCKET_INTERNAL_SECRET` (values in the worker README)

Verified by a 3-layer test matrix (relay suite, membership enforcement suite,
full-stack E2E) — 45+ assertions covering auth, isolation, presence, receipts
and live delivery.

**Fallback:** without those env vars the app degrades gracefully — sandbox mode
uses the socket.io mini-service, and without any relay new messages sync on
refresh (persistence is always the source of truth).

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) — Signal-style ratcheting, disappearing messages, offline-first sync, group E2EE and more.

## License

[MIT](LICENSE)
