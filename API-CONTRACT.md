# BiblioQR: implementación y contrato HTTP

Base: `${VITE_API_URL}/api`. El cliente usa `credentials: 'include'`.
JWT HS256 de 15 minutos en cookie `session`, `HttpOnly`, `SameSite=Strict`, `Secure` en producción.
Las fechas de entrada y salida son números enteros Unix en milisegundos. Prisma persiste `DateTime`.
Los datos públicos de usuarios nunca contienen `passwordHash`.

## Respuestas y permisos

Errores: `{ "ok": false, "error": "mensaje en español" }`.

| Estado | Significado |
|---|---|
| 400 | Body, parámetro, JSON o tamaño de solicitud inválido |
| 401 | Credenciales, sesión o firma QR inválidas; límite de intentos de login |
| 403 | Permiso, propietario u origen no autorizado |
| 404 | Ruta o registro no encontrado |
| 409 | Sin disponibilidad, ticket canjeado, estado incompatible, deuda, mora o conflicto concurrente |
| 410 | Reserva vencida |
| 500 | Error interno sin información técnica en la respuesta |

Permisos exactos: `shared/access.ts`; el servidor consulta el rol y estado de cuenta actuales en la base en cada solicitud autenticada.
`Receipt = {kind:'loan'|'return',loan:Loan,user:User,book:Book,fine:Fine|null,at:number}`.
`BookInput = {isbn,title,author,year,genre,faculties,synopsis,format,pages,pavilion,copies,coverUrl?}`.
`UserInput = {code,email,name,role,faculty,career?,password}`; contraseña nueva o restablecida: 12–128 caracteres.
Todos los bodies de escritura son objetos estrictos validados por Zod; los parámetros `:id` son cadenas no vacías de hasta 200 caracteres.
Cuando se indica `{}`, se acepta body vacío. Campos desconocidos se rechazan.

| Método y ruta | Acceso | Body | Respuesta exitosa |
|---|---|---|---|
| POST `/auth/login` | Público, 20 intentos/IP/15 min | `{identifier,password}` | 200 `{user}` y cookie |
| POST `/auth/logout` | Sesión | `{}` | 200 `{ok:true}` y eliminación de cookie |
| GET `/me` | Sesión | — | 200 `{user}` |
| GET `/state` | Sesión | — | 200 `{users,books,loans,reservations,fines,audit}` |
| GET `/books` | `catalog:read` | — | 200 `{books:Book[]}` con ejemplares |
| GET `/policy` | `catalog:read` | — | 200 `{policy}` con las nueve variables de política |
| POST `/reservations` | `reservation:create` | `{bookId,pickupAt,method:'desk'|'locker'}` | 201 `{reservation,qrToken}` |
| DELETE `/reservations/:id` | Propietario con `reservation:create`, o `reservation:manage` | `{}` | 200 `{ok:true}` |
| POST `/reservations/:id/ready` | `reservation:manage` | `{}` | 200 `{ok:true}` |
| POST `/circulation/scan` | `circulation:write` | `{qrToken}` | 200 `Receipt` |
| POST `/circulation/checkout` | `circulation:write` | `{userCode,copyId}` | 200 `Receipt` |
| POST `/circulation/checkin` | `circulation:write` | `{copyId}` | 200 `Receipt`, multa si corresponde |
| POST `/loans/:id/renew` | Propietario con `loan:renew` | `{}` | 200 `{loan}` |
| POST `/loans/digital` | `reservation:create` | `{bookId}` | 201 `{loan}` |
| POST `/loans/:id/return-digital` | Propietario con `loan:renew` | `{}` | 200 `{ok:true}` |
| POST `/fines/:id/pay` | `circulation:write` | `{}` | 200 `{ok:true}` |
| POST `/fines/:id/waive` | `fine:waive` | `{}` | 200 `{ok:true}` |
| GET `/admin/users` | `user:manage` | — | 200 `{users}` |
| POST `/admin/users` | `user:manage` | `UserInput` | 201 `{user}` |
| POST `/admin/users/bulk` | `user:manage` | `{ids:string[],op}` | 200 `{count}` |
| GET `/admin/audit` | `audit:read` | — | 200 `{audit}`; últimas 1000 entradas |
| POST `/admin/books` | `catalog:write` | `BookInput` | 201 `{book}` |
| PUT `/admin/books/:id` | `catalog:write` | `BookInput` | 200 `{book}` |
| DELETE `/admin/books/:id` | `catalog:write` | `{}` | 200 `{ok:true}` |
| POST `/admin/books/import` | `catalog:write` | `{books:BookInput[]}` | 200 `{created,skipped}` |
| POST `/admin/books/:id/copies` | `catalog:write` | `{}` | 201 `{copy}` |
| PATCH `/admin/copies/:id` | `catalog:write` | `{condition:'excelente'|'regular'|'mantenimiento'|'baja'}` | 200 `{ok:true}` |

`op` es `{type:'activate'}`, `{type:'block'}`, `{type:'role',role}` o `{type:'reset',password}`.
No se permite bloquearse o degradarse a sí mismo. El formulario de restablecimiento pide la contraseña al operador y nunca registra su contenido en auditoría.

`/state` limita usuarios, reservas, préstamos y multas al propietario cuando el rol es estudiante. Los operadores reciben los datos de circulación; solo el administrador recibe auditoría. Las reservas activas del propietario incluyen `qrToken` para recuperar el ticket después de recargar. El personal no recibe ese token.

## Invariantes

