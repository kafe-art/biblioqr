
# Diseño del área de Bibliotecario: «Mostrador profesional»

## 1. Concepto
El bibliotecario trabaja de pie, con una pistola lectora y una fila de estudiantes esperando. La interfaz es una herramienta de mostrador: rápida, predecible y legible a un metro de distancia.

Principios:
1. **Una acción principal por pantalla.** Siempre hay un único botón índigo relleno. Todo lo demás es secundario o fantasma.
2. **El escáner manda.** En Circulación el foco vuelve siempre al campo de lectura después de cada operación.
3. **El estado se lee sin colores.** Cada estado lleva icono y texto; el color lo refuerza, no lo sustituye.
4. **Confirmar sin mirar.** Sonido y vibración (`feedback.*`) más una animación corta confirman o rechazan cada lectura.
5. **Solo datos reales.** Todo sale de `useLibrary()`. No se usan datos de ejemplo ni cifras inventadas. Si un dato no existe, se omite.

## 2. Color con significado
Solo se usan los tokens de `src/index.css` mediante sus clases (`bg-primary`, `text-ok`, `bg-warn/12`, `border-line`…). No se usan colores de Tailwind sueltos (`emerald-500`, `amber-500`…).

| Significado | Token | Icono (lucide) | Texto tipo | Uso |
|---|---|---|---|---|
| Acción | `primary` / `primary-hover`; `accent` para foco y enlaces | `ScanLine`, `ArrowRight` | «Registrar préstamo» | Botón principal, foco, selección actual |
| Listo / correcto | `ok` | `CheckCircle2` | «Listo para recoger», «Devuelto a tiempo» | Reserva lista, operación aceptada, ejemplar disponible |
| Vence pronto | `warn` | `Clock` | «Vence en 2 días» | Préstamo con `daysLeft ≤ POLICY.warnDays`, reserva pendiente de preparar, reserva que caduca en menos de 2 h |
| Atrasado o bloqueado | `bad` | `AlertTriangle` (atraso), `Ban` (bloqueado) | «3 días de atraso · S/ 4.50», «Usuario bloqueado» | Mora, multa pendiente, `user.status==='blocked'`, lectura rechazada, reserva expirada |
| Neutro | `muted` / `surface-2` | `Circle`, `Archive` | «Entregado», «Cancelado» | Estados finales sin acción |

Reglas:
- Los fondos de estado son translúcidos y siguen los de `Badge`: `bg-ok/10`, `bg-warn/12`, `bg-bad/10`. El texto va en el color pleno del token. Así se mantiene el contraste en claro y en oscuro, porque los tokens ya cambian en `.dark`.
- El rojo nunca se usa como decoración. Si aparece rojo, hay algo que resolver.
- El índigo relleno solo aparece en la acción principal y en la selección actual del ShelfGrid.
- Contraste mínimo AA: 4.5:1 para texto y 3:1 para iconos y bordes de estado.

## 3. Tipografía (Inter Variable, `tabular` para cifras)
| Rol | Clase | Uso |
|---|---|---|
| Display | `text-3xl font-semibold tracking-tight tabular` (30/36) | Cifra de StatTile |
| Título de vista | `text-2xl font-semibold tracking-tight` (24/32) | H1 de cada vista |
| Título de sección | `text-lg font-semibold` (18/28) | `SectionTitle` |
| Título de tarjeta | `text-[15px] font-semibold` (15/22) | Título del libro en ResultCard o tarjeta Kanban |
| Cuerpo | `text-sm` (14/20) | Texto general |
| Etiqueta | `text-[13px] font-medium` | Labels, botones `sm` |
| Meta | `text-xs text-muted` (12/16) | Fechas, códigos, ayudas |
| Sobretítulo | `text-xs font-medium uppercase tracking-wider text-muted` | Rótulos de StatTile y columnas |

Los códigos de ejemplar, carnet y ticket van en `font-mono text-[13px] tabular`. Las cifras de dinero y fechas siempre llevan `tabular`.

