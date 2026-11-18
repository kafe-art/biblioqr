import { useState } from 'react'
import { hash } from '../lib/format'
import type { Book } from '../lib/types'
import { cn } from './ui/primitives'

/** Portada real desde Open Library (por ISBN). Mientras carga —o si no existe—
 *  se muestra una portada tipográfica generada a partir del título. */
export function BookCover({ book, className }: { book: Pick<Book, 'title' | 'author' | 'isbn' | 'coverUrl'>; className?: string }) {
  const src = book.coverUrl || (book.isbn ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false` : null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const hue = hash(book.title) % 360

  return (
    <div
      role="img"
      aria-label={`Portada de ${book.title}`}
      className={cn('relative aspect-[2/3] overflow-hidden rounded-lg shadow-[0_8px_20px_-8px_rgb(15_23_42/0.45)]', className)}
      style={{ background: `linear-gradient(155deg, hsl(${hue} 52% 40%), hsl(${(hue + 45) % 360} 58% 20%))` }}
    >
      <div className="absolute inset-0 flex flex-col justify-between p-[10%] text-white" aria-hidden>
        <span className="line-clamp-4 text-[clamp(0.7rem,0.9em,1.1rem)] leading-tight font-semibold tracking-tight">{book.title}</span>
        <span className="line-clamp-2 text-[0.68em] opacity-80">{book.author}</span>
      </div>
      {src && state !== 'error' && (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-500', state === 'ok' ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {/* Lomo y brillo para dar volumen */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/30 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/10 ring-inset" aria-hidden />
    </div>
  )
}
