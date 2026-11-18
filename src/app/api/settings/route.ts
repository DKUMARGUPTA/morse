import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

const LANGS = ['en', 'hi']

export async function GET() {
  const user = await requireUser()
  if (isResponse(user)) return user
  let settings = await db.userSettings.findUnique({ where: { userId: user.id } })
  if (!settings) settings = await db.userSettings.create({ data: { userId: user.id } })
  return ok(settings)
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (isResponse(user)) return user
  try {
    const body = await req.json()
    const patch: Record<string, boolean | number | string> = {}
    if (body.language !== undefined) {
      if (!LANGS.includes(body.language)) return fail(400, 'BAD_LANGUAGE')
      patch.language = body.language
    }
    for (const key of ['readReceipts', 'soundEnabled', 'vibrationEnabled'] as const) {
      if (body[key] !== undefined) patch[key] = !!body[key]
    }
    // server-side clamps: the client UI clamps too, but a crafted PATCH must
    // never persist volume=9999 / wpm=-5 / frequency=999999999 (live-tested)
    const RANGES: Record<string, [number, number]> = {
      wpm: [1, 40],
      frequency: [200, 3000],
      volume: [0, 100],
    }
    for (const [key, [min, max]] of Object.entries(RANGES)) {
      if (body[key] !== undefined) {
        const n = Number(body[key])
        if (!Number.isFinite(n)) return fail(400, 'BAD_NUMBER')
        patch[key] = Math.min(max, Math.max(min, Math.round(n)))
      }
    }
    const settings = await db.userSettings.upsert({
      where: { userId: user.id },
      update: patch,
      create: { userId: user.id, ...patch },
    })
    return ok(settings)
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}