## 4. Cuadrícula de 8 px, esquinas y sombra
- **Espaciado:** múltiplos de 8 px (`2`=8, `4`=16, `6`=24, `8`=32, `12`=48). Se permite 4 px (`1`) solo dentro de un componente (icono↔texto, píldoras).
- Separación entre secciones: `space-y-8`. Dentro de una tarjeta: `p-4` (compacta) o `p-6` (principal). Entre elementos: `gap-2` o `gap-4`.
- **Área táctil mínima:** 40 px (`h-10`); en tablet y móvil, 48 px (`h-12`) para la acción principal.
- **Contenedor:** `max-w-7xl` del AppShell. En escritorio se usa una rejilla de 12 columnas con `gap-6`.
- **Esquinas:** tarjeta `rounded-2xl` (16); botón e input `rounded-xl` (12); botón `sm`, celda de estante y kbd `rounded-lg` (8); píldora `rounded-full`.
- **Sombra:** `shadow-card` en tarjetas en reposo; `shadow-pop` solo en diálogos, hojas y el ResultCard recién aparecido (dura 1 s y luego vuelve a `shadow-card`). Los bordes van en `border-line`; `border-line-strong` se reserva para inputs y botones secundarios.

## 5. Movimiento
| Evento | Animación | Duración / curva | Sonido |
|---|---|---|---|
| Lectura aceptada | **Pulso**: anillo `pulse-ring` en el borde del ScanPanel con el color del token (`ok`) + entrada del ResultCard (`opacity 0→1`, `y 8→0`) | 450 ms / `ease-out-quint` | `feedback.success()` |
| Lectura con advertencia (vence pronto, multa al devolver) | Pulso con color `warn` | 450 ms | `feedback.warning()` |
| Lectura rechazada | **Sacudida** horizontal del ScanPanel: `x: 0,-6,6,-4,4,0` + borde `bad` durante 1.2 s | 320 ms | `feedback.error()` |
| Lectura detectada (antes de la respuesta) | Línea de escaneo `qr-scan` | mientras está pendiente | `feedback.scan()` |
| Cambio de columna Kanban | `layout` de motion (la tarjeta se desliza) | spring 0.35 s, bounce 0.15 | — |
| Foco en ShelfGrid | Celda activa con `pulse-ring` una sola vez | 600 ms | — |
| Cambio de vista | El que ya tiene AppShell (fade + y 10) | 200 ms | — |

**Reducir movimiento:** el bloque `prefers-reduced-motion` de `index.css` ya anula las animaciones CSS. Además, en motion se usa `useReducedMotion()`: si devuelve true, la sacudida y el pulso se sustituyen por un cambio de borde y fondo sin desplazamiento, y `layout` se desactiva. El sonido se mantiene, porque no es movimiento. La animación nunca es la única señal: siempre hay texto y `aria-live`.

## 6. Navegación y atajos
Orden de la navegación del bibliotecario: **Hoy · Circulación · Reservas · Ubicación**. «Hoy» es nueva y pasa a ser la vista de inicio (primera en `NAV.librarian`, id `hoy`, icono `LayoutDashboard`, permiso `circulation:write`).

Atajos globales (solo con rol bibliotecario; se aplica `preventDefault` para anular la ayuda del navegador en F1):
| Tecla | Acción |
|---|---|
| **F1** | Ir a Circulación en modo **Préstamo** y enfocar el campo de carnet |
| **F2** | Ir a Circulación en modo **Devolución** y enfocar el escáner |
| **F3** | Ir a Circulación en modo **Entrega de reserva** y enfocar el escáner |
| `Esc` | Cerrar el ResultCard o el diálogo y volver a enfocar el escáner |
| `Ctrl K` | Buscador (ya existe) |
| `Alt 1–4` | Ir a Hoy / Circulación / Reservas / Ubicación |

Los atajos no se activan mientras se escribe en un `textarea` o un `select` abierto. Sí funcionan dentro del input del escáner, porque las pistolas no envían teclas F. Se muestran con `<kbd>` en el Segmented de Circulación y en los botones de acción rápida de Hoy. En táctil se ocultan los `<kbd>`.

## 7. Vistas

### 7.1 Hoy (nueva)
**Propósito:** saber en 5 segundos qué hay que hacer en el turno.

