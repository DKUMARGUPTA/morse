// Morse Messenger — one-shot data migration: sandbox SQLite -> Supabase Postgres.
//
// PREREQUISITES
//   1. Tables must already exist in Supabase:
//        SUPABASE_DATABASE_URL="postgres://..." bunx prisma db push --schema prisma/schema.postgres.prisma
//      (or run supabase/schema.sql in the SQL editor)
//   2. SUPABASE_DATABASE_URL must be set (Project Settings -> Database -> Connection string).
//
// RUN
//   bun scripts/migrate-to-supabase.ts
//
// Idempotent-ish: rows whose id already exists in Postgres are skipped, so it is safe
// to re-run after a failed attempt. Run it when the app is idle (no active chats).

import { PrismaClient as SqliteClient } from '@prisma/client'
import { PrismaClient as PgClient } from '../generated/postgres-client'

const sqlite = new SqliteClient()
const pg = new PgClient()

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function copy<T extends { id: string }>(
  name: string,
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>
) {
  let skipped = 0
  let written = 0
  for (const batch of chunk(rows, 200)) {
    const ids = batch.map((r) => r.id)
    const existing = await (pg as unknown as { [k: string]: { findMany: Function } })[name].findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const have = new Set(existing.map((e: { id: string }) => e.id))
    const fresh = batch.filter((r) => !have.has(r.id))
    skipped += batch.length - fresh.length
    if (fresh.length > 0) {
      await insert(fresh)
      written += fresh.length
    }
  }
  console.log(`${name.padEnd(20)} written=${written} skipped=${skipped}`)
}

async function main() {
  console.log('Morse Messenger — SQLite -> Supabase migration\n')

  const users = await sqlite.user.findMany()
  await copy('user', users, (b) => pg.user.createMany({ data: b as never }))

  const settings = await sqlite.userSettings.findMany()
  await copy('userSettings', settings, (b) => pg.userSettings.createMany({ data: b as never }))

  const conversations = await sqlite.conversation.findMany()
  await copy('conversation', conversations, (b) => pg.conversation.createMany({ data: b as never }))

  const members = await sqlite.conversationMember.findMany()
  await copy('conversationMember', members, (b) => pg.conversationMember.createMany({ data: b as never }))

  const messages = await sqlite.message.findMany()
  await copy('message', messages, (b) => pg.message.createMany({ data: b as never }))

  const receipts = await sqlite.messageReceipt.findMany()
  await copy('messageReceipt', receipts, (b) => pg.messageReceipt.createMany({ data: b as never }))

  const invitations = await sqlite.invitation.findMany()
  await copy('invitation', invitations, (b) => pg.invitation.createMany({ data: b as never }))

  const blocks = await sqlite.block.findMany()
  await copy('block', blocks, (b) => pg.block.createMany({ data: b as never }))

  const reports = await sqlite.report.findMany()
  await copy('report', reports, (b) => pg.report.createMany({ data: b as never }))

  const progress = await sqlite.learningProgress.findMany()
  await copy('learningProgress', progress, (b) => pg.learningProgress.createMany({ data: b as never }))

  const practice = await sqlite.dailyPractice.findMany()
  await copy('dailyPractice', practice, (b) => pg.dailyPractice.createMany({ data: b as never }))

  console.log('\nDone. Now point the app at Supabase:')
  console.log('  1. .env  ->  DATABASE_URL=<your Supabase Postgres connection string>')
  console.log('  2. prisma/schema.prisma  ->  provider = "postgresql"')
  console.log('  3. restart the dev server')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await sqlite.$disconnect()
    await pg.$disconnect()
  })
