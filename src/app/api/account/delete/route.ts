import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { clearSessionCookie } from '@/lib/auth'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

/** DELETE /api/account — permanently delete the account (confirm with display name) */
export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const body = await req.json().catch(() => ({}))
  const confirm = String(body.confirm ?? '').trim()
  if (confirm !== me.displayName) {
    return fail(400, 'CONFIRM_MISMATCH', 'Confirmation does not match your display name.')
  }

  // remember conversations that might become empty after deletion
  const memberships = await db.conversationMember.findMany({
    where: { userId: me.id },
    select: { conversationId: true },
  })

  await db.user.delete({ where: { id: me.id } }) // cascades to settings, memberships, messages, receipts, blocks, reports, invitations, progress

  for (const m of memberships) {
    const remaining = await db.conversationMember.count({ where: { conversationId: m.conversationId } })
    if (remaining === 0) {
      await db.conversation.delete({ where: { id: m.conversationId } }).catch(() => undefined)
    }
  }

  await clearSessionCookie()
  return ok({ success: true })
}