```
┌ Hoy · sábado 22 nov ───────────────────────────── [ Escanear (F1) ] ┐
│ ┌StatTile──────┐ ┌StatTile──────┐ ┌StatTile──────┐ ┌StatTile──────┐ │
│ │POR PREPARAR  │ │LISTAS        │ │VENCEN PRONTO │ │ATRASADOS     │ │
│ │  7  ◷ ámbar  │ │  4  ✓ verde  │ │  5  ◷ ámbar  │ │  2  ⚠ rojo   │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ │
│ ┌ Cola de preparación (8 col) ───────┐ ┌ Atención (4 col) ─────────┐│
│ │ RES-0012 · Cálculo I · Ana R.      │ │ ⚠ L. Pérez · 3 d atraso   ││
│ │ ◷ Recoge 10:00  [Marcar lista][Ubicar]│ ⊘ J. Soto · Bloqueado     ││
│ │ …                                  │ │ S/ 4.50 pendiente [Cobrar]││
│ └────────────────────────────────────┘ └───────────────────────────┘│
│ Acciones rápidas: [Préstamo F1] [Devolución F2] [Entrega F3]         │
└──────────────────────────────────────────────────────────────────────┘
```
- **Jerarquía:** 1) StatTiles; 2) cola de preparación (reservas `pending` ordenadas por `pickupAt` ascendente); 3) panel de atención (préstamos atrasados, multas pendientes, usuarios bloqueados con préstamo activo); 4) acciones rápidas.
- **Acción principal:** «Escanear» (F1), que lleva a Circulación.
- **Datos (todos derivados de `useLibrary()`):**
  - Por preparar = reservas `pending`.
  - Listas = reservas `ready`.
  - Vencen pronto = préstamos sin `returnedAt`, con `copyId` y `0 ≤ daysLeft(dueAt) ≤ POLICY.warnDays`.
  - Atrasados = préstamos sin `returnedAt` con `daysLate(dueAt) > 0`.
  - Cada StatTile lleva a su lista: Reservas filtrada, o el panel de atención con scroll.
- **Vacío:** EmptyState con icono `CheckCircle2` en `ok`: «Todo al día. No hay reservas por preparar ni préstamos atrasados.» Acción: «Escanear (F1)».
- **Carga:** 4 Skeleton `h-28 rounded-2xl` y 5 filas Skeleton `h-14` en la cola. Se muestran mientras no haya terminado la primera carga (ver «Pendientes técnicos»).
- **Error:** si falla una acción (`Result.ok===false`), aparece un toast con `result.error` y la fila vuelve a su estado. Si falla la actualización periódica, se muestra un banner `bg-bad/10` con el texto «No se pudieron actualizar los datos.» y el botón [Reintentar] (`actions.refresh()`).
- **Tablet (md–lg):** StatTiles en 2×2; cola y atención apiladas, con la atención arriba porque es lo urgente. **Móvil (<md):** StatTiles en una fila horizontal desplazable (`no-scrollbar`, `snap-x`); acciones rápidas en una barra fija inferior de 3 botones de `h-12`.

### 7.2 Circulación
**Propósito:** registrar préstamos, devoluciones y entregas de reserva a la velocidad de la pistola.

```
┌ Circulación ─────────────────────────────────────────────────────────┐
│ [ Préstamo F1 | Devolución F2 | Entrega de reserva F3 ]  (Segmented) │
│ ┌ ScanPanel (7 col) ─────────────────┐ ┌ ResultCard (5 col) ───────┐ │
│ │ Carnet del usuario  [ 20231234   ] │ │ ✓ Préstamo registrado     │ │
│ │  ✓ Ana Ruiz · Ingeniería · 1/3     │ │ Cálculo I · EJ-0042       │ │
│ │ Código del ejemplar [▌          ]  │ │ Ana Ruiz · 20231234       │ │
│ │ [Usar cámara]  Listo para leer…    │ │ ◷ Vence 06 dic 18:00      │ │
│ └────────────────────────────────────┘ │ [Imprimir] [Nueva lectura]│ │
│                                        └───────────────────────────┘ │
│ ▸ Multas pendientes (2)        ▸ Registrar incidencia                │
└──────────────────────────────────────────────────────────────────────┘
```
- **Jerarquía:** modo → ScanPanel → ResultCard → secciones plegables (Multas pendientes, Incidencias), que se pliegan con `<details>` o un disclosure para no competir con el escáner.
- **Acción principal:** la lectura en sí. El botón «Registrar préstamo / Registrar devolución / Entregar reserva» envía lo escrito a mano y es el único botón índigo.
- **Préstamo en dos pasos:** 1) carnet. Al reconocerlo se muestra una línea con el usuario y StatusPill (`ok` «Activo · 1 de 3 préstamos», `bad` «Bloqueado», `bad` «Multa pendiente S/ x») y el foco pasa al ejemplar. 2) ejemplar. Después del préstamo, el carnet se mantiene 60 s para encadenar varios libros. Se borra con «Cambiar usuario» o `Esc`.
- **Resultado:** el ResultCard sustituye al diálogo actual. El diálogo de recibo se abre solo con «Imprimir» (`.print-area`). Si en una devolución hay multa, el ResultCard es `warn` y muestra el botón «Cobrar multa» (`actions.payFine`).
- **Vacío:** el ResultCard en reposo muestra «Escanea un ejemplar para empezar.» con icono `ScanLine` en `muted`. Multas: «No hay multas pendientes.»
- **Carga:** mientras la promesa está pendiente, el ScanPanel muestra la línea `qr-scan`, el input queda `aria-busy` y el botón dice «Registrando…» deshabilitado. Las lecturas que lleguen durante ese tiempo se ignoran.
- **Error:** sacudida, StatusPill `bad` dentro del ScanPanel con `result.error` y el código leído, y el input se selecciona entero para la siguiente lectura. El error se repite en `aria-live="assertive"`. Si el carnet no se reconoce: «Carnet no reconocido. Revisa el código o busca por nombre.»
- **Tablet:** ScanPanel arriba a ancho completo y ResultCard debajo; botones `h-12`. **Móvil:** se abre la cámara por defecto, el ResultCard aparece como hoja inferior (`sheet`) y el Segmented se ve completo con etiquetas cortas («Prestar», «Devolver», «Entregar»).

