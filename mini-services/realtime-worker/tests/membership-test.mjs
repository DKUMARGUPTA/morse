// Morse Messenger — realtime membership-enforcement test (zero deps, bun).
// Production mode: the worker verifies membership via the app's internal API.
// Prereq:
//   • Next dev on :3000
//   • `wrangler dev --var MEMBER_API_URL:http://localhost:3000/api/internal/conv-members
//     --var MEMBER_API_SECRET:dev-internal-secret` on :8787
// Usage: bun mini-services/realtime-worker/tests/membership-test.mjs

const APP = process.env.APP_BASE ?? 'http://localhost:3000'
const WS = (process.env.WS_BASE ?? 'ws://127.0.0.1:8787').replace(/^http/, 'ws')
const INTERNAL_SECRET = 'dev-internal-secret'

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

async function api(method, path, { cookie, body, secret } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(secret ? { 'x-internal-secret': secret } : {}),
      'x-forwarded-for': `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`, // random per run: repeated runs must not trip register/login rate limits
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
    /* ok */
  }
  return { status: res.status, json, cookie: cookieValue }
}

function connect(token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}`)
    const state = { ws, opened: false, messages: [] }
    ws.addEventListener('open', () => {
      state.opened = true
      resolve(state)
    })
    ws.addEventListener('message', (e) => {
      try {
        state.messages.push(JSON.parse(e.data))
      } catch {
        /* ignore */
      }
    })
    ws.addEventListener('error', () => {})
    setTimeout(() => resolve(state), 5000)
  })
}

function waitFor(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const found = socket.messages.find(predicate)
    if (found) return resolve(found)
    const timer = setTimeout(() => {
      socket.ws.removeEventListener('message', onMsg)
      resolve(null)
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

async function main() {
  const ts = Date.now()
  const mk = (n) => `mb-${n}-${ts}@morse.test`
  const PASS = 'mb-pass-12345'

  const a = await api('POST', '/api/auth/register', { body: { email: mk('a'), password: PASS, displayName: 'MB A' } })
  const b = await api('POST', '/api/auth/register', { body: { email: mk('b'), password: PASS, displayName: 'MB B' } })
  const c = await api('POST', '/api/auth/register', { body: { email: mk('c'), password: PASS, displayName: 'MB C' } })
  const cookieA = a.cookie
  const cookieB = b.cookie
  const cookieC = c.cookie
  const meA = (await api('GET', '/api/auth/me', { cookie: cookieA })).json?.user
  const meB = (await api('GET', '/api/auth/me', { cookie: cookieB })).json?.user
  const meC = (await api('GET', '/api/auth/me', { cookie: cookieC })).json?.user

  // --- direct internal API checks ---
  const noSecret = await api('GET', `/api/internal/conv-members?conversationId=x&userId=${meB.id}`)
  check('membership API without secret -> 403', noSecret.status === 403, `got ${noSecret.status}`)

  const conv = await api('POST', '/api/conversations', { cookie: cookieA, body: { userId: meB.id } })
  const convId = conv.json?.conversationId
  check('conversation created', conv.status === 200 && !!convId)

  const isMember = await api('GET', `/api/internal/conv-members?conversationId=${convId}&userId=${meB.id}`, { secret: INTERNAL_SECRET })
  check('membership API: B is member', isMember.status === 200 && isMember.json?.member === true)
  const notMember = await api('GET', `/api/internal/conv-members?conversationId=${convId}&userId=${meC.id}`, { secret: INTERNAL_SECRET })
  check('membership API: C is NOT member', notMember.status === 200 && notMember.json?.member === false)

  // --- realtime enforcement ---
  const tokA = (await api('GET', '/api/socket/token', { cookie: cookieA })).json?.token
  const tokB = (await api('GET', '/api/socket/token', { cookie: cookieB })).json?.token
  const tokC = (await api('GET', '/api/socket/token', { cookie: cookieC })).json?.token

  const wsA = await connect(tokA)
  const wsB = await connect(tokB)
  const wsC = await connect(tokC)
  check('all three connected', wsA.opened && wsB.opened && wsC.opened)

  wsA.ws.send(JSON.stringify({ t: 'join', conversationId: convId }))
  wsB.ws.send(JSON.stringify({ t: 'join', conversationId: convId }))
  wsC.ws.send(JSON.stringify({ t: 'join', conversationId: convId })) // must be silently denied
  await new Promise((r) => setTimeout(r, 800))

  wsA.ws.send(JSON.stringify({ t: 'typing', conversationId: convId, displayName: 'MB A', isTyping: true }))
  const bTyping = await waitFor(wsB, (m) => m.t === 'typing' && m.conversationId === convId)
  check('member B receives member A typing', !!bTyping)
  const cTyping = await waitFor(wsC, (m) => m.t === 'typing' && m.conversationId === convId, 1200)
  check('non-member C does NOT receive room traffic', !cTyping)

  wsC.ws.send(JSON.stringify({ t: 'typing', conversationId: convId, displayName: 'MB C', isTyping: true }))
  await new Promise((r) => setTimeout(r, 800))
  check('non-member C cannot inject typing into room', !wsA.messages.some((m) => m.t === 'typing' && m.userId === meC.id) && !wsB.messages.some((m) => m.t === 'typing' && m.userId === meC.id))

  // cleanup
  await api('DELETE', '/api/account/delete', { cookie: cookieA, body: { confirm: 'MB A' } })
  await api('DELETE', '/api/account/delete', { cookie: cookieB, body: { confirm: 'MB B' } })
  await api('DELETE', '/api/account/delete', { cookie: cookieC, body: { confirm: 'MB C' } })
  wsA.ws.close()
  wsB.ws.close()
  wsC.ws.close()

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
