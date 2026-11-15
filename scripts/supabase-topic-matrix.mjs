// Probe v3: topic-prefix matrix — WS joins realtime:X, HTTP posts X and realtime:X.
const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const SERVICE = process.env.SB_SERVICE
const BASE = `probe${Date.now()}`
const WS_TOPIC = `realtime:${BASE}`

const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=1.0.0`)
let ref = 0
const seen = []
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ topic: WS_TOPIC, event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' } } }, ref: String(++ref) }))
})
ws.addEventListener('message', (e) => {
  let m
  try { m = JSON.parse(e.data) } catch { return }
  if (m.event === 'phx_reply' && m.payload?.status === 'ok' && m.topic === WS_TOPIC) console.log('JOIN OK')
  if (m.event === 'http-noprefix') seen.push('http-noprefix')
  if (m.event === 'http-prefix') seen.push('http-prefix')
  if (m.event === 'single-endpoint') seen.push('single-endpoint')
})

async function batch(key, topic, event) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic, event, payload: { ts: Date.now() } }] }),
  })
  console.log('batch', event, '->', res.status)
}
async function single(key, topic, event) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ts: Date.now() }),
  })
  console.log('single', event, '->', res.status)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

setTimeout(async () => {
  await sleep(1500)
  await batch(SERVICE, BASE, 'http-noprefix')
  await batch(SERVICE, WS_TOPIC, 'http-prefix')
  await single(SERVICE, BASE, 'single-endpoint')
  await sleep(5000)
  console.log('SEEN:', JSON.stringify(seen))
  ws.close()
  process.exit(0)
}, 6000)
