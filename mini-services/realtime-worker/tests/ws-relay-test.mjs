// Morse Messenger — realtime worker test suite (zero dependencies, run with bun).
// Prereq: `wrangler dev` running (default ws://127.0.0.1:8787).
// Usage: bun tests/ws-relay-test.mjs
//
// Verifies the exact socket.io parity contract used by the app:
//   user-room events  -> message:new/update/hidden, receipt:update, conv:new/update
//   conv-room events  -> typing (sender excluded)
//   presence          -> broadcast to everyone on first/last connect per user
//   auth              -> bad/expired tokens rejected before upgrade

import { createHmac } from 'node:crypto'

const BASE = (process.env.WS_BASE ?? 'ws://127.0.0.1:8787').replace(/^ws/, 'http')
const WS_URL = BASE.replace(/^http/, 'ws')
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'morse-messenger-dev-secret-do-not-use-in-prod'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'dev-internal-secret'

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

// ---------- token signing (mirrors src/lib/auth.ts HS256 scheme) ----------

function b64url(s) {
  return Buffer.from(s).toString('base64url')
}
function signToken({ sub, exp, kind = 'sock', tv = 1 }) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ sub, tv, kind, exp }))
  const sig = createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
const nowSec = () => Math.floor(Date.now() / 1000)

// ---------- tiny WS test client ----------

function connect(token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`)
    const state = { ws, opened: false, closed: false, messages: [] }
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
    ws.addEventListener('close', () => {
      state.closed = true
      done()
    })
    ws.addEventListener('error', () => {
      /* close event follows */
    })
    setTimeout(done, 4000) // safety: resolve even if the server hangs
  })
}

function waitFor(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const found = socket.messages.find(predicate)
    if (found) return resolve(found)
    const timer = setTimeout(() => {
      socket.ws.removeEventListener('message', onMsg)
      reject(new Error(`timeout waiting for ${predicate}`))
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

async function emitInternal(room, event, data) {
  return fetch(`${BASE}/internal/emit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({ room, event, data }),
  })
}

async function closeWS(socket) {
  await new Promise((resolve) => {
    if (socket.closed) return resolve()
    socket.ws.addEventListener('close', resolve, { once: true })
    try {
      socket.ws.close()
    } catch {
      resolve()
    }
    setTimeout(resolve, 2000)
  })
}

// ---------- tests ----------

