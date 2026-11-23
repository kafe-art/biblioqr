# BiblioQR: implementación y contrato HTTP

Base: `${VITE_API_URL}/api`. El cliente usa `credentials: 'include'`.
JWT HS256 de 12 horas en cookie `session`, `HttpOnly`, `SameSite=Strict`, `Secure` en producción.
Las fechas de entrada y salida son números enteros Unix en milisegundos. Prisma persiste `DateTime`.
Los datos públicos de usuarios nunca contienen `passwordHash`.

## Respuestas y permisos

Errores: `{ "ok": false, "error": "mensaje en español" }`.

| Estado | Significado |
|---|---|
| 400 | Body, parámetro, JSON o tamaño de solicitud inválido |
| 401 | Credenciales, sesión o firma QR inválidas |
| 403 | Permiso, propietario u origen no autorizado |
| 404 | Ruta o registro no encontrado |
| 409 | Sin disponibilidad, ticket canjeado, estado incompatible, deuda, mora o conflicto concurrente |
| 410 | Reserva vencida |
| 429 | Límite de intentos o reenvíos |
| 500 | Error interno sin información técnica en la respuesta |

Permisos exactos: `shared/access.ts`; el servidor consulta el rol y estado de cuenta actuales en la base en cada solicitud autenticada.
`Receipt = {kind:'loan'|'return',loan:Loan,user:User,book:Book,fine:Fine|null,at:number}`.
`BookInput = {isbn,title,author,year,genre,faculties,synopsis,format,pages,pavilion,copies,coverUrl?,editorial?}`.
`UserInput = {email,name?,role}`. El personal configura la contraseña con un código enviado por correo.
Todos los bodies de escritura son objetos estrictos validados por Zod; los parámetros `:id` son cadenas decimales positivas de BIGINT, excepto el código de inventario de `/admin/copies/:id`.
Cuando se indica `{}`, se acepta body vacío. Campos desconocidos se rechazan.

| Método y ruta | Acceso | Body | Respuesta exitosa |
|---|---|---|---|
| GET `/auth/config` | Público | — | 200 `{studentDomain}` |
| POST `/auth/send-otp` | Público | `{email}` institucional | 200 `{ok,expiresInMinutes,resendInSeconds}` |
| POST `/auth/verify-otp` | Público | `{email,otp}` | 200 `{user}` y cookie |
| POST `/auth/staff/send-code` | Público | `{email}` | 200 `{ok,expiresInMinutes,resendInSeconds}` |
| POST `/auth/staff/password` | Público | `{email,otp,password}` | 200 `{user}` y cookie |
| POST `/auth/login` | Público, 20 intentos/IP/15 min | `{identifier,password}` | 200 `{user}` y cookie |
| POST `/auth/logout` | Sesión | `{}` | 200 `{ok:true}` y eliminación de cookie |
| GET `/me` | Sesión | — | 200 `{user}` |
| GET `/state` | Sesión | — | 200 `{users,books,loans,reservations,fines,audit,incidencias,avisos}` |
| GET `/books` | `catalog:read` | — | 200 `{books:Book[]}` con ejemplares |
| GET `/policy` | `catalog:read` | — | 200 `{policy}` con las nueve variables de política |
| POST `/reservations` | `reservation:create` | `{bookIds:string[],pickupAt,method:'desk'|'locker'}` | 201 `{reservation,qrToken}` |
| DELETE `/reservations/:id` | Propietario con `reservation:create`, o `reservation:manage` | `{}` | 200 `{ok:true}` |
| POST `/reservations/:id/ready` | `reservation:manage` | `{}` | 200 `{ok:true}` |
| POST `/circulation/scan` | `circulation:write` | `{qrToken}` | 200 `Receipt` con `receipts: Receipt[]` |
| POST `/circulation/checkout` | `circulation:write` | `{userCode,copyId}` | 200 `Receipt` |
| POST `/circulation/checkin` | `circulation:write` | `{copyId}` | 200 `Receipt`, multa si corresponde |
| POST `/loans/:id/renew` | Propietario con `loan:renew` | `{}` | 200 `{loan}` |
| POST `/loans/digital` | `reservation:create` | `{bookId}` | 201 `{loan}` |
| POST `/loans/:id/return-digital` | Propietario con `loan:renew` | `{}` | 200 `{ok:true}` |
| POST `/incidencias` | `circulation:write` | `{loanId,tipo,descripcion}` | 201 `{id}` y aviso al lector |
| POST `/avisos/:id/leer` | Propietario | `{}` | 200 `{ok:true}` |
| GET `/admin/reports/weekly` | `analytics:read` | `?start=AAAA-MM-DD` opcional | 200 `WeeklyReport` en hora de Lima |
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