### 7.3 Reservas
**Propósito:** preparar ejemplares y controlar los retiros.

```
┌ Reservas ─────────────── [Buscar ticket/usuario] [Mostrar cerradas ☐] ┐
│ ┌ Por preparar (7) ◷ ┐ ┌ Listas (4) ✓ ──┐ ┌ Cerradas ───────────────┐ │
│ │ ResultCard compacta │ │ RES-0009        │ │ Entregado · Expirado ·  │ │
│ │ RES-0012 Cálculo I  │ │ Física II       │ │ Cancelado (plegada)     │ │
│ │ Ana R. ◷ 10:00      │ │ ✓ Locker 12     │ │                         │ │
│ │ [Marcar lista][Ubicar]│ │ ◷ Caduca 18:00  │ │                         │ │
│ └─────────────────────┘ └─────────────────┘ └─────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```
- **Columnas:** «Por preparar» (`pending`, warn), «Listas para recoger» (`ready`, ok) y «Cerradas», que agrupa `collected`, `expired` y `cancelled`, está plegada por defecto y muestra un StatusPill por estado. Así se pasa de 5 columnas a 2+1 y se gana ancho útil.
- **Orden:** por `pickupAt` ascendente en preparar y por `expiresAt` ascendente en listas.
- **Acción principal:** «Marcar lista» en cada tarjeta de «Por preparar». «Ubicar» es secundaria (`focusBook(id,'mapa')`) y «Cancelar» es fantasma con confirmación en un diálogo: «¿Cancelar la reserva RES-0012? El estudiante recibirá un aviso.»
- **Vacío por columna:** «Nada por preparar.» / «No hay reservas esperando retiro.» Si todo está vacío, EmptyState: «No hay reservas activas.»
- **Carga:** 3 Skeleton `h-32` por columna.
- **Error:** toast con `result.error`; la tarjeta vuelve a su columna con una sacudida (o sin ella si se reduce el movimiento).
- **Tablet:** 2 columnas visibles y «Cerradas» debajo. **Móvil:** una columna a la vez con un Segmented «Por preparar (7) | Listas (4) | Cerradas», con los botones de tarjeta a ancho completo.

### 7.4 Ubicación
**Propósito:** encontrar un ejemplar en la sala.

