# Morse Messenger

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

- Passwords hashed with scrypt; sessions are JWTs in httpOnly cookies; `tokenVersion` invalidates all sessions on password change / sign-out-everywhere
- E2EE (beta): ECDH P-256 key agreement per 1:1 chat, AES-GCM payloads; the server only ever stores ciphertext
- Deleted messages stay deleted; nothing can prevent screenshots on the receiver's device
