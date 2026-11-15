// Morse Messenger — realtime handshake security test
// Verifies the chat-service rejects unauthenticated sockets and accepts token-authenticated ones.
// Usage: bun scripts/socket-auth-test.mjs [BASE_URL]
import { io } from 'socket.io-client'

const BASE = process.argv[2] || 'http://localhost:3000'
const SOCKET_URL = process.argv[3] || 'http://localhost:3003'
const TS = Date.now()
const email = `qa-sock-${TS}@morse.test`
const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

// register a disposable QA user (random client IP keeps repeat runs clear of rate limits)
const XF = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': XF },
  body: JSON.stringify({ email, password: 'qa-pass-12345', displayName: 'QA Socket' }),
})
if (!reg.ok) {
  console.error('FATAL: could not register QA user:', reg.status, await reg.text())
  process.exit(1)
}
const cookie = reg.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ')

const tokRes = await fetch(`${BASE}/api/socket/token`, { headers: { cookie } })
const { token } = await tokRes.json()
if (!token) {
  console.error('FATAL: /api/socket/token returned no token')
  process.exit(1)
}
record('GET /api/socket/token (with session)', true, `200, ${token.length} chars`)

const tryConnect = (auth, name, shouldConnect) =>
  new Promise((resolve) => {
    const s = io(SOCKET_URL, { path: '/', auth, reconnection: false, transports: ['polling'], timeout: 5000 })
    const done = setTimeout(() => {
      record(name, false, 'timeout (no connect or error within 5s)')
      s.disconnect()
      resolve()
    }, 6000)
    s.on('connect', () => {
      clearTimeout(done)
      record(name, shouldConnect, shouldConnect ? 'connected with valid token' : 'SECURITY HOLE: connected without a valid token')
      s.disconnect()
      resolve()
    })
    s.on('connect_error', (err) => {
      clearTimeout(done)
      record(name, !shouldConnect, `rejected: ${err.message}`)
      s.disconnect()
      resolve()
    })
  })

// 1. no token → must be rejected
await tryConnect({}, 'socket without token is rejected', false)
// 2. garbage token → must be rejected
await tryConnect({ token: 'garbage.a.b' }, 'socket with garbage token is rejected', false)
// 3. valid token → must connect
await tryConnect({ token }, 'socket with valid token connects', true)

// cleanup
await fetch(`${BASE}/api/account/delete`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ confirm: 'QA Socket' }),
})

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
}
console.log(`\nRESULT: ${results.length - failed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