```
┌ Ubicación ──────────────── [Sala A | Sala B | Sala C] [Buscar título] ┐
│ ┌ Libro en foco ────────────────────────────────────────────────────┐ │
│ │ Cálculo I · Sala A · Estante 3 · Fila 2 · Columna 5  [Ver ficha]  │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌ Estante 1 ┐ ┌ Estante 2 ┐ ┌ Estante 3 ┐                              │
│ │ ShelfGrid │ │ ShelfGrid │ │ ShelfGrid │  (5×8, celda activa índigo)  │
│ └───────────┘ └───────────┘ └───────────┘                              │
│ ┌ Títulos en la celda 2.5 ─ lista con StatusPill de disponibilidad ┐   │
└────────────────────────────────────────────────────────────────────────┘
```
- **Jerarquía:** libro en foco (si hay) → selector de sala (Segmented, uno a la vez en lugar de los 3 pabellones apilados) → estantes → lista de títulos de la celda seleccionada.
- **Acción principal:** si llegó desde Reservas, «Marcar lista» de la reserva asociada a ese libro; si no, la búsqueda. La sala del libro en foco se selecciona sola y se hace scroll hasta su estante.
- **Lista de títulos:** cada título lleva StatusPill «N disponibles» (`ok`), «Todos prestados» (`warn`) o «En mantenimiento» (`bad`), calculado con `availableCopies` y `isLendable`.
- **Vacío:** «Esta sala no tiene ejemplares físicos registrados.» Celda vacía: deshabilitada con `aria-label` «Fila 2, columna 5: sin títulos».
- **Carga:** 6 Skeleton `h-48`. **Error:** banner con Reintentar (igual que en Hoy).
- **Tablet:** 2 estantes por fila. **Móvil:** un estante por pantalla con desplazamiento horizontal con `snap`, y la lista de títulos en una hoja inferior. Las celdas de 40 px mínimo muestran solo el punto de estado, sin la etiqueta `F.C`.

## 8. Componentes
Todos viven en `src/features/librarian/components/` (o en `components/ui` si se reutilizan), se basan en `Card`, `Badge`, `Button` y `cn`, y solo usan tokens.

### StatTile
```ts
type StatTone = 'primary' | 'ok' | 'warn' | 'bad' | 'neutral'
interface StatTileProps {
  label: string            // sobretítulo: "Por preparar"
  value: number            // cifra real
  tone: StatTone           // colorea icono y barra lateral de 4 px
  icon: LucideIcon
  hint?: string            // "Próxima a las 10:00"
  onClick?: () => void     // si existe, se renderiza como <button>
  loading?: boolean        // muestra Skeleton
}
```
- **Variantes:** `tone` (5); interactiva o estática. Si `value===0`, el tono pasa a `neutral` (no hay alerta con cero).
- **Accesibilidad:** `aria-label="7 reservas por preparar"`; la cifra es `tabular`.

### StatusPill
```ts
type Status = 'ready' | 'soon' | 'late' | 'blocked' | 'info' | 'done'
interface StatusPillProps {
  status: Status
  children: ReactNode      // texto obligatorio: "Vence en 2 días"
  size?: 'sm' | 'md'       // sm = text-xs h-6, md = text-[13px] h-7
}
```
- **Mapa fijo:** ready→ok + `CheckCircle2`; soon→warn + `Clock`; late→bad + `AlertTriangle`; blocked→bad + `Ban`; info→primary + `Info`; done→neutral + `Circle`.
- Es una extensión de `Badge`: el icono es obligatorio y es `aria-hidden`; el texto es el que se lee.

### ScanPanel
```ts
type ScanMode = 'loan' | 'return' | 'reservation'
type ScanState = 'idle' | 'busy' | 'accepted' | 'warning' | 'rejected'
interface ScanPanelProps {
  mode: ScanMode
  state: ScanState
  message?: string          // texto del estado actual
  onScan: (code: string) => void
  userSlot?: ReactNode      // paso de carnet (solo en préstamo)
  autoFocus?: boolean       // default true; recupera el foco tras cada resultado
  cameraDefault?: boolean   // true en móvil
}
```
- Envuelve `QrScanner` (no se reescribe la lectura) y añade borde y animación según `state`: idle `border-line`, busy línea `qr-scan`, accepted pulso ok, warning pulso warn, rejected sacudida + `border-bad`.
- Tiene una región `aria-live` («polite» para accepted, «assertive» para rejected).

### ResultCard
```ts
interface ResultCardProps {
  tone: 'ok' | 'warn' | 'bad' | 'neutral'
  title: string                     // "Préstamo registrado"
  book?: { title: string; copyId: string | null }
  user?: { name: string; code: string }
  meta?: { label: string; value: string; status?: Status }[]  // Vence, Mora…
  actions?: ReactNode               // máx. 1 principal + 2 secundarias
  variant?: 'full' | 'compact'      // full = Circulación; compact = tarjeta de Reservas/Hoy
  onDismiss?: () => void
}
```
- `full`: `p-6`, `shadow-pop` al aparecer. `compact`: `p-4`, sin sombra extra, con código de ticket en mono.
- El estado en reposo (Circulación vacía) se resuelve con `tone='neutral'` y el texto guía.

