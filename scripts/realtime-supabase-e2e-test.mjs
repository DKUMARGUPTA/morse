// Morse Messenger — Supabase-transport E2E test (zero deps, run with bun).
// Production path B, end to end:
//   Next.js API (Supabase DB) --HTTP broadcast--> Supabase Realtime --WS--> other user
// Prereq: Next dev on :3000 with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set.
// Usage: bun scripts/realtime-supabase-e2e-test.mjs

const APP = process.env.APP_BASE ?? 'http://localhost:3000'
const REF = process.env.SB_REF ?? 'fanfljtvnrmcowjjfkke'
const ANON = process.env.SB_ANON
if (!ANON) {
  console.error('FATAL: SB_ANON not set')
  process.exit(1)
}

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) {
    pass++
    console.log(`PASS: ${name}`)
  } else {
    fail++
    console.log(`FAIL: ${name} ${extra}`)
  }
}

async function api(method, path, { cookie, body } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      'x-forwarded-for': '10.78.7.8',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  const cookieValue = setCookie ? setCookie.split(';')[0] : undefined
  let json = null
  try {
    json = await res.json()
  } catch {
    /* empty body ok */
  }
  return { status: res.status, json, cookie: cookieValue }
}

// raw Phoenix v2 WS client (same protocol as src/lib/supabase-realtime.ts)
function connect(meId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(ANON)}&vsn=2.0.0`)
    const state = { ws, opened: false, joined: false, messages: [], ref: 1, joinRefs: new Map() }
    const userTopic = `realtime:user:${meId}`
    ws.addEventListener('open', () => {
      state.opened = true
      const r = String(state.ref++)
      state.joinRefs.set(userTopic, r)
      ws.send(JSON.stringify([r, r, userTopic, 'phx_join', {
        config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false },
      }]))
      const hb = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify([null, String(state.ref++), 'phoenix', 'heartbeat', {}]))
      }, 25000)
      setTimeout(() => clearInterval(hb), 120000)
    })
    ws.addEventListener('message', (e) => {
      let f
      try { f = JSON.parse(e.data) } catch { return }
      if (!Array.isArray(f)) return
      const [, , topic, event, payload] = f
      if (event === 'phx_reply' && payload?.status === 'ok' && topic === userTopic) state.joined = true
      if (event === 'broadcast') state.messages.push({ event: payload?.event, payload: payload?.payload })
    })
    ws.addEventListener('error', () => {})
    setTimeout(() => resolve(state), 5000)
  })
}

function joinConv(state, convId) {
  const topic = `realtime:conv:${convId}`
  const r = String(state.ref++)
  state.joinRefs.set(topic, r)
  state.ws.send(JSON.stringify([r, r, topic, 'phx_join', {
    config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false },
  }]))
}

function waitFor(state, predicate, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const found = state.messages.find(predicate)
    if (found) return resolve(found)
    const timer = setTimeout(() => resolve(null), timeoutMs)
    const onMsg = (e) => {
      let f
      try { f = JSON.parse(e.data) } catch { return }
      if (!Array.isArray(f) || f[3] !== 'broadcast') return
      const m = { event: f[4]?.event, payload: f[4]?.payload }
      state.messages.push(m)
      if (predicate(m)) {
        clearTimeout(timer)
        state.ws.removeEventListener('message', onMsg)
        resolve(m)
      }
    }
    state.ws.addEventListener('message', onMsg)
  })
}

async function main() {
  const ts = Date.now()
  const PASS = 'sb-pass-12345'

  const regA = await api('POST', '/api/auth/register', { body: { email: `sb-a-${ts}@morse.test`, password: PASS, displayName: 'SB User A' } })
  const regB = await api('POST', '/api/auth/register', { body: { email: `sb-b-${ts}@morse.test`, password: PASS, displayName: 'SB User B' } })
  check('register A + B', regA.status === 200 && regB.status === 200)

  const meA = (await api('GET', '/api/auth/me', { cookie: regA.cookie })).json?.user
  const meB = (await api('GET', '/api/auth/me', { cookie: regB.cookie })).json?.user
  check('sessions work', !!meA?.id && !!meB?.id)

  const wsA = await connect(meA.id)
  const wsB = await connect(meB.id)
  check('A connected to Supabase realtime', wsA.opened && wsA.joined)
  check('B connected to Supabase realtime', wsB.opened && wsB.joined)
  if (!(wsA.opened && wsA.joined && wsB.opened && wsB.joined)) throw new Error('ws connect failed')

  const conv = await api('POST', '/api/conversations', { cookie: regA.cookie, body: { userId: meB.id } })
  check('conversation created', conv.status === 200)
  const convId = conv.json?.conversationId

  joinConv(wsA, convId)
  joinConv(wsB, convId)
  await new Promise((r) => setTimeout(r, 1200))

  // A sends a real message through the real API -> B receives LIVE via Supabase
  const send = await api('POST', `/api/conversations/${convId}/messages`, {
    cookie: regA.cookie,
    body: { text: 'SB transport live test', sendMode: 'dual' },
  })
  check('message sent', send.status === 200)
  const bMsg = await waitFor(wsB, (m) => m.event === 'message:new' && m.payload?.conversationId === convId && m.payload?.message?.text === 'SB transport live test')
  check('B receives message:new LIVE', !!bMsg)
  const aMsg = await waitFor(wsA, (m) => m.event === 'message:new' && m.payload?.message?.id === send.json?.message?.id)
  check('A receives own-device copy', !!aMsg)

  // typing: client-frame broadcast on the conv topic (A -> B) — join_ref + wrapped event
  wsA.ws.send(JSON.stringify([wsA.joinRefs.get(`realtime:conv:${convId}`), String(wsA.ref++), `realtime:conv:${convId}`, 'broadcast', { type: 'broadcast', event: 'typing', payload: { conversationId: convId, userId: meA.id, displayName: 'SB User A', isTyping: true } }]))
  const bTyping = await waitFor(wsB, (m) => m.event === 'typing' && m.payload?.conversationId === convId && m.payload?.isTyping === true)
  check('B receives typing LIVE', !!bTyping)

  // B marks read -> A gets receipt:update live
  const read = await api('POST', `/api/conversations/${convId}/read`, { cookie: regB.cookie })
  check('B mark read', read.status === 200)
  const aReceipt = await waitFor(wsA, (m) => m.event === 'receipt:update' && m.payload?.conversationId === convId)
  check('A receives receipt:update LIVE', !!aReceipt)

  // cleanup
  const delA = await api('DELETE', '/api/account/delete', { cookie: regA.cookie, body: { confirm: 'SB User A' } })
  const delB = await api('DELETE', '/api/account/delete', { cookie: regB.cookie, body: { confirm: 'SB User B' } })
  check('cleanup A + B', delA.status === 200 && delB.status === 200)
  wsA.ws.close()
  wsB.ws.close()

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
