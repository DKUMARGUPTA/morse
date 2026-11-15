// Morse Messenger — full-stack realtime E2E test (zero dependencies, run with bun).
// Production path, end to end:
//   Next.js API (Supabase)  --internal emit-->  CF realtime worker  --WebSocket-->  other user
// Prereq:
//   • Next dev on :3000 with SOCKET_INTERNAL_URL=http://127.0.0.1:8787/internal/emit
//     and SOCKET_INTERNAL_SECRET=dev-internal-secret
//   • `wrangler dev` on :8787
// Usage: bun scripts/realtime-e2e-test.mjs

const APP = process.env.APP_BASE ?? 'http://localhost:3000'
const WS = (process.env.WS_BASE ?? 'ws://127.0.0.1:8787').replace(/^http/, 'ws')

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

// ---------- HTTP helpers ----------

async function api(method, path, { cookie, body } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      'x-forwarded-for': '10.77.7.7', // clear of rate limits for QA IPs
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  let cookieValue
  if (setCookie) {
    const pair = setCookie.split(';')[0]
    if (pair.includes('=')) cookieValue = pair
  }
  let json = null
  try {
    json = await res.json()
  } catch {
    /* empty body ok */
  }
  return { status: res.status, json, cookie: cookieValue }
}

// ---------- WS helpers (same client logic as src/lib/realtime-ws.ts) ----------

function connect(token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}`)
    const state = { ws, opened: false, messages: [] }
    const done = () => resolve(state)
    ws.addEventListener('open', () => {
      state.opened = true
      done()
    })
    ws.addEventListener('message', (e) => {
      try {
        state.messages.push(JSON.parse(e.data))
      } catch {
        /* ignore */
      }
    })
    ws.addEventListener('error', () => {})
    setTimeout(done, 5000)
  })
}

function waitFor(socket, predicate, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const found = socket.messages.find(predicate)
    if (found) return resolve(found)
    const timer = setTimeout(() => {
      socket.ws.removeEventListener('message', onMsg)
      reject(new Error(`timeout waiting for event`))
    }, timeoutMs)
    const onMsg = (e) => {
      let m
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      socket.messages.push(m)
      if (predicate(m)) {
        clearTimeout(timer)
        socket.ws.removeEventListener('message', onMsg)
        resolve(m)
      }
    }
    socket.ws.addEventListener('message', onMsg)
  })
}

// ---------- test flow ----------

async function main() {
  const ts = Date.now()
  const A_EMAIL = `rt-a-${ts}@morse.test`
  const B_EMAIL = `rt-b-${ts}@morse.test`
  const PASS = 'rt-pass-12345'

  // real accounts through the real API
  const regA = await api('POST', '/api/auth/register', { body: { email: A_EMAIL, password: PASS, displayName: 'RT User A' } })
  check('register A', regA.status === 200)
  const regB = await api('POST', '/api/auth/register', { body: { email: B_EMAIL, password: PASS, displayName: 'RT User B' } })
  check('register B', regB.status === 200)
  const cookieA = regA.cookie
  const cookieB = regB.cookie
  if (!cookieA || !cookieB) throw new Error('no session cookies — cannot continue')

  const meA = (await api('GET', '/api/auth/me', { cookie: cookieA })).json?.user
  const meB = (await api('GET', '/api/auth/me', { cookie: cookieB })).json?.user
  check('session works for A and B', !!meA?.id && !!meB?.id)

  // real socket tokens through the real API
  const tokA = (await api('GET', '/api/socket/token', { cookie: cookieA })).json?.token
  const tokB = (await api('GET', '/api/socket/token', { cookie: cookieB })).json?.token
  check('socket tokens issued', !!tokA && !!tokB)

  // connect both to the CF realtime worker
  const wsA = await connect(tokA)
  const wsB = await connect(tokB)
  check('A connected to realtime worker', wsA.opened)
  check('B connected to realtime worker', wsB.opened)
  if (!wsA.opened || !wsB.opened) throw new Error('websocket connect failed — is wrangler dev running?')

  // B (late) receives presence snapshot including A
  const snapB = await waitFor(wsB, (m) => m.t === 'presence:sync' && (m.online ?? []).includes(meA.id)).catch(() => null)
  check('B presence snapshot includes A', !!snapB)
  const aSeesB = await waitFor(wsA, (m) => m.t === 'presence' && m.userId === meB.id && m.online === true).catch(() => null)
  check('A sees B online', !!aSeesB)

  // create 1:1 conversation
  const conv = await api('POST', '/api/conversations', { cookie: cookieA, body: { userId: meB.id } })
  check('conversation created', conv.status === 200, JSON.stringify(conv.json))
  const convId = conv.json?.conversationId
  if (!convId) throw new Error('no conversation id')

  // both users get conv:new through the worker
  const aConvNew = await waitFor(wsA, (m) => m.t === 'conv:new' && m.conversationId === convId).catch(() => null)
  const bConvNew = await waitFor(wsB, (m) => m.t === 'conv:new' && m.conversationId === convId).catch(() => null)
  check('A receives conv:new', !!aConvNew)
  check('B receives conv:new', !!bConvNew)

  // A sends a real message through the real API
  const send = await api('POST', `/api/conversations/${convId}/messages`, {
    cookie: cookieA,
    body: { text: 'SOS e2e realtime', sendMode: 'dual' },
  })
  check('message sent', send.status === 200, JSON.stringify(send.json))

  // B receives message:new in real time (the core production promise)
  const bMsg = await waitFor(wsB, (m) => m.t === 'message:new' && m.conversationId === convId && m.message?.text === 'SOS e2e realtime').catch(() => null)
  check('B receives message:new LIVE', !!bMsg)

  // A receives own-device copy
  const aMsg = await waitFor(wsA, (m) => m.t === 'message:new' && m.message?.text === 'SOS e2e realtime').catch(() => null)
  check('A receives own-device copy', !!aMsg)

  // B marks read -> A gets receipt:update live
  const read = await api('POST', `/api/conversations/${convId}/read`, { cookie: cookieB })
  check('B mark read', read.status === 200)
  const aReceipt = await waitFor(wsA, (m) => m.t === 'receipt:update' && m.conversationId === convId && m.read === true).catch(() => null)
  check('A receives receipt:update live', !!aReceipt)

  // typing through the conv room
  wsA.ws.send(JSON.stringify({ t: 'join', conversationId: convId }))
  wsB.ws.send(JSON.stringify({ t: 'join', conversationId: convId }))
  await new Promise((r) => setTimeout(r, 400))
  wsA.ws.send(JSON.stringify({ t: 'typing', conversationId: convId, displayName: meA.displayName, isTyping: true }))
  const bTyping = await waitFor(wsB, (m) => m.t === 'typing' && m.conversationId === convId && m.isTyping === true).catch(() => null)
  check('B receives typing live', !!bTyping)

  // cleanup QA accounts
  const delA = await api('DELETE', '/api/account/delete', { cookie: cookieA, body: { confirm: 'RT User A' } })
  const delB = await api('DELETE', '/api/account/delete', { cookie: cookieB, body: { confirm: 'RT User B' } })
  check('cleanup A', delA.status === 200)
  check('cleanup B', delB.status === 200)
  wsA.ws.close()
  wsB.ws.close()

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
