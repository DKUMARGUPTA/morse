import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sha256 } from '@/lib/verification'

/** GET /api/auth/verify?token=... — email link target.
 *  Verifies the address and redirects back into the app with ?verified=1|0. */
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!token) return NextResponse.redirect(`${base}/?verified=0`)

  const record = await db.verificationToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, expiresAt: true },
  })
  if (!record || record.expiresAt < new Date()) {
    // expired/unknown — clean up if present, then fail softly
    if (record) await db.verificationToken.delete({ where: { id: record.id } }).catch(() => undefined)
    return NextResponse.redirect(`${base}/?verified=0`)
  }

  await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } })
  await db.verificationToken.delete({ where: { id: record.id } })
  return NextResponse.redirect(`${base}/?verified=1`)
}