`op` es `{type:'activate'}`, `{type:'block'}`, `{type:'role',role}` o `{type:'reset'}`.
No se permite bloquearse o degradarse a sí mismo. El restablecimiento borra el hash anterior y el personal configura de nuevo su contraseña por correo.

`/state` limita usuarios, reservas, préstamos y multas al propietario cuando el rol es estudiante. Los operadores reciben los datos de circulación; solo el administrador recibe auditoría. Las reservas activas del propietario incluyen `qrToken` para recuperar el ticket después de recargar. El personal no recibe ese token.

## Invariantes

- Reservar exige cuenta activa, ausencia de multas y préstamos vencidos, un ejemplar prestable y ninguna reserva activa del mismo usuario y título. `pickupAt` acepta hasta 30 días y una tolerancia de reloj de 60 segundos.
- La asignación usa transacción serializable y una actualización condicionada a `estado='available'`. Las escrituras concurrentes se reintentan ante conflictos de serialización.
- QR: `base64url(JSON({rid,cid,uid,exp,nonce})).base64url(HMAC-SHA256)`. No contiene nombre, correo ni carnet. `exp` se expresa en milisegundos y forma parte de los bytes firmados.
- Escanear valida firma con `timingSafeEqual`, correspondencia exacta con la base, vencimiento, horario de retiro, elegibilidad y estado del ejemplar. Actualiza `consumedAt` y estado mediante condición atómica, y activa todos los detalles de la reserva en la misma transacción. Un error revierte ambas operaciones.
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

PostgreSQL es el proveedor del esquema. Los ids BIGINT viajan como cadenas decimales. En la interfaz, `copy.id` y `copyId` representan el código de inventario escaneable. `copy.inventoryId` identifica la fila persistida.

## Circulación agrupada

- `bookIds` admite de uno a tres títulos distintos. Los clientes anteriores pueden enviar un único `bookId`. Una sola transacción aparta todos los ejemplares. La respuesta contiene una cabecera y `reservation.details[]` con el detalle, título, código de inventario y estado. Los campos `bookId` y `copyId` de cabecera reflejan el primer detalle.
- Un único QR firma la reserva, el usuario, el vencimiento, el nonce y los ids de ejemplares ordenados por posición. El canje comprueba que todos caben dentro del límite de préstamos y entrega el grupo completo. La devolución y la renovación se aplican al detalle individual.
- El préstamo directo y el digital crean reservas retiradas inmediatamente. El detalle digital identifica el libro y tiene ejemplar nulo. La mora crea una incidencia, una sanción con importe decimal y un aviso en el casillero. Pago y condonación registran la fecha de resolución.
- Los avisos son internos. Los tipos manuales de incidencia son `dano`, `perdida` y `otro`. El servidor registra `mora` al devolver tarde. El estudiante recibe sus incidencias y avisos en `/state`.

## Preparación y pruebas

Usa `DATABASE_URL` para la aplicación y `TEST_DATABASE_URL` para una base PostgreSQL de pruebas. Las suites crean y eliminan exclusivamente esquemas temporales con nombre aleatorio. Ejecuta `npm run build` y `npm test`. Para una base nueva, aplica `npx prisma migrate deploy` antes de cargar el catálogo. La migración inicial crea las tablas vacías. La transferencia de registros desde una instalación anterior es una operación independiente.
