// Probe v2: full round-trip with `realtime:` topic prefix.
// (1) WS join (anon key)  (2) HTTP fanout service+anon  (3) client frame broadcast
import { createHmac } from 'node:crypto'

const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const SERVICE = process.env.SB_SERVICE
const BASE = `probe${Date.now()}`
const TOPIC = `realtime:${BASE}`

let pass = 0, fail = 0
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${n} ${x}`) }

const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=1.0.0`)
let ref = 0
const send = (obj) => ws.send(JSON.stringify(obj))
let gotSvc = null, gotAnon = null, gotClient = null
let joinOk = false

ws.addEventListener('open', () => {
  send({ topic: TOPIC, event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' } } }, ref: String(++ref) })
  const hb = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), 8000)
  setTimeout(() => clearInterval(hb), 30000)
})

ws.addEventListener('message', async (e) => {
  let m
  try { m = JSON.parse(e.data) } catch { return }
  if (m.topic === TOPIC && m.event === 'phx_reply' && m.payload?.status === 'ok') joinOk = true
  if (m.event === 'probe-svc') gotSvc = m.payload
  if (m.event === 'probe-anon') gotAnon = m.payload
  if (m.event === 'probe-client') gotClient = m.payload
})
ws.addEventListener('error', () => {})
ws.addEventListener('close', (e) => console.log('WS close', e.code))

async function httpBroadcast(key, event, topic) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic, event, payload: { from: event, ts: Date.now() } }] }),
  })
  return res.status
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

setTimeout(async () => {
  check('WS join ok with realtime: prefix', joinOk)
  await sleep(1000)

  const s1 = await httpBroadcast(SERVICE, 'probe-svc', TOPIC)
  check('HTTP fanout (service key, realtime: topic) -> 202', s1 === 202, `got ${s1}`)
  const s2 = await httpBroadcast(ANON, 'probe-anon', TOPIC)
  check('HTTP fanout (anon key, realtime: topic) -> 202', s2 === 202, `got ${s2}`)

  send({ topic: TOPIC, event: 'probe-client', payload: { from: 'client' }, ref: String(++ref) })

  await sleep(5000)
  check('delivery: service-key fanout received', !!gotSvc, JSON.stringify(gotSvc ?? {}).slice(0, 60))
  check('delivery: anon-key fanout received', !!gotAnon, JSON.stringify(gotAnon ?? {}).slice(0, 60))
  check('delivery: client-frame broadcast received', !!gotClient, JSON.stringify(gotClient ?? {}).slice(0, 60))

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}, 6000)
