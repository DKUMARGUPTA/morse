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
| Realtime | socket.io relay service (separate mini-service) |
| Auth | Email + scrypt password hashing, JWT httpOnly cookies |

## Project structure

```
├── prisma/                  # schema.prisma (Postgres) + schema.postgres.prisma
├── src/
│   ├── app/                 # Next.js app router + API routes
│   ├── components/          # chats, morse studio, learn, settings, pwa
│   ├── hooks/               # signal player, PWA install, toasts
│   └── lib/                 # morse engine, signal engine, auth, i18n, store, socket
├── mini-services/           # socket.io realtime relay (port 3003)
├── supabase/                # migration guide + SQL schema
└── scripts/                 # data migration & icon generation
```

## Getting started

### 1. Install

```bash
bun install        # or npm install
```

### 2. Environment

```bash
cp .env.example .env
# fill in JWT_SECRET + Supabase Postgres DATABASE_URL (see .env.example comments)
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
- **Realtime auth** — the socket relay rejects unauthenticated handshakes; clients present a short-lived signed socket token (`/api/socket/token`) verified with the same `AUTH_SECRET`
- **Brute force** — sliding-window rate limits: login 5/min per account + 10/min per IP, registration 5/min per IP (HTTP 429)
- **Headers** — CSP, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy on every route
- **E2EE (beta, opt-in per conversation)** — ECDH P-256 key agreement, AES-GCM-256 payloads; the server only stores ciphertext and can never search it. No forward secrecy yet — the honest limitation list lives in [docs/SECURITY.md](docs/SECURITY.md)
- Deleted messages stay deleted; nothing can prevent screenshots on the receiver's device

## Testing

```bash
npm run lint                        # eslint
npx tsc --noEmit                    # typecheck
./scripts/api-smoke-test.sh         # 22-step API flow against a running dev server
bun scripts/socket-auth-test.mjs    # realtime handshake security
```

The smoke test creates two disposable `@morse.test` users, exercises auth → conversations → messages → receipts → keys → export, then deletes them. `scripts/cleanup-qa-users.ts` removes any leftovers.

## Deployment

**Vercel + Supabase (recommended)**

1. Import the repo on Vercel (framework auto-detected)
2. Set `DATABASE_URL` (Supabase session-pooler URI) and `AUTH_SECRET` (`openssl rand -base64 32`)
3. Deploy — `prisma generate` runs automatically on install; push the schema once from any machine with DB access: `bunx prisma db push`

> **Realtime note:** the socket.io relay needs a long-running process, so live typing/presence/instant delivery does not run on Vercel serverless — history syncs on refresh. Host `mini-services/chat-service` on Railway/Render/Fly and point clients at it for full realtime.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) — Signal-style ratcheting, disappearing messages, offline-first sync, group E2EE and more.

## License

[MIT](LICENSE)
