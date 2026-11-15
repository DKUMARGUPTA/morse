// Verify users + latest messages live in Supabase Postgres
import { PrismaClient } from '@prisma/client'

const pg = new PrismaClient()

async function main() {
  const users = await pg.user.findMany({ select: { email: true, displayName: true } })
  console.log('USERS:', users.map((u) => `${u.displayName}<${u.email}>`).join(', '))
  const msgs = await pg.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { kind: true, text: true, createdAt: true },
  })
  console.log('LATEST 3 MESSAGES:')
  for (const m of msgs) {
    console.log(`  [${m.createdAt.toISOString()}] kind=${m.kind} text=${(m.text ?? '').slice(0, 50)}`)
  }
  const counts = {
    conversations: await pg.conversation.count(),
    messages: await pg.message.count(),
    receipts: await pg.messageReceipt.count(),
    settings: await pg.userSettings.count(),
  }
  console.log('COUNTS:', JSON.stringify(counts))
}

main()
  .catch((e) => {
    console.error('ERR:', e.message.slice(0, 200))
    process.exit(1)
  })
  .finally(() => pg.$disconnect())
