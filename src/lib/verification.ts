// Morse Messenger — email verification token helpers.
// Raw token goes to the user; only its SHA-256 hash touches the database.

import { createHash, randomBytes } from 'crypto'

export const VERIFICATION_TTL_HOURS = 24

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function newVerificationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex')
  return { raw, hash: sha256(raw) }
}

export function verificationExpiry(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600 * 1000)
}
