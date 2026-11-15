// Morse Messenger — Supabase Realtime broadcast transport (ZERO dependencies).
// Speaks the Phoenix channel protocol (vsn=2.0.0 array serializer) directly
// over a plain WebSocket, so no @supabase/supabase-js is needed on the client.
//
//   connect : wss://<ref>.supabase.co/realtime/v1/websocket?apikey=<anon>&vsn=2.0.0
//   frames  : [join_ref, ref, topic, event, payload]
//   join    : [jr, jr, "realtime:<topic>", "phx_join", {config:{...}}]
//   inbound : [jr, ref, "realtime:<topic>", "broadcast", {type:"broadcast", event, payload}]
//   send    : [null, ref, "realtime:<topic>", "<event>", payload]
//   beat    : [null, ref, "phoenix", "heartbeat", {}] every 25s
//
// Server fanout happens over the HTTP broadcast endpoint (src/lib/api-helpers).
// The relay only ever carries E2EE ciphertext; topic names are unguessable ids.

export interface RealtimeEmit {
  emit(event: string, data?: unknown): void
}

export type RealtimeHandler = (data: Record<string, unknown>) => void

const MAX_QUEUED = 50
const HEARTBEAT_MS = 25_000

export class SupabaseRealtimeSocket implements RealtimeEmit {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<RealtimeHandler>>()
  private queue: string[] = []
  private attempts = 0
  private closedByUser = false
  private ref = 1
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private convTopics = new Set<string>() // conversation rooms joined (rejoined on reconnect)
  private joinRefs = new Map<string, string>() // topic -> join_ref (client frames must carry it)
  private userTopic: string

  constructor(
    private supabaseUrl: string,
    private anonKey: string,
    meId: string,
    private onState: (connected: boolean) => void
  ) {
    this.userTopic = `realtime:user:${meId}`
  }

  connect(): void {
    this.closedByUser = false
    this.attempts = 0
    void this.open()
  }

  close(): void {
    this.closedByUser = true
    this.stopHeartbeat()
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.ws = null
    this.onState(false)
  }

  on(event: string, handler: RealtimeHandler): void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
  }

  emit(event: string, data?: unknown): void {
    const d = (data ?? {}) as { conversationId?: string }
    if (event === 'join' && d.conversationId) {
      const topic = `realtime:conv:${d.conversationId}`
      this.convTopics.add(topic)
      this.sendRaw(this.joinFrame(topic))
      return
    }
    if (event === 'leave' && d.conversationId) {
      const topic = `realtime:conv:${d.conversationId}`
      this.convTopics.delete(topic)
      const jr = this.joinRefs.get(topic) ?? null
      this.sendRaw(JSON.stringify([jr, String(this.ref++), topic, 'phx_leave', {}]))
      return
    }
    if (event === 'typing' && d.conversationId) {
      // client->others frames use the 'broadcast' event with the real event
      // nested in the payload, and must carry the channel's join_ref
      const topic = `realtime:conv:${d.conversationId}`
      const jr = this.joinRefs.get(topic) ?? null
      this.sendRaw(JSON.stringify([jr, String(this.ref++), topic, 'broadcast', { type: 'broadcast', event: 'typing', payload: d }]))
    }
  }

  // ---------- internals ----------

  private wsUrl(): string {
    const base = this.supabaseUrl.replace(/^http/, 'ws')
    return `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(this.anonKey)}&vsn=2.0.0`
  }

  private joinFrame(topic: string): string {
    const r = String(this.ref++)
    this.joinRefs.set(topic, r)
    return JSON.stringify([
      r,
      r,
      topic,
      'phx_join',
      { config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false } },
    ])
  }

  private async open(): Promise<void> {
    try {
      const ws = new WebSocket(this.wsUrl())
      this.ws = ws

      ws.onopen = () => {
        this.attempts = 0
        this.onState(true)
        // own user topic (messages, receipts, conversation events)
        this.sendRaw(this.joinFrame(this.userTopic), true)
        // rejoin any conversation rooms from the previous session
        for (const topic of this.convTopics) this.sendRaw(this.joinFrame(topic), true)
        for (const raw of this.queue.splice(0)) this.sendRaw(raw, true)
        this.startHeartbeat()
      }

      ws.onmessage = (e: MessageEvent) => {
        let frame: unknown[]
        try {
          frame = JSON.parse(String(e.data)) as unknown[]
        } catch {
          return
        }
        if (!Array.isArray(frame) || frame.length < 5) return
        const [, , topic, event, payload] = frame as [unknown, unknown, string, string, Record<string, unknown>]
        if (event !== 'broadcast' || typeof topic !== 'string') return
        const inner = (payload ?? {}) as { event?: string; payload?: Record<string, unknown> }
        if (!inner.event) return
        this.handlers.get(inner.event)?.forEach((h) => h(inner.payload ?? {}))
      }

      ws.onclose = () => {
        this.stopHeartbeat()
        this.ws = null
        this.onState(false)
        if (!this.closedByUser) this.scheduleReconnect()
      }

      ws.onerror = () => {
        /* onclose follows immediately */
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRaw(JSON.stringify([null, String(this.ref++), 'phoenix', 'heartbeat', {}]))
      }
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(15_000, 1000 * 2 ** this.attempts) + Math.floor(Math.random() * 400)
    this.attempts++
    setTimeout(() => {
      if (!this.closedByUser) void this.open()
    }, delay)
  }

  private sendRaw(raw: string, flush = false): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(raw)
      } catch {
        /* ignore */
      }
      return
    }
    if (!flush && raw.length < 1024 && this.queue.length < MAX_QUEUED) {
      this.queue.push(raw)
    }
  }
}
