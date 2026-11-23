import { db } from '../server/db'
import { env } from '../server/env'
import { codeFromEmail, nameFromEmail } from '../server/routes/auth'

try {
  const email = env.ADMIN_EMAIL
  if (!email) throw new Error('Configura ADMIN_EMAIL para crear la cuenta administradora.')
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('biblioqr.seed-admin'))`
    const owner = await tx.usuario.findUnique({ where: { email } })
    if (!owner) {
      await tx.usuario.create({ data: {
        email, nombres: nameFromEmail(email), rol: 'admin',
        codigoUsuario: await codeFromEmail(tx, email, 'P-'),
      } })
    } else if (owner.rol !== 'admin' || !owner.activo) {
      await tx.usuario.update({ where: { id: owner.id }, data: { rol: 'admin', activo: true } })
    }
  })
  console.log('Cuenta administradora lista.')
} finally {
  await db.$disconnect()
}
