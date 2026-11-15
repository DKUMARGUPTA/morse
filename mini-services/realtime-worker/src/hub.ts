// Morse Messenger — realtime hub (Cloudflare Durable Object, ZERO dependencies).
// Pure relay for E2EE ciphertext: verifies signed socket tokens, keeps per-socket
// room membership, broadcasts typing/presence/message events. Plaintext never
// reaches this service — it only ever sees opaque encrypted payloads.
//
// Uses the WebSocket Hibernation API: idle connections cost (almost) nothing and
// the object survives without holding every socket in memory.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface Env {
  AUTH_SECRET: string
  INTERNAL_SECRET: string
  MEMBER_API_URL?: string
  MEMBER_API_SECRET?: string
  HUB: DurableObjectNamespace
}

interface SockTokenPayload {
  sub: string
  kind: string
  exp: number
}

interface SocketAttachment {
  userId: string
  rooms: string[]
}

// ---------- crypto helpers (self-contained, no libraries) ----------

function b64urlToBytes(input: string): ArrayBuffer {
  let s = input.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4 !== 0) s += '='
  const bin = atob(s)
  const buf = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return buf
}

/** Constant-time string comparison for shared secrets. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a)
  const bb = encoder.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/** Verify a signed socket token (HS256, same scheme as src/lib/auth.ts). */
async function verifySocketToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), encoder.encode(`${header}.${payload}`))
    if (!valid) return null
    const data = JSON.parse(decoder.decode(b64urlToBytes(payload))) as SockTokenPayload
    if (data.kind !== 'sock' || !data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null
    return String(data.sub)
  } catch {
    return null
  }
}

// ---------- limits ----------

const CONV_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_CLIENT_MSG = 2048 // client -> server frames are tiny (join/leave/typing)
const RATE_LIMIT = 40 // frames per window per connection
const RATE_WINDOW_MS = 10_000
const MEMBER_CACHE_TTL_MS = 300_000
const MEMBER_TIMEOUT_MS = 5000

export class RealtimeHub {
  private ctx: DurableObjectState
  private env: Env
  private rate = new Map<WebSocket, { n: number; resetAt: number }>()
  private memberCache = new Map<string, { ok: boolean; until: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // --- browser WebSocket upgrade (auth happens here, before any socket exists) ---
    if (url.pathname === '/connect' && req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const token = url.searchParams.get('token') ?? ''
      const userId = await verifySocketToken(token, this.env.AUTH_SECRET)
      if (!userId) return new Response('unauthorized', { status: 401 })

      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1], [`user:${userId}`])
      pair[1].serializeAttachment({ userId, rooms: [] } satisfies SocketAttachment)
      this.presence(userId, true)
      // improvement over the socket.io bus: send the new socket a snapshot of
      // currently-online users so presence is never missed across reconnects
      const online = new Set<string>()
      for (const other of this.ctx.getWebSockets()) {
        const o = this.attachment(other)
        if (o) online.add(o.userId)
      }
      try {
        pair[1].send(JSON.stringify({ t: 'presence:sync', online: [...online] }))
      } catch {
        /* ignore */
      }
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    // --- internal bridge from the Next.js API (same contract as the local bridge) ---
    if (url.pathname === '/emit' && req.method === 'POST') {
      let body: { room?: unknown; event?: unknown; data?: unknown }
      try {
        body = (await req.json()) as typeof body
      } catch {
        return new Response('bad request', { status: 400 })
      }
      const room = String(body.room ?? '')
      const event = String(body.event ?? '')
      if (!room || !event || room.length > 128 || event.length > 64) {
        return new Response('bad request', { status: 400 })
      }
      this.broadcast(room, event, body.data ?? {}, null)
      return Response.json({ ok: true })
    }

