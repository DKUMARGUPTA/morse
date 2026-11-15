# Security — Morse Messenger

## Reporting a vulnerability

Please use GitHub's **private security advisory** feature (Security → Report a vulnerability) on this repository instead of a public issue. Include reproduction steps and, if possible, a proof of concept. Do not test against accounts or data you do not own.

## Security model

### Accounts & sessions
- Passwords are hashed with **scrypt** (16-byte random salt, 64-byte derived key, timing-safe comparison).
- Sessions are **HS256 JWTs** carried in an `httpOnly`, `SameSite=Lax` cookie (`secure` in production) with a 30-day expiry.
- Every user has a `tokenVersion`; bumping it (password change, "sign out everywhere") instantly invalidates all previously issued sessions.
- Production **refuses to boot** without `AUTH_SECRET` — the well-known dev fallback can never sign sessions outside development.

### Realtime (chat-service)
- The socket.io relay is **not open**: every handshake must present a signed socket token (`GET /api/socket/token`, 24h expiry) verified with HMAC + timing-safe comparison. Unauthenticated sockets are rejected before joining any room.
- Message payloads are only ever broadcast to **per-user rooms** — the server never relays a message to a room the recipient has not been placed in by the API.

### Abuse controls
- Sliding-window rate limits: **login 5/min per account + 10/min per IP**, **registration 5/min per IP** (HTTP 429).
- Blocks are enforced server-side at message-send and conversation-create time.
- Security headers on every route: CSP (`default-src 'self'`, no external origins), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off).
- All queries go through **Prisma** (parameterized); list endpoints select minimal fields and verify conversation membership before returning data.

## E2EE — honest scope (beta)

E2EE is **opt-in per conversation**. Design: WebCrypto **ECDH P-256** key agreement between the two members, **AES-GCM-256** payloads (`base64(iv ‖ ciphertext)`), private key generated per device and kept in `localStorage`; the server stores and relays ciphertext only.

**Current limitations (known and accepted):**
1. The private key is extractable from the browser profile — no hardware protection or encrypted local store yet.
2. **No forward secrecy / post-compromise security** — the shared key is static ECDH, not a Double Ratchet.
3. **No multi-device key sync** — a new device means a new key and re-verification.
4. Server-side search skips encrypted conversations (the server never sees plaintext); the client decrypts and searches locally instead.
5. Re-publishing a public key replaces the old one silently — key-change notifications are on the roadmap.
6. Group conversations do not support E2EE yet (needs per-sender keys).

## Known limitations

- The rate limiter is **in-memory and per-instance** — correct for a single-region deployment, not a distributed one.
- Rate limiting keys on `x-forwarded-for`; this is authoritative on Vercel/behind the sandbox gateway, but a directly exposed deployment could see spoofed IPs.
- Joining a *conversation typing room* (`conv:<id>`) is not membership-checked in the relay — this only exposes typing/presence events, never message payloads.
- Nothing can prevent screenshots or copy-paste on the receiver's device.

## Production checklist

- [ ] `AUTH_SECRET` set to a strong random value (`openssl rand -base64 32`) on **every** environment (app + chat-service)
- [ ] Database behind SSL (`sslmode=require`) with least-privilege credentials
- [ ] `.env` never committed; rotate any credential that appears in chat logs, tickets or screenshots
- [ ] HTTPS enforced (automatic on Vercel)
- [ ] Rotate the DB password after team changes; use separate credentials for app vs. migrations
