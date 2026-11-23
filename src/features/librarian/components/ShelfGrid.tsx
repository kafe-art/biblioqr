import { useRef, useState, type KeyboardEvent } from 'react'
import { Card, cn } from '../../../components/ui/primitives'
import type { Book, Pavilion } from '../../../lib/types'

export interface ShelfCell { row: number; col: number; titles: Book[] }
interface Props { pavilion: Pavilion; shelf: number; rows: number; cols: number; cells: ShelfCell[]; focusBookId: string | null; selected?: { row: number; col: number }; onSelect: (cell: ShelfCell) => void; density?: 'comfortable' | 'compact' }
export function ShelfGrid({ pavilion, shelf, rows, cols, cells, focusBookId, selected, onSelect, density = 'comfortable' }: Props) {
  const [cursor, setCursor] = useState<number | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const index = (row: number, col: number) => (row - 1) * cols + col - 1
  const occupied = new Map(cells.filter(c => c.titles.length).map(c => [index(c.row, c.col), c]))
  const first = occupied.has(cursor ?? -1) ? cursor : selected ? index(selected.row, selected.col) : [...occupied.keys()].sort((a,b) => a-b)[0]
  const move = (e: KeyboardEvent, i: number) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: cols, ArrowUp: -cols }
    const step = steps[e.key]
    if (!step) return
    e.preventDefault()
    for (let next = i + step; next >= 0 && next < cols * rows; next += step) {
      if (Math.abs(step) === 1 && Math.floor(next / cols) !== Math.floor(i / cols)) break
      if (occupied.has(next)) { grid.current?.querySelector<HTMLButtonElement>('[data-cell="' + next + '"]')?.focus(); break }
    }
  }
  return <Card id={'shelf-' + pavilion + shelf} className="min-w-0 snap-center scroll-mt-36 space-y-2 p-4">
    <h3 className="font-semibold">Estante {shelf}</h3>
    <div ref={grid} role="grid" aria-label={'Sala ' + pavilion + ', estante ' + shelf} className="space-y-1 overflow-x-auto py-1">
      {Array.from({ length: rows }, (_, r) => <div role="row" key={r} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(' + cols + ', minmax(40px, 1fr))' }}>
        {Array.from({ length: cols }, (_, c) => {
          const i = index(r+1,c+1), cell = occupied.get(i)
          const focus = cell?.titles.some(b => b.id === focusBookId)
          const active = selected?.row === r+1 && selected.col === c+1
          return <div key={c} role="gridcell" aria-selected={active}><button type="button" data-cell={i} disabled={!cell} tabIndex={i === first ? 0 : -1}
            aria-label={'Fila ' + (r+1) + ', columna ' + (c+1) + ': ' + (cell?.titles.map(b => b.title).join(', ') || 'sin títulos')}
            onKeyDown={e => move(e,i)} onFocus={() => setCursor(i)} onClick={() => cell && onSelect(cell)}
            className={cn('grid h-10 w-full place-items-center rounded-lg text-xs', active && 'ring-2 ring-accent ring-inset', focus ? 'animate-[pulse-ring_600ms_ease-out_1] bg-primary text-white' : cell ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-muted')}>
            <span aria-hidden className={density === 'compact' ? 'hidden' : 'hidden md:inline'}>{r+1}.{c+1}</span><span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', cell && 'bg-current', density !== 'compact' && 'md:hidden')} />
          </button></div>
        })}
      </div>)}
    </div>
  </Card>
}