- Reservar exige cuenta activa, ausencia de multas y préstamos vencidos, un ejemplar prestable y ninguna reserva activa del mismo usuario y título. `pickupAt` acepta hasta 30 días y una tolerancia de reloj de 60 segundos.
- La asignación usa transacción serializable y `updateMany` condicionado a `status='available'`. Las escrituras concurrentes se reintentan ante conflictos de serialización.
- QR: `base64url(JSON({rid,cid,uid,exp,nonce})).base64url(HMAC-SHA256)`. No contiene nombre, correo ni carnet. `exp` se expresa en milisegundos y forma parte de los bytes firmados.
- Escanear valida firma con `timingSafeEqual`, correspondencia exacta con la base, vencimiento, horario de retiro, elegibilidad y estado del ejemplar. Actualiza `consumedAt` y estado mediante condición atómica, y crea el préstamo en la misma transacción. Un error revierte ambas operaciones.
- El segundo escaneo de una reserva consumida devuelve 409. Una reserva vencida devuelve 410. El job de 20 segundos libera ejemplares vencidos; reserva y escaneo también ejecutan la caducidad antes de operar.
- Devolver cierra el préstamo y genera como máximo una multa por préstamo; el cálculo redondea días o fracciones hacia arriba y el importe a centavos. El segundo check-in devuelve 409.
- Renovar exige propiedad, ausencia de mora y deuda, límite de renovaciones y ausencia de reservas activas ajenas para el título.
- Mantenimiento y baja impiden reservar y prestar. Solo se modifica la condición de un ejemplar disponible.
- Se conservan libros con historial de circulación. Su eliminación devuelve 409 para preservar trazabilidad.
- Auditoría solo permite inserción y lectura. El arranque instala triggers contra UPDATE/DELETE y, en PostgreSQL, TRUNCATE. El usuario de ejecución necesita crear esos triggers al iniciar.

## Entorno y ejecución

`server/env.ts` aborta si falta o es inválida alguna de estas variables:

```
DATABASE_URL
JWT_SECRET                # mínimo 32 caracteres
QR_HMAC_SECRET            # mínimo 32 caracteres, distinto del JWT
PORT
CORS_ORIGIN
POLICY_LOAN_DAYS
POLICY_RENEWAL_DAYS
POLICY_MAX_RENEWALS
POLICY_MAX_LOANS
POLICY_HOLD_HOURS
POLICY_FINE_PER_DAY
POLICY_CURRENCY
POLICY_WARN_DAYS
```

El cliente consume `VITE_API_URL`; `VITE_DEMO_MODE=true` muestra el selector de pruebas. El selector vuelve al login y exige credenciales reales del rol elegido.
`POLICY_*` del servidor es la política efectiva y se sincroniza con las funciones de presentación mediante `/policy`.

SQLite es el provider inicial y usa `DATABASE_URL=file:./dev.db` (archivo relativo a `prisma/`). Prisma requiere elegir provider antes de generar el cliente y las migraciones:

```
npm run db:provider -- postgresql
```

El comando solo cambia el provider del esquema; no convierte bases existentes. SQLite y PostgreSQL requieren historiales de migraciones independientes y su `DATABASE_URL` correspondiente.

Scripts: `dev:server` inicia Express con tsx; `dev` inicia Vite y Express; `build` genera Prisma, verifica TypeScript de cliente y servidor, y construye Vite; `test` ejecuta las pruebas TypeScript.
`tests/library.test.ts` prepara una base SQLite aislada dentro de `tests/`, inicia un servidor de pruebas y comprueba falsificación, doble escaneo simultáneo, permisos, multas, caducidad, privacidad y auditoría inmutable. Requiere dependencias instaladas y cliente Prisma generado para SQLite. Reemplaza los tests anteriores del store en memoria.

## Archivos de esta entrega

Nuevos: `prisma/schema.prisma`, `scripts/prisma-provider.cjs`, `shared/access.ts`, `server/{index,env,db,http,auth,qr,domain}.ts`, `server/routes/{auth,catalog,reservations,circulation,fines,admin}.ts`, `src/lib/api.ts`, `tsconfig.server.json`, `tests/library.test.ts`, `API-CONTRACT.md`.

Modificados: `package.json`, `src/App.tsx`, `src/lib/{access,rules,types}.ts`, `src/store/library.tsx`, `src/features/auth/AuthHub.tsx`, `src/features/student/{BookSheet,LockerView,Ticket}.tsx`, `src/features/librarian/{CirculationView,ReservationsView}.tsx`, `src/features/admin/{CatalogView,UsersView}.tsx`.

Eliminado: `tests/library.test.cjs`, ligado al store síncrono anterior.

## Verificación disponible en esta sesión

- `npm install --ignore-scripts --fetch-retries=0 --fetch-timeout=20000`: bloqueado, `EACCES` al acceder a `registry.npmjs.org/@prisma%2fclient`.
- Instalación offline: `ENOTCACHED`; las dependencias nuevas no están disponibles en caché.
- `tsc --noEmit`: solo reporta `Cannot find module 'jsqr'` en el escáner.
- TypeScript del servidor: detenido porque falta `@types/node`.
- `npm test`: detenido porque `tsx` no está instalado.
- `npm run build`: detenido porque `prisma` no está instalado.

No se declara aprobado el build, la migración ni las pruebas HTTP. La configuración local, instalación, migración inicial, seed y ejecución quedan asignadas a Antigravity; la revisión independiente corresponde a OpenCode.
