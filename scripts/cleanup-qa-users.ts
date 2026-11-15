// One-off maintenance: remove QA test users (email like qa-*@morse.test) left by test runs.
// Usage: bun scripts/cleanup-qa-users.ts
import { PrismaClient } from '../generated/postgres-client'

const db = new PrismaClient()

const users = await db.user.findMany({
  where: { email: { endsWith: '@morse.test' } },
  select: { id: true, email: true },
})

for (const u of users) {
  await db.user.delete({ where: { id: u.id } })
  console.log('deleted', u.email)
}

console.log(`done — ${users.length} QA user(s) removed`)
await db.$disconnect()