### KanbanColumn
```ts
interface KanbanColumnProps {
  title: string
  count: number
  tone: 'warn' | 'ok' | 'neutral'
  icon: LucideIcon
  emptyText: string
  collapsible?: boolean      // "Cerradas"
  defaultOpen?: boolean
  loading?: boolean
  children: ReactNode        // ResultCard compact
}
```
- La cabecera es pegajosa dentro de la columna, con un contador `tabular` en StatusPill. Es un `<section aria-labelledby>` y las tarjetas forman una lista (`<ul>`).
- No hay arrastrar y soltar: los cambios de estado se hacen con botones, porque es más accesible y equivale a las acciones actuales.

### ShelfGrid
```ts
interface ShelfCell { row: number; col: number; titles: Book[] }
interface ShelfGridProps {
  pavilion: Pavilion
  shelf: number
  rows: number               // SHELF_ROWS
  cols: number               // SHELF_COLS
  cells: ShelfCell[]
  focusBookId: string | null
  selected?: { row: number; col: number }
  onSelect: (cell: ShelfCell) => void
  density?: 'comfortable' | 'compact'   // compact en móvil: solo punto
}
```
- **Estados de celda:** vacía (`bg-surface-2`, deshabilitada), con títulos (`bg-accent/10 text-accent`), seleccionada (`ring-2 ring-accent`) y en foco (`bg-primary text-white` + pulso una vez).
- **Teclado:** `role="grid"` con flechas para moverse, Enter para seleccionar y `tabindex` itinerante (una sola parada de Tab por estante).

## 9. Guía de textos
- **Botones = verbo en infinitivo + objeto:** «Registrar préstamo», «Registrar devolución», «Entregar reserva», «Marcar lista», «Ubicar ejemplar», «Cobrar multa», «Cancelar reserva», «Reintentar», «Cambiar usuario», «Imprimir recibo». No usar «OK», «Aceptar» ni «Enviar».
- **Confirmaciones = participio + dato:** «Préstamo registrado · vence 06 dic», «Devolución registrada · sin multa», «Reserva lista para recoger».
- **Errores = qué pasó + qué hacer:** «Carnet no reconocido. Revisa el código o busca por nombre.» Si el backend da su propio mensaje (`result.error`), se muestra tal cual, sin culpar al usuario.
- **Estados = adjetivo o plazo concreto:** «Vence en 2 días», «3 días de atraso», «Caduca hoy 18:00», «Bloqueado». Nada de «Pronto» ni «Pendiente» sin plazo.
- **Vacíos = situación + siguiente paso:** «Nada por preparar. Escanea un ejemplar para empezar (F1).»
- Se trata al usuario de tú y se escribe en frases cortas, sin signos de exclamación. Las fechas van con `fmtDateTime` y el dinero con `money()`.
- Los nombres de estado de reserva siguen `RESERVATION_STATUS`, salvo «Buscando en estantería», que en la vista del bibliotecario pasa a ser «Por preparar» (la del estudiante no se toca).

## 10. Accesibilidad y modo oscuro (lista para revisar)
- [ ] Todo estado lleva icono y texto; nada depende solo del color.
- [ ] Foco visible (`:focus-visible` con `accent`) y orden de Tab lógico; el escáner recupera el foco.
- [ ] `aria-live` en ScanPanel; `aria-current` en la navegación; `aria-busy` durante la carga.
- [ ] Probado con `.dark`: sin colores fijos fuera de tokens (sustituir `LIGHT_DOT` de AppShell solo si afecta al bibliotecario).
- [ ] Movimiento reducido: sin desplazamientos y con la misma información.
- [ ] Objetivos táctiles de 40 px, y de 48 px en la acción principal en tablet y móvil.

## 11. Pendientes técnicos para Codex
- El store no tiene una bandera de carga ni de error de actualización. Si se necesita, se añade un estado `loading/refreshError` en `LibraryProvider` sin cambiar las acciones. Si no, el estado de carga solo se usa en las acciones en curso.
- Añadir `hoy` a `NAV.librarian` (en `src/lib/access.ts`) y a `VIEWS.librarian` (en `AppShell.tsx`). Comprobar que `homeView('librarian')` devuelve `hoy`.
- Pasar el modo de Circulación desde los atajos: estado en el store (`view` + modo) o un evento. Codex elige la opción más simple.

