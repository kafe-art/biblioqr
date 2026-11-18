import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { EmptyState, Field, SectionTitle, inputCls } from '../../components/ui/primitives'
import { FACULTIES } from '../../data/seed'
import { availableCopies } from '../../lib/rules'
import { useLibrary } from '../../store/library'
import { BookCard } from './BookCard'

export function HomeView() {
  const { books } = useLibrary()
  const [query, setQuery] = useState('')
  const [faculty, setFaculty] = useState('')
  const [format, setFormat] = useState('')
  const [available, setAvailable] = useState(false)
  const [sort, setSort] = useState('demand')
  const filtered = books.filter((b) => `${b.title} ${b.author} ${b.isbn}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!faculty || b.faculties.some((f) => f === faculty)) && (!format || b.format === format || b.format === 'ambos') && (!available || availableCopies(b).length > 0)).sort((a, b) => sort === 'demand' ? b.demand - a.demand : sort === 'recent' ? b.addedAt - a.addedAt : a.title.localeCompare(b.title))
  return <div className="space-y-6">
    <SectionTitle title="Descubre tu próxima lectura" hint="Busca, elige y reserva tu ejemplar." />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Título, autor o ISBN">{(id) => <input id={id} className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} type="search" />}</Field>
      <Field label="Facultad">{(id) => <select id={id} className={inputCls} value={faculty} onChange={(e) => setFaculty(e.target.value)}><option value="">Todas</option>{FACULTIES.map((f) => <option key={f}>{f}</option>)}</select>}</Field>
      <Field label="Formato">{(id) => <select id={id} className={inputCls} value={format} onChange={(e) => setFormat(e.target.value)}><option value="">Todos</option><option value="fisico">Físico</option><option value="digital">Digital</option></select>}</Field>
      <Field label="Ordenar por">{(id) => <select id={id} className={inputCls} value={sort} onChange={(e) => setSort(e.target.value)}><option value="demand">Más solicitados</option><option value="recent">Novedades</option><option value="title">Título</option></select>}</Field>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> Solo ejemplares físicos disponibles</label>
    <p className="text-sm text-muted" role="status">{filtered.length} títulos encontrados</p>
    {filtered.length ? <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{filtered.map((b) => <BookCard key={b.id} book={b} />)}</div> : <EmptyState icon={BookOpen} title="Sin coincidencias" description="Prueba con otro título o cambia los filtros." />}
  </div>
}
