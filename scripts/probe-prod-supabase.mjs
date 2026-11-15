// Live probe of the production Supabase Realtime path (as deployed on Vercel).
// Uses the PUBLIC anon key baked into the client bundle — no secrets involved.
// Joins a probe topic exactly like src/lib/supabase-realtime.ts does, then
// posts a broadcast exactly like src/lib/api-helpers.ts does, and reports
// which frames come back.
const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
if (!ANON) {
  console.error('need SB_ANON')
  process.exit(1)
}
const BASE = `probe${Date.now()}`
const TOPIC = `realtime:${BASE}`
const seen = []

const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=2.0.0`)
let ref = 1

ws.addEventListener('open', () => {
  console.log('WS open')
  const r = String(ref++)
  ws.send(JSON.stringify([r, r, TOPIC, 'phx_join', {
    config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false },
  }]))
})
ws.addEventListener('message', (e) => {
  const s = String(e.data)
  console.log('<<', s.slice(0, 200))
  try {
    const f = JSON.parse(s)
    if (Array.isArray(f) && f[3] === 'phx_reply' && f[4]?.status === 'ok' && String(f[2]).includes(BASE)) seen.push('joined')
    if (Array.isArray(f) && f[3] === 'broadcast' && f[4]?.payload?.hello === 'from-anon-fanout') seen.push('broadcast-received')
  } catch { /* ignore */ }
})
ws.addEventListener('close', (e) => console.log('WS close', e.code, e.reason))
ws.addEventListener('error', () => console.log('WS error'))

async function fanout(key, event) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: BASE, event, payload: { hello: event, ts: Date.now() } }] }),
  })
  console.log('fanout', event, '-> HTTP', res.status, (await res.text()).slice(0, 120))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

setTimeout(async () => {
  await sleep(2500)
  await fanout(ANON, 'from-anon-fanout')
  await sleep(3000)
  console.log('SEEN:', JSON.stringify(seen))
  const ok = seen.includes('joined') && seen.includes('broadcast-received')
  console.log(ok ? 'PROBE PASS — production realtime pipe works' : 'PROBE FAIL — broadcast did not reach the joined client')
  ws.close()
  process.exit(ok ? 0 : 2)
}, 1000)
