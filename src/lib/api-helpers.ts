// Morse Messenger — API helpers: responses, session guard, socket bus bridge

import { NextResponse } from 'next/server'
import { getSessionUser, SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import type { ChatDisplayMode, MessageDTO, MessageKind, PlayMode, SendMode } from '@/lib/types'

export function ok<T>(data: T) {
  return NextResponse.json(data)
}

export function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ error: code, message: message ?? code }, { status })
}

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) return fail(401, 'UNAUTHENTICATED')
  return user
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse
}

/** Fire-and-forget broadcast through the realtime bus.
 *  Local sandbox: socket.io mini-service bridge (port 3004).
 *  Production A: the zero-dependency Cloudflare realtime worker
 *  (SOCKET_INTERNAL_URL + SOCKET_INTERNAL_SECRET).
 *  Production B: Supabase Realtime broadcast via its HTTP endpoint
 *  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — no extra infra needed.
 *  Both paths are fired independently; each client listens on one transport. */
export function emitToRoom(room: string, event: string, data: unknown) {
  const url = process.env.SOCKET_INTERNAL_URL || 'http://127.0.0.1:3004/internal/emit'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.SOCKET_INTERNAL_SECRET) headers['x-internal-secret'] = process.env.SOCKET_INTERNAL_SECRET
  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ room, event, data }),
  }).catch(() => {
    // realtime is best-effort; persistence is the source of truth
  })
  supabaseBroadcast(room, event, data)
}

const SB_MESSAGE_EVENTS = new Set(['message:new', 'message:update'])

/** Supabase Realtime HTTP broadcast (server-only, service key).
 *  Topic mapping: room `user:<id>` / `conv:<id>` (no prefix here — the
 *  realtime server exposes joined topics as `realtime:<topic>`).
 *  Payloads over ~2.4 KB are replaced by a `{conversationId, stub:true}`
 *  marker; clients refetch the conversation (broadcast payload limit). */
function supabaseBroadcast(room: string, event: string, data: unknown) {
  const sbUrl = process.env.SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!sbUrl || !sbKey) return
  let payload = data
  try {
    if (data && typeof data === 'object' && JSON.stringify(data).length > 2400 && SB_MESSAGE_EVENTS.has(event)) {
      payload = { conversationId: (data as { conversationId?: string }).conversationId, stub: true }
    }
  } catch {
    /* keep original payload */
  }
  fetch(`${sbUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: room, event, payload: payload ?? {} }] }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {
    // realtime is best-effort; persistence is the source of truth
  })
}

export function userRoom(userId: string) {
  return `user:${userId}`
}

// ---------- serialization ----------

type MessageWithIncludes = {
  id: string
  conversationId: string
  kind: string
  text: string
  morse: string | null
  encrypted: boolean
  sendMode: string | null
  playMode: string | null
  senderId: string
  sender: { id: string; displayName: string; avatarColor: string }
  replyToId: string | null
  replyTo?: { id: string; text: string; sender: { displayName: string } } | null
  createdAt: Date
  editedAt: Date | null
  receipts: { userId: string; deliveredAt: Date | null; readAt: Date | null; hidden: boolean }[]
}

export function messageToDTO(m: MessageWithIncludes, viewerId: string): MessageDTO {
  // 1:1: the single other receipt; groups: ticks reflect every other member's state
  const others = m.receipts.filter((r) => r.userId !== viewerId && !r.hidden)
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: m.kind as MessageKind,
    text: m.text,
    morse: m.morse,
    sendMode: m.sendMode as SendMode | null,
    playMode: m.playMode as PlayMode | null,
    encrypted: m.encrypted,
    senderId: m.senderId,
    senderName: m.sender.displayName,
    senderColor: m.sender.avatarColor,
    replyToId: m.replyToId,
    replyTo: m.replyTo
      ? { id: m.replyTo.id, text: m.replyTo.text, senderName: m.replyTo.sender.displayName }
      : null,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    delivered: m.senderId === viewerId ? others.length > 0 && others.every((r) => !!r.deliveredAt) : true,
    read: m.senderId === viewerId ? others.length > 0 && others.every((r) => !!r.readAt) : true,
  }
}

export const messageInclude = {
  sender: { select: { id: true, displayName: true, avatarColor: true } },
  replyTo: { select: { id: true, text: true, sender: { select: { displayName: true } } } },
  receipts: { select: { userId: true, deliveredAt: true, readAt: true, hidden: true } },
} as const

/** Per-user display mode for a conversation lives client-side in settings store;
 *  kept as a helper for future per-conversation persistence. */
export function parseDisplayMode(raw: unknown): ChatDisplayMode {
  return raw === 'morse' || raw === 'dual' ? raw : 'text'
}
