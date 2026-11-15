// Morse Messenger — realtime worker entry (zero-dependency Cloudflare Worker).
// Routes:
//   GET  /health          → liveness probe
//   GET  /ws?token=...    → browser WebSocket upgrade (auth in the hub DO)
//   POST /internal/emit   → server-to-server broadcast from the Next.js API
//
// This relay only ever sees E2EE ciphertext — keys live on user devices.

import { RealtimeHub, constantTimeEqual, type Env } from './hub'

export { RealtimeHub }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const hub = env.HUB.get(env.HUB.idFromName('global'))

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'morse-realtime' })
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket', { status: 426 })
      }
      // forward the upgrade (with ?token=...) into the hub for auth + acceptance
      const connectUrl = `https://hub/connect?token=${encodeURIComponent(url.searchParams.get('token') ?? '')}`
      return hub.fetch(new Request(connectUrl, req))
    }

    if (url.pathname === '/internal/emit' && req.method === 'POST') {
      const secret = req.headers.get('x-internal-secret') ?? ''
      if (!constantTimeEqual(secret, env.INTERNAL_SECRET)) {
        return new Response('forbidden', { status: 403 })
      }
      return hub.fetch(
        new Request('https://hub/emit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: await req.text(),
        })
      )
    }

    return new Response('not found', { status: 404 })
  },
}
