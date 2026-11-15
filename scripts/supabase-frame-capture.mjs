// Capture exactly which frames supabase-js sends so the raw-WS transport can
// replicate them (or fall back to the SDK if the protocol is non-trivial).
globalThis.__frames = []
class LoggedWS extends WebSocket {
  constructor(...a) {
    super(...a)
    globalThis.__frames.push(['URL', String(a[0])])
  }
  send(d) {
    globalThis.__frames.push(['>>', String(d).slice(0, 250)])
    super.send(d)
  }
}
globalThis.WebSocket = LoggedWS

const { createClient } = await import('@supabase/supabase-js')
const REF = 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
const BASE = `probe${Date.now()}`

const sb = createClient(`https://${REF}.supabase.co`, ANON)
const ch = sb.channel(BASE)
ch.on('broadcast', { event: 'x' }, () => {})
ch.subscribe((s) => console.log('status:', s))

setTimeout(async () => {
  console.log(JSON.stringify(globalThis.__frames, null, 1))
  await sb.removeChannel(ch)
  process.exit(0)
}, 6000)
