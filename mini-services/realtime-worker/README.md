# morse-realtime — zero-dependency realtime relay

A Cloudflare Worker + Durable Object that relays Morse Messenger realtime events
(message/receipt/typing/presence) **without any npm package, framework or third
party repo** — the entire server is ~300 lines of first-party TypeScript using
only platform primitives (`WebSocketPair`, WebSocket Hibernation, `crypto.subtle`).

It only ever sees E2EE ciphertext — keys live on user devices.

## Why

Vercel serverless cannot run the socket.io relay (long-lived connections).
Instead of paying for a second always-on server (Railway/Render), this worker
runs on Cloudflare's free tier:

- WebSocket Hibernation: idle connections cost nothing
- One global hub Durable Object tags every socket with `user:<id>` and keeps
  conversation-room membership in per-socket attachments
- Presence snapshot on connect (an improvement over the socket.io bus)
- Optional membership enforcement: before a socket joins a conversation room,
  the hub asks the app's internal API whether the user is a member (fail-closed)

## Endpoints

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /health` | anyone | liveness probe |
| `GET /ws?token=<sock JWT>` | browsers | WebSocket upgrade, token verified before any socket exists |
| `POST /internal/emit` | app only | `{room, event, data}` broadcast; guarded by `x-internal-secret` |

Events in → out are byte-compatible with the socket.io bus: `presence`,
`presence:sync`, `message:new/update/hidden`, `receipt:update`, `conv:new/update`
(via `user:<id>` rooms) and `typing` (via `conv:<id>` rooms, sender excluded).

## Configuration

| Env | Kind | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | secret | HS256 secret shared with the app (socket tokens, `kind:"sock"`) |
| `INTERNAL_SECRET` | secret | guards `/internal/emit` and the membership API call |
| `MEMBER_API_URL` | var | e.g. `https://<app>/api/internal/conv-members` — unset = dev mode (joins allowed) |
| `MEMBER_API_SECRET` | var | same value as `INTERNAL_SECRET` |

## Local development

```bash
cp .dev.vars.example .dev.vars     # put the app's AUTH_SECRET here
bunx wrangler dev --port 8787
bun tests/ws-relay-test.mjs        # 18-assertion relay suite (needs wrangler dev)
```

## Deploy (free)

```bash
bunx wrangler login                # once
bunx wrangler secret put AUTH_SECRET       # same value as the app's AUTH_SECRET
bunx wrangler secret put INTERNAL_SECRET   # openssl rand -hex 32
bunx wrangler deploy               # prints https://morse-realtime.<subdomain>.workers.dev
```

Then in the Next.js app environment (Vercel):

```
NEXT_PUBLIC_REALTIME_WS=https://morse-realtime.<subdomain>.workers.dev
SOCKET_INTERNAL_URL=https://morse-realtime.<subdomain>.workers.dev/internal/emit
SOCKET_INTERNAL_SECRET=<same INTERNAL_SECRET>
```

And set the membership enforcement on the worker (production hardening):

```bash
bunx wrangler vars put MEMBER_API_URL "https://<your-app-domain>/api/internal/conv-members"
bunx wrangler vars put MEMBER_API_SECRET "<same INTERNAL_SECRET>"
```

Verify with `curl https://morse-realtime.<subdomain>.workers.dev/health`.

## Test matrix

| Suite | Command | Coverage |
| --- | --- | --- |
| Relay suite | `bun tests/ws-relay-test.mjs` | auth rejects, user-room fanout + isolation, typing exclusion, presence on/off, internal-emit auth, malformed frames |
| Membership suite | `bun tests/membership-test.mjs` | non-member join denied, no traffic leak, no injection (needs MEMBER_* vars) |
| Full-stack E2E | `bun scripts/realtime-e2e-test.mjs` (repo root) | real API accounts/tokens → worker → live delivery of message/receipt/typing/presence |
