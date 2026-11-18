import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react'
import { BookmarkPlus, ChevronDown, Heart, Tablet } from 'lucide-react'
import { useState, type PointerEvent } from 'react'
import { toast } from 'sonner'
import { BookCover } from '../../components/BookCover'
import { Badge, Button, cn } from '../../components/ui/primitives'
import { PAVILIONS } from '../../data/seed'
import { availableCopies, hasDigital, hasPhysical } from '../../lib/rules'
import type { Book } from '../../lib/types'
import { useLibrary } from '../../store/library'

/** Chip de disponibilidad en tiempo real (derivado del estado de los ejemplares). */
export function AvailabilityChip({ book }: { book: Book }) {
  const n = availableCopies(book).length
  if (n > 0) return <Badge tone="ok" dot>{n} {n === 1 ? 'ejemplar disponible' : 'ejemplares disponibles'} en {PAVILIONS[book.location.pavilion].name}</Badge>
  if (hasDigital(book)) return <Badge tone="primary"><Tablet size={11} aria-hidden /> {hasPhysical(book) ? 'Solo e-book por ahora' : 'E-book disponible'}</Badge>
  return <Badge tone="bad" dot>Ejemplares agotados</Badge>
}

export function WishlistButton({ bookId, className }: { bookId: string; className?: string }) {
  const { wishlist, user, actions } = useLibrary()
  const saved = !!user && (wishlist[user.id] ?? []).includes(bookId)
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? 'Quitar de Por leer' : 'Guardar en Por leer'}
      onClick={(e) => {
        e.stopPropagation()
        toast(actions.toggleWishlist(bookId) ? 'Guardado en «Por leer»' : 'Quitado de «Por leer»')
      }}
      className={cn('grid h-8 w-8 place-items-center rounded-full transition-[background-color,color,scale] active:scale-90', saved ? 'bg-rose-500 text-white' : 'bg-black/45 text-white backdrop-blur-sm hover:bg-black/65', className)}
    >
      <motion.span key={String(saved)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.6, duration: 0.4 }}>
        <Heart size={15} fill={saved ? 'currentColor' : 'none'} aria-hidden />
      </motion.span>
    </button>
  )
}

/** Tarjeta de libro: portada con inclinación 3D al pasar el cursor, sinopsis
 *  colapsable y acceso directo a la reserva (clic 1 del flujo de 2 clics). */
export function BookCard({ book, className }: { book: Book; className?: string }) {
  const { actions } = useLibrary()
  const [open, setOpen] = useState(false)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(rx, { stiffness: 260, damping: 22 })
  const rotateY = useSpring(ry, { stiffness: 260, damping: 22 })
  const canReserve = availableCopies(book).length > 0
  const digital = hasDigital(book)

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 16)
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 14)
  }
  const reset = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <article className={cn('group flex flex-col', className)}>
      <div className="relative" style={{ perspective: 900 }} onPointerMove={onMove} onPointerLeave={reset}>
        <motion.button type="button" onClick={() => actions.focusBook(book.id)} aria-label={`Ver ficha de ${book.title}`} style={{ rotateX, rotateY }} whileHover={{ y: -6, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="block w-full rounded-lg text-left">
          <BookCover book={book} className="w-full transition-shadow duration-300 group-hover:shadow-[0_28px_44px_-18px_rgb(79_70_229/0.55)]" />
        </motion.button>
        <WishlistButton bookId={book.id} className="absolute top-2 right-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100 [@media(hover:none)]:opacity-100" />
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{book.title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">{book.author}</p>
        <div className="mt-2"><AvailabilityChip book={book} /></div>

        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-2 flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-fg">
          Sinopsis <ChevronDown size={13} className={cn('transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[13px] leading-relaxed text-muted">
              <span className="block pt-1.5">{book.synopsis}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <Button size="sm" variant={canReserve ? 'primary' : 'secondary'} className="mt-3 w-full" style={{ marginTop: 'auto' }} onClick={() => actions.focusBook(book.id)}>
          <BookmarkPlus size={14} aria-hidden />
          {canReserve ? 'Reservar ejemplar' : digital ? 'Ver e-book' : 'Ver ficha'}
        </Button>
      </div>
    </article>
  )
}