async function main() {
  const health = await fetch(`${BASE}/health`)
  check('health endpoint', health.status === 200, `got ${health.status}`)

  // --- auth ---
  const bad = await connect('garbage.token.here')
  check('bad token rejected before upgrade', !bad.opened)

  const expired = await connect(signToken({ sub: 'user-x', exp: nowSec() - 10 }))
  check('expired token rejected', !expired.opened)

  const wrongKind = await connect(signToken({ sub: 'user-x', exp: nowSec() + 3600, kind: 'session' }))
  check('non-sock token rejected', !wrongKind.opened)

  // --- two users online ---
  const A = await connect(signToken({ sub: 'user-a', exp: nowSec() + 3600 }))
  const B = await connect(signToken({ sub: 'user-b', exp: nowSec() + 3600 }))
  check('A connects', A.opened)
  check('B connects', B.opened)

  // presence: A sees B come online; B receives a snapshot including A
  // (improvement over socket.io: fresh sockets get an online-user snapshot)
  const bSnapshot = await waitFor(B, (m) => m.t === 'presence:sync' && Array.isArray(m.online) && m.online.includes('user-a')).catch(() => null)
  check('presence snapshot: B sees A online on connect', !!bSnapshot)
  const aSeesB = await waitFor(A, (m) => m.t === 'presence' && m.userId === 'user-b' && m.online === true).catch(() => null)
  check('presence broadcast: A sees B online', !!aSeesB)

  // --- user-room event fanout (message:new parity) ---
  const dto = { id: 'm1', text: 'ciphertext-1' }
  await emitInternal('user:user-b', 'message:new', { conversationId: 'conv1', message: dto })
  const bGotMsg = await waitFor(B, (m) => m.t === 'message:new' && m.message?.id === 'm1').catch(() => null)
  check('user-room: B receives message:new', !!bGotMsg)

  await emitInternal('user:user-a', 'message:new', { conversationId: 'conv1', message: dto })
  const aGotMsg = await waitFor(A, (m) => m.t === 'message:new' && m.message?.id === 'm1').catch(() => null)
  check('user-room: A receives own-device copy', !!aGotMsg)

  // isolation: emit to user-c must not reach A or B
  await emitInternal('user:user-c', 'message:new', { conversationId: 'conv1', message: { id: 'm2' } })
  await new Promise((r) => setTimeout(r, 600))
  check('isolation: C-room event not leaked to A/B', !A.messages.some((m) => m.message?.id === 'm2') && !B.messages.some((m) => m.message?.id === 'm2'))

  // --- conv room + typing ---
  A.ws.send(JSON.stringify({ t: 'join', conversationId: 'conv1' }))
  B.ws.send(JSON.stringify({ t: 'join', conversationId: 'conv1' }))
  await new Promise((r) => setTimeout(r, 300)) // allow join processing
  A.ws.send(JSON.stringify({ t: 'typing', conversationId: 'conv1', displayName: 'Alice', isTyping: true }))
  const bTyping = await waitFor(B, (m) => m.t === 'typing' && m.conversationId === 'conv1' && m.isTyping === true).catch(() => null)
  check('typing: B receives A typing', !!bTyping)
  check('typing: sender excluded', !A.messages.some((m) => m.t === 'typing'))
  B.ws.send(JSON.stringify({ t: 'typing', conversationId: 'conv9', displayName: 'Bob', isTyping: true }))
  await new Promise((r) => setTimeout(r, 500))
  check('typing: non-joined room ignored', !A.messages.some((m) => m.t === 'typing' && m.conversationId === 'conv9'))

  // --- membership enforcement (MEMBER_API_URL unset => dev mode allow) is the
  //     default here; production enforcement is covered by the deploy config ---

  // --- internal emit auth ---
  const noSecret = await fetch(`${BASE}/internal/emit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room: 'user:user-b', event: 'message:new', data: {} }),
  })
  check('internal emit without secret -> 403', noSecret.status === 403)
  const wrongSecret = await fetch(`${BASE}/internal/emit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': 'nope' },
    body: JSON.stringify({ room: 'user:user-b', event: 'message:new', data: {} }),
  })
  check('internal emit wrong secret -> 403', wrongSecret.status === 403)

  // --- presence offline on last disconnect ---
  const otherA = await connect(signToken({ sub: 'user-a', exp: nowSec() + 3600 }))
  await closeWS(A)
  await closeWS(otherA)
  const bSeesOffline = await waitFor(B, (m) => m.t === 'presence' && m.userId === 'user-a' && m.online === false, 6000).catch(() => null)
  check('presence offline broadcast after last A socket closes', !!bSeesOffline)

  // --- malformed frames are ignored (connection stays usable) ---
  const C = await connect(signToken({ sub: 'user-c', exp: nowSec() + 3600 }))
  C.ws.send('not-json')
  C.ws.send(JSON.stringify({ t: 'join', conversationId: { evil: true } }))
  C.ws.send('x'.repeat(5000))
  await new Promise((r) => setTimeout(r, 400))
  C.ws.send(JSON.stringify({ t: 'join', conversationId: 'convok' }))
  B.ws.send(JSON.stringify({ t: 'join', conversationId: 'convok' }))
  await new Promise((r) => setTimeout(r, 400))
  C.ws.send(JSON.stringify({ t: 'typing', conversationId: 'convok', displayName: 'C', isTyping: true }))
  const bGotTyping = await waitFor(B, (m) => m.t === 'typing' && m.conversationId === 'convok').catch(() => null)
  check('connection survives malformed frames', !!bGotTyping)

  await closeWS(B)
  await closeWS(C)

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
