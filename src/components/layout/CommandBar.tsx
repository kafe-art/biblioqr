import * as RD from '@radix-ui/react-dialog'
import { ArrowRight, CornerDownLeft, Search, SearchX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NAV, type NavItem } from '../../lib/access'
import { availableCopies, hasDigital, hasPhysical } from '../../lib/rules'
import type { Book } from '../../lib/types'
import { useLibrary } from '../../store/library'
import { BookCover } from '../BookCover'
import { Badge, cn } from '../ui/primitives'

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const ERAS = [
  { id: 'all', label: 'Cualquier año', test: () => true },
  { id: '2015', label: '2015 en adelante', test: (y: number) => y >= 2015 },
  { id: '2000', label: '2000 – 2014', test: (y: number) => y >= 2000 && y < 2015 },
  { id: 'old', label: 'Antes de 2000', test: (y: number) => y < 2000 },
] as const

type Item = { kind: 'book'; id: string; book: Book } | { kind: 'nav'; id: string; nav: NavItem }

const chipCls = (active: boolean) =>
  cn('h-7 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors', active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')

/** Buscador universal (Ctrl/⌘ + K) con autocompletado y filtros facetados.
 *  El destino de un resultado depende del rol: ficha y reserva (estudiante),
 *  ubicación física (bibliotecario) o edición de la ficha (administrador). */
export function CommandBar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { books, user, actions } = useLibrary()
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('Todos')
  const [format, setFormat] = useState<'all' | 'fisico' | 'digital'>('all')
  const [era, setEra] = useState<(typeof ERAS)[number]['id']>('all')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const genres = useMemo(() => ['Todos', ...Array.from(new Set(books.map((b) => b.genre))).sort()], [books])

  const items = useMemo<Item[]>(() => {
    const q = normalize(query.trim())
    const eraTest = ERAS.find((e) => e.id === era)!.test
    const matched = books
      .filter((b) => {
        if (genre !== 'Todos' && b.genre !== genre) return false
        if (format === 'fisico' && !hasPhysical(b)) return false
        if (format === 'digital' && !hasDigital(b)) return false
        if (onlyAvailable && availableCopies(b).length === 0) return false
        if (!eraTest(b.year)) return false
        return !q || normalize(`${b.title} ${b.author} ${b.genre} ${b.isbn} ${b.year}`).includes(q)
      })
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 7)
      .map((book): Item => ({ kind: 'book', id: book.id, book }))
    const navs = user ? NAV[user.role].filter((n) => q && normalize(n.label).includes(q)).map((nav): Item => ({ kind: 'nav', id: nav.id, nav })) : []
    return [...navs, ...matched]
  }, [books, query, genre, format, era, onlyAvailable, user])

  useEffect(() => setActive(0), [items.length, query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const select = (item: Item) => {
    if (item.kind === 'nav') actions.navigate(item.nav.id)
    else if (user?.role === 'librarian') actions.focusBook(item.book.id, 'mapa')
    else if (user?.role === 'admin') actions.focusBook(item.book.id, 'catalogo')
    else actions.focusBook(item.book.id)
    onOpenChange(false)
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      select(items[active])
    }
  }

  const hint = user?.role === 'librarian' ? 'Ubicar en sala' : user?.role === 'admin' ? 'Editar ficha' : 'Ver y reservar'

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="overlay" />
        <RD.Content
          aria-describedby={undefined}
          className="dialog-content fixed top-[12dvh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop focus:outline-none"
        >
          <RD.Title className="sr-only">Buscador universal</RD.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="shrink-0 text-muted" aria-hidden />
            <input
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
              aria-label="Buscar en el catálogo"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Busca por título, autor, género, año o ISBN…"
              className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-muted/70 focus:outline-none"
            />
            <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">Esc</kbd>
          </div>

          <div className="space-y-2 border-b border-line px-4 py-3">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Filtrar por género">
              {genres.map((g) => (
                <button key={g} type="button" aria-pressed={genre === g} onClick={() => setGenre(g)} className={chipCls(genre === g)}>
                  {g}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {([['all', 'Todo formato'], ['fisico', 'Físico'], ['digital', 'E-book']] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={format === id} onClick={() => setFormat(id)} className={chipCls(format === id)}>
                  {label}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-line" aria-hidden />
              <button type="button" aria-pressed={onlyAvailable} onClick={() => setOnlyAvailable((v) => !v)} className={chipCls(onlyAvailable)}>
                Disponible ahora
              </button>
              <select aria-label="Filtrar por año de publicación" value={era} onChange={(e) => setEra(e.target.value as typeof era)} className={cn(chipCls(era !== 'all'), 'bg-surface pr-1')}>
                {ERAS.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </div>
          </div>

          <ul ref={listRef} id="command-results" role="listbox" aria-label="Resultados" className="max-h-[46dvh] overflow-y-auto p-2">
            {items.length === 0 && (
              <li className="flex flex-col items-center px-6 py-10 text-center">
                <SearchX size={24} className="mb-3 text-muted" aria-hidden />
                <p className="text-sm font-medium">Sin coincidencias</p>
                <p className="mt-1 text-sm text-muted">Prueba con otro término o quita algún filtro.</p>
              </li>
            )}
            {items.map((item, i) => (
              <li
                key={item.id}
                id={`cmd-${item.id}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => select(item)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2', i === active && 'bg-surface-2')}
              >
                {item.kind === 'nav' ? (
                  <>
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted"><item.nav.icon size={16} aria-hidden /></span>
                    <span className="flex-1 text-sm font-medium">Ir a {item.nav.label}</span>
                    <ArrowRight size={15} className="text-muted" aria-hidden />
                  </>
                ) : (
                  <>
                    <BookCover book={item.book} className="w-9 shrink-0 rounded-md text-[5px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.book.title}</span>
                      <span className="block truncate text-xs text-muted">{item.book.author} · {item.book.year} · {item.book.genre}</span>
                    </span>
                    <Availability book={item.book} />
                    {i === active && (
                      <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
                        {hint} <CornerDownLeft size={12} aria-hidden />
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

function Availability({ book }: { book: Book }) {
  const n = availableCopies(book).length
  if (n > 0) return <Badge tone="ok" dot>{n} disp.</Badge>
  if (hasDigital(book)) return <Badge tone="primary">E-book</Badge>
  return <Badge tone="bad" dot>Agotado</Badge>
}
