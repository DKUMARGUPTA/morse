import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // no query logging: params would echo message text into server logs
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db