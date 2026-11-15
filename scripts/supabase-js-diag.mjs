// Diagnostic: official supabase-js client receiving HTTP-fanout broadcasts.
import { createClient } from '@supabase/supabase-js'

const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const SERVICE = process.env.SB_SERVICE
const BASE = `probe${Date.now()}`

const sb = createClient(`https://${REF}.supabase.co`, ANON, {
  realtime: { params: { eventsPerSecond: 20 } },
})
const seen = []
const ch = sb.channel(BASE)
ch.on('broadcast', { event: 'js-noprefix' }, (m) => seen.push(`js-noprefix:${JSON.stringify(m.payload).slice(0, 40)}`))
ch.on('broadcast', { event: 'js-prefix' }, (m) => seen.push(`js-prefix:${JSON.stringify(m.payload).slice(0, 40)}`))
ch.on('broadcast', { event: 'js-clientframe' }, (m) => seen.push(`js-clientframe`))
ch.subscribe((status) => console.log('channel status:', status))

async function batch(key, topic, event) {
  const res = await fetch(`https://${REF}.supabase.co/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic, event, payload: { ts: Date.now() } }] }),
  })
  console.log('batch', event, topic, '->', res.status)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

setTimeout(async () => {
  await batch(SERVICE, BASE, 'js-noprefix')
  await batch(SERVICE, `realtime:${BASE}`, 'js-prefix')
  await ch.send({ type: 'broadcast', event: 'js-clientframe', payload: { self: 'no' } })
  await sleep(6000)
  console.log('SEEN:', JSON.stringify(seen))
  await sb.removeChannel(ch)
  process.exit(0)
}, 8000)
