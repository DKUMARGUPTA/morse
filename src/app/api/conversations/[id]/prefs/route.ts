import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

/** PATCH /api/conversations/[id]/prefs — my personal pin / mute flags for this conversation */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params

  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: me.id } },
  })
  if (!membership) return ok({ success: false })

  try {
    const body = await req.json()
    const data: { pinned?: boolean; muted?: boolean } = {}
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned
    if (typeof body.muted === 'boolean') data.muted = body.muted
    if (Object.keys(data).length === 0) return ok({ success: true })

    const updated = await db.conversationMember.update({ where: { id: membership.id }, data })
    return ok({ success: true, pinned: updated.pinned, muted: updated.muted })
  } catch {
    return ok({ success: false })
  }
}
