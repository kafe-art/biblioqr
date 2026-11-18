import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '../../components/ui/overlays'
import { Badge, Button, Card, Field, SectionTitle, inputCls } from '../../components/ui/primitives'
import { FACULTIES, PAVILIONS } from '../../data/seed'
import { downloadCsv, parseCsv } from '../../lib/format'
import { availableCopies } from '../../lib/rules'
import type { Book, BookFormat, Condition, Faculty, Pavilion, Result } from '../../lib/types'
import { useLibrary, type BookInput } from '../../store/library'

const FORMATS: Record<BookFormat, string> = { fisico: 'Físico', digital: 'Digital', ambos: 'Físico y digital' }
const CONDITIONS: Condition[] = ['excelente', 'regular', 'mantenimiento', 'baja']
const CSV_HEADERS = ['isbn', 'title', 'author', 'year', 'genre', 'faculties', 'synopsis', 'format', 'pages', 'pavilion', 'copies', 'coverUrl']
const emptyInput = (): BookInput => ({ isbn: '', title: '', author: '', year: new Date().getFullYear(), genre: '', faculties: [], synopsis: '', format: 'fisico', pages: 0, pavilion: 'A', copies: 1, coverUrl: '' })

function validate(input: BookInput): string | null {
  if (!input.title.trim() || !input.author.trim()) return 'Título y autor son obligatorios.'
  if (!Number.isInteger(input.year) || input.year < 1 || input.year > new Date().getFullYear() + 1) return 'El año no es válido.'
  if (!Number.isInteger(input.pages) || input.pages < 0) return 'Las páginas deben ser un entero no negativo.'
  if (!Number.isInteger(input.copies) || input.copies < 0 || input.copies > 1000 || (input.format !== 'digital' && input.copies < 1)) return 'Indica entre 1 y 1000 ejemplares físicos; para digital se permite 0.'
  if (!(input.format in FORMATS) || !(input.pavilion in PAVILIONS)) return 'Formato o pabellón no válido.'
  if (input.faculties.some((f) => !FACULTIES.includes(f))) return 'Facultad no reconocida.'
  if (input.coverUrl) { try { if (!['https:', 'http:'].includes(new URL(input.coverUrl).protocol)) return 'La portada debe usar una URL HTTP o HTTPS.' } catch { return 'La URL de la portada no es válida.' } }
  return null
}

