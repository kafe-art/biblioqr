import { Prisma, PrismaClient } from '@prisma/client'
export const db = new PrismaClient()
export type Tx = Prisma.TransactionClient
// Serialize competing writers, and retry optimistic conflicts on other providers.
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 10000 }) }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2034', 'P1008'].includes(error.code) || attempt >= 3) throw error
    }
  }
}
