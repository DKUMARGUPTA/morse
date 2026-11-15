// Morse Messenger — realtime bus (socket.io mini-service, port 3003)
// Pure in-memory transport: rooms per user, presence, typing, plus an internal
// HTTP endpoint so Next.js API routes can broadcast persisted events.

import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// presence: userId -> number of connected sockets
const presence = new Map<string, number>()

function setPresence(userId: string, delta: number) {
  const next = Math.max(0, (presence.get(userId) ?? 0) + delta)
  if (next === 0) presence.delete(userId)
  else presence.set(userId, next)
  io.emit('presence', { userId, online: next > 0 })
}

io.on('connection', (socket) => {
  const userId = String(socket.handshake.auth?.userId ?? '')
  if (userId) {
    socket.join(`user:${userId}`)
    setPresence(userId, +1)
  }

  socket.on('join', (conversationId: string) => {
    if (typeof conversationId === 'string' && conversationId.length < 64) {
      socket.join(`conv:${conversationId}`)
    }
  })

  socket.on('leave', (conversationId: string) => {
    if (typeof conversationId === 'string') {
      socket.leave(`conv:${conversationId}`)
    }
  })

  socket.on('typing', (data: { conversationId: string; displayName: string; isTyping: boolean }) => {
    if (!userId || !data?.conversationId) return
    socket.to(`conv:${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      userId,
      displayName: data.displayName,
      isTyping: !!data.isTyping,
    })
  })

  socket.on('disconnect', () => {
    if (userId) setPresence(userId, -1)
  })
})

// internal bridge for Next.js API routes (server-to-server, not exposed via gateway)
// NOTE: engine.io takes over every request on port 3003 (path '/'), so the
// internal HTTP bridge listens on its own port 3004.
const internalServer = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/internal/emit') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        if (res.headersSent) return
        const { room, event, data } = JSON.parse(body)
        if (typeof room === 'string' && typeof event === 'string') {
          io.to(room).emit(event, data)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(400)
          res.end('bad request')
        }
      } catch {
        res.writeHead(400)
        res.end('bad request')
      }
    })
    return
  }
  res.writeHead(404)
  res.end()
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`Morse Messenger realtime service running on port ${PORT}`)
})
internalServer.listen(3004, () => {
  console.log(`Internal emit bridge running on port 3004`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