export function CatalogView() {
  const { books, focusBookId, actions } = useLibrary()
  const [query, setQuery] = useState('')
  const [input, setInput] = useState<BookInput | null>(null)
  const [editingId, setEditingId] = useState<string>()
  const [deleting, setDeleting] = useState<Book | null>(null)
  const [importing, setImporting] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const notify = async (pending: Promise<Result<unknown>>, text: string) => { const r = await pending; if (!r.ok) { toast.error(r.error); return false } toast.success(text); return true }
  const edit = (book: Book) => { setEditingId(book.id); setInput({ isbn: book.isbn, title: book.title, author: book.author, year: book.year, genre: book.genre, faculties: [...book.faculties], synopsis: book.synopsis, format: book.format, pages: book.pages, pavilion: book.location.pavilion, copies: book.copies.length, coverUrl: book.coverUrl ?? '' }) }
  useEffect(() => { if (focusBookId) { const b = books.find((b) => b.id === focusBookId); if (b) edit(b); actions.focusBook(null) } }, [focusBookId, books, actions])
  const change = <K extends keyof BookInput,>(key: K, value: BookInput[K]) => setInput((prev) => prev ? { ...prev, [key]: value } : prev)
  const importFile = async (source: File) => {
    setImporting(true)
    try {
      if (source.size > 5 * 1024 * 1024) throw new Error('El CSV debe pesar como máximo 5 MB.')
      const [headers, ...rows] = parseCsv(await source.text())
      if (!headers || !rows.length) throw new Error('El CSV no contiene filas de datos.')
      if (CSV_HEADERS.slice(0, -1).some((h) => !headers.includes(h))) throw new Error(`Columnas requeridas: ${CSV_HEADERS.slice(0, -1).join(', ')}`)
      const inputs = rows.map((cells, i) => {
        const get = (key: string) => cells[headers.indexOf(key)]?.trim() ?? ''
        const next: BookInput = { isbn: get('isbn'), title: get('title'), author: get('author'), year: Number(get('year')), genre: get('genre'), faculties: get('faculties').split('|').filter(Boolean) as Faculty[], synopsis: get('synopsis'), format: get('format') as BookFormat, pages: Number(get('pages')), pavilion: get('pavilion') as Pavilion, copies: Number(get('copies')), coverUrl: get('coverUrl') }
        const error = validate(next)
        if (error) throw new Error(`Fila ${i + 2}: ${error}`)
        return next
      })
      const r = await actions.importBooks(inputs)
      if (r.ok) toast.success(`${r.data.created} títulos importados; ${r.data.skipped} omitidos`)
      else toast.error(r.error)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo importar el CSV.') }
    finally { setImporting(false); if (file.current) file.current.value = '' }
  }
  const visible = books.filter((b) => `${b.title} ${b.author} ${b.isbn}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="space-y-5"><SectionTitle title="Catálogo e inventario" hint={`${books.length} títulos registrados`} action={<Button onClick={() => { setEditingId(undefined); setInput(emptyInput()) }}>Nuevo título</Button>} />
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-60 flex-1"><Field label="Buscar título, autor o ISBN">{(id) => <input id={id} type="search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} />}</Field></div><Button variant="secondary" onClick={() => downloadCsv('plantilla-catalogo.csv', [CSV_HEADERS])}>Plantilla CSV</Button><Button variant="secondary" disabled={importing} onClick={() => file.current?.click()}>{importing ? 'Importando…' : 'Importar CSV'}</Button><input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Archivo CSV del catálogo" onChange={(e) => { const source = e.target.files?.[0]; if (source) void importFile(source) }} /></div>
    <p className="text-xs text-muted">CSV: formato fisico/digital/ambos, pabellón A/B/C; separa facultades con |. Se valida el archivo completo antes de importar.</p>
    <div className="space-y-3">{visible.map((book) => <Card key={book.id} className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{book.title}</h3><p className="text-sm text-muted">{book.author} · {book.isbn} · {FORMATS[book.format]}</p><Badge tone="ok">{availableCopies(book).length} disponibles</Badge></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => edit(book)}>Editar</Button><Button size="sm" variant="danger" onClick={() => setDeleting(book)}>Eliminar</Button><Button size="sm" onClick={() => notify(actions.addCopy(book.id), 'Ejemplar añadido')}>Añadir ejemplar</Button></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{book.copies.map((copy) => <Field key={copy.id} label={`${copy.id} · ${copy.status === 'available' ? 'Disponible' : copy.status === 'loaned' ? 'Prestado' : 'Reservado'}`}>{(id) => <select id={id} className={inputCls} value={copy.condition} onChange={(e) => notify(actions.setCopyCondition(copy.id, e.target.value as Condition), 'Condición actualizada')}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>}</Field>)}</div></Card>)}</div>{!visible.length && <p className="text-muted">No se encontraron títulos.</p>}
    <Dialog open={!!input} onOpenChange={(open) => { if (!open) setInput(null) }} title={editingId ? 'Editar título' : 'Nuevo título'} description="Completa la ficha bibliográfica y la ubicación del título.">
      {input && <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const error = validate(input); if (error) { toast.error(error); return } if (await notify(actions.saveBook(input, editingId), 'Ficha guardada')) setInput(null) }}>
        {(['title', 'author', 'isbn', 'genre', 'coverUrl'] as const).map((key) => <Field key={key} label={{ title: 'Título', author: 'Autor', isbn: 'ISBN', genre: 'Género', coverUrl: 'URL de portada' }[key]}>{(id) => <input id={id} className={inputCls} required={key === 'title' || key === 'author'} value={input[key] ?? ''} onChange={(e) => change(key, e.target.value)} />}</Field>)}
        <div className="grid grid-cols-2 gap-3">{(['year', 'pages', 'copies'] as const).map((key) => <Field key={key} label={{ year: 'Año', pages: 'Páginas', copies: 'Ejemplares iniciales' }[key]}>{(id) => <input id={id} type="number" className={inputCls} min={key === 'year' ? 1 : 0} max={key === 'copies' ? 1000 : undefined} step="1" required disabled={key === 'copies' && !!editingId} value={input[key]} onChange={(e) => change(key, e.target.valueAsNumber)} />}</Field>)}</div>
        <Field label="Formato">{(id) => <select id={id} className={inputCls} value={input.format} onChange={(e) => change('format', e.target.value as BookFormat)}>{Object.entries(FORMATS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}</Field>
        <Field label="Pabellón">{(id) => <select id={id} className={inputCls} value={input.pavilion} onChange={(e) => change('pavilion', e.target.value as Pavilion)}>{Object.entries(PAVILIONS).map(([key, p]) => <option key={key} value={key}>{key} · {p.name}</option>)}</select>}</Field>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Facultades</legend>{FACULTIES.map((f) => <label key={f} className="flex gap-2 text-sm"><input type="checkbox" checked={input.faculties.includes(f)} onChange={(e) => change('faculties', e.target.checked ? [...input.faculties, f] : input.faculties.filter((v) => v !== f))} />{f}</label>)}</fieldset>
        <Field label="Sinopsis">{(id) => <textarea id={id} className={`${inputCls} h-24 py-2`} value={input.synopsis} onChange={(e) => change('synopsis', e.target.value)} />}</Field><Button type="submit">Guardar ficha</Button>
      </form>}
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null) }} title="Eliminar título" description="Esta acción retira la ficha y sus ejemplares del catálogo."><p className="mb-4">¿Eliminar «{deleting?.title}»?</p><Button variant="danger" onClick={async () => { if (deleting && await notify(actions.deleteBook(deleting.id), 'Título eliminado')) setDeleting(null) }}>Confirmar eliminación</Button></Dialog>
  </div>
}