    return new Response('not found', { status: 404 })
  }

  // ---------- client frames ----------

  async webSocketMessage(ws: WebSocket, raw: WebSocketMessageEvent): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_CLIENT_MSG) return
    if (!this.allowFrame(ws)) return

    let msg: { t?: string; conversationId?: unknown; displayName?: unknown; isTyping?: unknown }
    try {
      msg = JSON.parse(raw) as typeof msg
    } catch {
      return
    }

    const att = this.attachment(ws)
    if (!att) return

    if (msg.t === 'join' || msg.t === 'leave') {
      const convId = String(msg.conversationId ?? '')
      if (!CONV_ID_RE.test(convId)) return
      const room = `conv:${convId}`
      if (msg.t === 'join') {
        const allowed = await this.canJoin(convId, att.userId)
        if (!allowed) return
        if (!att.rooms.includes(room)) {
          att.rooms.push(room)
          ws.serializeAttachment(att)
        }
      } else {
        att.rooms = att.rooms.filter((r) => r !== room)
        ws.serializeAttachment(att)
      }
      return
    }

    if (msg.t === 'typing') {
      const convId = String(msg.conversationId ?? '')
      if (!CONV_ID_RE.test(convId)) return
      const room = `conv:${convId}`
      // only members who joined the room may signal typing (parity with socket.io)
      if (!att.rooms.includes(room)) return
      const displayName = String(msg.displayName ?? '').slice(0, 64)
      this.broadcast(room, 'typing', { conversationId: convId, userId: att.userId, displayName, isTyping: !!msg.isTyping }, ws)
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.rate.delete(ws)
    const att = this.attachment(ws)
    if (!att) return
    let remaining = 0
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue
      const o = this.attachment(other)
      if (o && o.userId === att.userId) remaining++
    }
    if (remaining === 0) this.presence(att.userId, false)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.rate.delete(ws)
  }

  // ---------- internals ----------

  private attachment(ws: WebSocket): SocketAttachment | null {
    try {
      return (ws.deserializeAttachment() as SocketAttachment) ?? null
    } catch {
      return null
    }
  }

  private allowFrame(ws: WebSocket): boolean {
    const now = Date.now()
    let entry = this.rate.get(ws)
    if (!entry || entry.resetAt < now) {
      entry = { n: 0, resetAt: now + RATE_WINDOW_MS }
      this.rate.set(ws, entry)
    }
    entry.n++
    if (entry.n > RATE_LIMIT) {
      try {
        ws.close(4429, 'rate limited')
      } catch {
        /* already closing */
      }
      return false
    }
    return true
  }

  private presence(userId: string, online: boolean): void {
    this.broadcastAll({ t: 'presence', userId, online })
  }

  private broadcastAll(payload: unknown): void {
    const raw = JSON.stringify(payload)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(raw)
      } catch {
        /* ignore dead sockets; hibernation GC will clean up */
      }
    }
  }

  /** Broadcast `event` to every socket in `room`. `user:` rooms use accept-time tags,
   *  `conv:` rooms use per-socket attachments (membership can change at runtime). */
  private broadcast(room: string, event: string, data: unknown, exclude: WebSocket | null): void {
    const raw = JSON.stringify({ t: event, ...((data as Record<string, unknown>) ?? {}) })
    if (room.startsWith('user:')) {
      for (const ws of this.ctx.getWebSockets(room)) {
        if (ws === exclude) continue
        try {
          ws.send(raw)
        } catch {
          /* ignore */
        }
      }
      return
    }
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue
      const att = this.attachment(ws)
      if (!att || !att.rooms.includes(room)) continue
      try {
        ws.send(raw)
      } catch {
        /* ignore */
      }
    }
  }

  /** Verify conversation membership via the app's internal API (production).
   *  Without MEMBER_API_URL (sandbox/dev) joins are allowed — E2EE ciphertext
   *  is opaque, and the app layer still gates every payload. */
  private async canJoin(convId: string, userId: string): Promise<boolean> {
    if (!this.env.MEMBER_API_URL) return true
    const key = `${convId}:${userId}`
    const hit = this.memberCache.get(key)
    if (hit && hit.until > Date.now()) return hit.ok

    let ok = false
    try {
      const sep = this.env.MEMBER_API_URL.includes('?') ? '&' : '?'
      const res = await fetch(
        `${this.env.MEMBER_API_URL}${sep}conversationId=${encodeURIComponent(convId)}&userId=${encodeURIComponent(userId)}`,
        {
          headers: { 'x-internal-secret': this.env.MEMBER_API_SECRET ?? '' },
          signal: AbortSignal.timeout(MEMBER_TIMEOUT_MS),
        }
      )
      if (res.ok) {
        const j = (await res.json()) as { member?: boolean }
        ok = !!j.member
      }
    } catch {
      ok = false // fail closed in production
    }
    this.memberCache.set(key, { ok, until: Date.now() + MEMBER_CACHE_TTL_MS })
    return ok
  }
}
