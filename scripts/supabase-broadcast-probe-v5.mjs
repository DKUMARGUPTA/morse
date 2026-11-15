// Probe v5: join payload byte-identical to supabase-js + log ALL frames.
const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const SERVICE = process.env.SB_SERVICE
const BASE = `probe${Date.now()}`
const TOPIC = `realtime:${BASE}`

const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=2.0.0`)
let ref = 1
const seen = []
ws.addEventListener('open', () => {
  ws.send(JSON.stringify([String(ref), String(ref), TOPIC, 'phx_join', {
    config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false },
  }]))
})
ws.addEventListener('message', (e) => {
  console.log('<<', String(e.data).slice(0, 160))
  let f
  try { f = JSON.parse(e.data) } catch { return }
  if (Array.isArray(f) && f[3] === 'fanout-svc') seen.push('svc')
  if (Array.isArray(f) && f[3] === 'client-frame') seen.push('client')
})

async function fanout(key, event) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: BASE, event, payload: { hello: event, ts: Date.now() } }] }),
  })
  console.log('fanout', event, '->', res.status)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

setTimeout(async () => {
  await sleep(2000)
  await fanout(SERVICE, 'fanout-svc')
  await sleep(2500)
  ws.send(JSON.stringify([null, String(ref++), TOPIC, 'client-frame', { mine: true }]))
  await sleep(3000)
  console.log('SEEN:', JSON.stringify(seen))
  ws.close()
  process.exit(0)
}, 4000)
