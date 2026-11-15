// Debug: print full join error payload and try topic/config variations.
const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=1.0.0`)
let ref = 0
const send = (o) => ws.send(JSON.stringify(o))

const variants = [
  { name: 'colon-topic', topic: `probe:${Date.now()}`, payload: { config: { broadcast: { self: false }, presence: { key: '' } } } },
  { name: 'realtime-prefix', topic: `realtime:probe${Date.now()}`, payload: { config: { broadcast: { self: false }, presence: { key: '' } } } },
  { name: 'empty-payload', topic: `probe2-${Date.now()}`, payload: {} },
  { name: 'broadcast-only', topic: `probe3-${Date.now()}`, payload: { config: { broadcast: { self: false } } } },
]

ws.addEventListener('open', () => {
  let i = 0
  for (const v of variants) send({ topic: v.topic, event: 'phx_join', payload: v.payload, ref: String(++i) })
  send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })
})
ws.addEventListener('message', (e) => {
  console.log('<<', String(e.data).slice(0, 300))
})
ws.addEventListener('error', (e) => console.log('WS error'))
setTimeout(() => { ws.close(); process.exit(0) }, 7000)
