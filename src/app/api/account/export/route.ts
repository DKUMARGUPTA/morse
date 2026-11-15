import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

/** GET /api/account/export — download all my data as JSON */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me

  const profile = await db.user.findUnique({
    where: { id: me.id },
    select: { id: true, email: true, displayName: true, avatarColor: true, createdAt: true },
  })
  const settings = await db.userSettings.findUnique({ where: { userId: me.id } })
  const memberships = await db.conversationMember.findMany({
    where: { userId: me.id },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, displayName: true } } } },
          messages: {
            include: {
              receipts: { where: { userId: me.id } },
              sender: { select: { displayName: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })
  const progress = await db.learningProgress.findMany({ where: { userId: me.id } })
  const invitations = await db.invitation.findMany({ where: { createdById: me.id } })

  const conversations = memberships
    .filter((m) => m.conversation.members.some((x) => x.userId !== me.id))
    .map((m) => ({
      id: m.conversation.id,
      createdAt: m.conversation.createdAt,
      peer: m.conversation.members.find((x) => x.userId !== me.id)?.user.displayName ?? 'unknown',
      messages: m.conversation.messages
        .filter((msg) => !msg.receipts.some((r) => r.hidden))
        .map((msg) => ({
          from: msg.sender.displayName,
          kind: msg.kind,
          text: msg.text,
          morse: msg.morse,
          createdAt: msg.createdAt,
          editedAt: msg.editedAt,
        })),
    }))

  const payload = {
    exportedAt: new Date().toISOString(),
    product: 'Morse Messenger',
    profile,
    settings,
    conversations,
    learningProgress: progress,
    invitations,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="morse-messenger-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
