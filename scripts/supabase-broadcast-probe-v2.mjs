// Probe v4: raw WebSocket with the vsn=2.0.0 ARRAY protocol (zero deps).
// Validates the exact transport we will ship in the app.
const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const SERVICE = process.env.SB_SERVICE
const BASE = `probe${Date.now()}`
const TOPIC = `realtime:${BASE}`

let pass = 0, fail = 0
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${n} ${x}`) }

const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=2.0.0`)
let ref = 1
const seen = []
let joined = false

ws.addEventListener('open', () => {
  // phx_join in v2 array format
  ws.send(JSON.stringify([String(ref), String(ref), TOPIC, 'phx_join', {
    config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false },
  }]))
  const hb = setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify([null, String(ref++), 'phoenix', 'heartbeat', {}]))
  }, 8000)
  setTimeout(() => clearInterval(hb), 25000)
})
ws.addEventListener('message', (e) => {
  let f
  try { f = JSON.parse(e.data) } catch { return }
  if (!Array.isArray(f)) { console.log('non-array frame:', String(e.data).slice(0, 120)); return }
  const [, , topic, event, payload] = f
  if (topic === TOPIC && event === 'phx_reply' && payload?.status === 'ok') joined = true
  if (event === 'fanout-svc') seen.push('fanout-svc:' + JSON.stringify(payload).slice(0, 50))
  if (event === 'fanout-anon') seen.push('fanout-anon')
  if (event === 'client-frame') seen.push('client-frame')
})
ws.addEventListener('error', () => console.log('ws error'))

async function fanout(key, event) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: BASE, event, payload: { hello: event, ts: Date.now() } }] }),
  })
  return res.status
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

setTimeout(async () => {
  check('v2 join ok', joined)
  await sleep(1200)
  check('fanout service -> 202', (await fanout(SERVICE, 'fanout-svc')) === 202)
  check('fanout anon -> 202', (await fanout(ANON, 'fanout-anon')) === 202)
  ws.send(JSON.stringify([null, String(ref++), TOPIC, 'client-frame', { mine: true }]))
  await sleep(5000)
  check('delivery: service fanout', seen.some((s) => s.startsWith('fanout-svc')), JSON.stringify(seen))
  check('delivery: anon fanout', seen.includes('fanout-anon'))
  check('delivery: client frame', seen.includes('client-frame'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}, 6000)
