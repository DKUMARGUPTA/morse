import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** the client sends its local calendar day (it knows its timezone; the server is UTC).
 *  Accept only a strict yyyy-mm-dd to keep the unique date key clean. */
function dayFromBody(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayStr()
}

function yesterdayStr(): string {
  const d = new Date(Date.now() - 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** GET /api/learn — learning progress + daily streak */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me
  const progress = await db.learningProgress.findMany({
    where: { userId: me.id },
    select: { character: true, correct: true, wrong: true },
  })
  const days = await db.dailyPractice.findMany({
    where: { userId: me.id },
    orderBy: { date: 'desc' },
    take: 60,
  })
  const byDate = new Map(days.map((d) => [d.date, d.count]))
  let streak = 0
  let cursor = byDate.has(todayStr()) ? todayStr() : yesterdayStr()
  if (byDate.has(cursor)) {
    while (byDate.has(cursor)) {
      streak += 1
      const dt = new Date(cursor + 'T12:00:00')
      dt.setDate(dt.getDate() - 1)
      cursor = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    }
  }
  // 14-day practice history (ascending) for the activity strip
  const history = days
    .slice(0, 14)
    .map((d) => ({ date: d.date, count: d.count }))
    .reverse()

  return ok({
    progress,
    streak,
    practicedToday: byDate.get(todayStr()) ?? 0,
    history,
  })
}

/** POST /api/learn — record one exercise answer (or a daily-drill attempt) */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const body = await req.json()

  // Daily drill (Phase 3): word-level practice, only bumps the daily counter
  if (body.type === 'drill') {
    const day = dayFromBody(body.date)
    await db.dailyPractice.upsert({
      where: { userId_date: { userId: me.id, date: day } },
      update: { count: { increment: 1 } },
      create: { userId: me.id, date: day, count: 1 },
    })
    return ok({ success: true })
  }

  const character = String(body.character ?? '').toUpperCase()
  const correct = !!body.correct
  if (!character || character.length > 2) return ok({ success: false })

  const existing = await db.learningProgress.findUnique({
    where: { userId_character: { userId: me.id, character } },
  })
  if (existing) {
    await db.learningProgress.update({
      where: { id: existing.id },
      data: {
        correct: existing.correct + (correct ? 1 : 0),
        wrong: existing.wrong + (correct ? 0 : 1),
        lastPracticedAt: new Date(),
      },
    })
  } else {
    await db.learningProgress.create({
      data: {
        userId: me.id,
        character,
        correct: correct ? 1 : 0,
        wrong: correct ? 0 : 1,
        lastPracticedAt: new Date(),
      },
    })
  }
  await db.dailyPractice.upsert({
    where: { userId_date: { userId: me.id, date: dayFromBody(body.date) } },
    update: { count: { increment: 1 } },
    create: { userId: me.id, date: dayFromBody(body.date), count: 1 },
  })
  return ok({ success: true })
}
