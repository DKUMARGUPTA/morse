// Morse Messenger — self-contained reconnecting WebSocket client.
// Zero dependencies: plain browser WebSocket + own reconnect/backoff/queue.
// Used when NEXT_PUBLIC_REALTIME_WS points at the Cloudflare realtime worker.

export interface RealtimeEmit {
  emit(event: string, data?: unknown): void
}

export type RealtimeHandler = (data: Record<string, unknown>) => void

const MAX_QUEUED = 50 // frames kept while offline (join/leave/typing are tiny)

export class RealtimeSocket implements RealtimeEmit {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<RealtimeHandler>>()
  private queue: string[] = []
  private attempts = 0
  private closedByUser = false

  constructor(
    private baseUrl: string,
    private getToken: () => Promise<string>,
    private onState: (connected: boolean) => void
  ) {}

  connect(): void {
    this.closedByUser = false
    this.attempts = 0
    void this.open()
  }

  close(): void {
    this.closedByUser = true
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
    this.sendRaw(JSON.stringify({ t: event, ...((data as Record<string, unknown>) ?? {}) }))
  }

  // ---------- internals ----------

  private async open(): Promise<void> {
    try {
      // a fresh short-lived token is fetched for every attempt — an expired
      // token can never wedge the connection loop
      const token = await this.getToken()
      if (this.closedByUser) return
      if (!token) {
        this.scheduleReconnect()
        return
      }
      const ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`)
      this.ws = ws

      ws.onopen = () => {
        this.attempts = 0
        this.onState(true)
        for (const raw of this.queue.splice(0)) this.sendRaw(raw, true)
      }

      ws.onmessage = (e: MessageEvent) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(e.data)) as Record<string, unknown>
        } catch {
          return
        }
        const t = String(msg.t ?? '')
        if (!t) return
        const rest = { ...msg }
        delete rest.t
        this.handlers.get(t)?.forEach((h) => h(rest))
      }

      ws.onclose = () => {
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
      this.queue.push(raw) // joins/typing survive brief disconnects
    }
  }
}
