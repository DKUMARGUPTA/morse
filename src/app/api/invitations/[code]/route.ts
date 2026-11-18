import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, fail, isResponse, ok, requireUser, userRoom } from '@/lib/api-helpers'

/** GET /api/invitations/[code] — public preview (minimal profile info only) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const invitation = await db.invitation.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      creator: { select: { id: true, displayName: true, avatarColor: true } },
    },
  })
  if (!invitation) return fail(404, 'NOT_FOUND')
  const expired = invitation.expiresAt.getTime() < Date.now() || invitation.status !== 'pending'
  return ok({
    invitation: {
      code: invitation.code,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      creator: invitation.creator,
      expired,
    },
  })
}

/** POST /api/invitations/[code] — accept | decline | revoke */
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { code } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const invitation = await db.invitation.findUnique({ where: { code: code.toUpperCase() } })
  if (!invitation) return fail(404, 'NOT_FOUND')

  if (action === 'revoke') {
    if (invitation.createdById !== me.id) return fail(403, 'FORBIDDEN')
    await db.invitation.update({ where: { id: invitation.id }, data: { status: 'revoked' } })
    return ok({ success: true })
  }

  if (action === 'decline') {
    if (invitation.status !== 'pending' || invitation.expiresAt.getTime() < Date.now()) {
      return fail(410, 'EXPIRED', 'This invitation has expired or was revoked.')
    }
    await db.invitation.update({ where: { id: invitation.id }, data: { status: 'declined' } })
    return ok({ success: true })
  }

  if (action === 'accept') {
    if (invitation.status !== 'pending' || invitation.expiresAt.getTime() < Date.now()) {
      return fail(410, 'EXPIRED', 'This invitation has expired or was revoked.')
    }
    if (invitation.createdById === me.id) return fail(400, 'OWN_INVITE', 'You cannot accept your own invitation.')

    const block = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: me.id, blockedId: invitation.createdById },
          { blockerId: invitation.createdById, blockedId: me.id },
        ],
      },
    })
    if (block) return fail(403, 'BLOCKED', 'Blocked users cannot start new conversations.')

    const creator = await db.user.findUnique({ where: { id: invitation.createdById } })
    if (!creator) return fail(404, 'NOT_FOUND')

    // Single-use gate: atomically claim the invitation while it is still
    // pending. Two concurrent accepts race on this conditional update —
    // exactly one wins, the loser gets ALREADY_USED (was a duplicate-chat race).
    const claim = await db.invitation.updateMany({
      where: { id: invitation.id, status: 'pending' },
      data: { status: 'accepted', acceptedById: me.id },
    })
    if (claim.count === 0) return fail(409, 'ALREADY_USED', 'This invitation was already used.')

    try {
      const conv = await db.conversation.create({
        data: {
          members: { create: [{ userId: me.id }, { userId: creator.id }] },
          messages: {
            create: {
              senderId: me.id,
              kind: 'system',
              text: 'CHAT_STARTED_VIA_INVITATION',
            },
          },
        },
      })

      emitToRoom(userRoom(creator.id), 'conv:new', { conversationId: conv.id })
      return ok({ conversationId: conv.id })
    } catch (err) {
      // conversation creation failed (creator deleted mid-flight etc.) —
      // release the claim so the invitation is not stranded as 'accepted'
      await db.invitation
        .updateMany({ where: { id: invitation.id, acceptedById: me.id }, data: { status: 'pending', acceptedById: null } })
        .catch(() => undefined)
      throw err
    }
  }

  return fail(400, 'BAD_ACTION')
}
