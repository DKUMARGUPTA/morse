// Morse Messenger realtime worker — hand-written ambient types for the small
// Cloudflare Workers surface we use. Deliberately dependency-free: no
// @cloudflare/workers-types, no npm packages. Standard globals (crypto.subtle,
// Request/Response/WebSocket/fetch/atob) come from the WebWorker lib.

interface WebSocketPair {
  0: WebSocket
  1: WebSocket
}

declare const WebSocketPair: {
  new (): WebSocketPair
}

// CF extension: a 101 response can carry the server-side WebSocket
interface ResponseInit {
  webSocket?: WebSocket
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void
  getWebSockets(tag?: string): WebSocket[]
}

interface DurableObjectStub {
  fetch(req: Request): Promise<Response>
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectId {
  toString(): string
}

// Attachment API is available on accepted WebSockets inside a Durable Object.
interface WebSocket {
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

type WebSocketMessageEvent = string | ArrayBuffer | Uint8Array
