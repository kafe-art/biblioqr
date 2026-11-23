import { useState } from 'react'
import { Card, Field, SectionTitle, inputCls } from '../../components/ui/primitives'
import { fmtFull } from '../../lib/format'
import { useLibrary } from '../../store/library'

export function AuditView() {
  const { audit } = useLibrary()
  const [action, setAction] = useState('')
  const [query, setQuery] = useState('')
  const labels: Record<string, string> = { auth: 'Autenticación', loan: 'Préstamo', return: 'Devolución', renewal: 'Renovación', reservation: 'Reserva', inventory: 'Inventario', fine: 'Multa', user: 'Usuario' }
  const filtered = audit.filter((e) => (!action || e.action === action) && `${e.detail} ${e.actorName} ${e.ip}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="space-y-5"><SectionTitle title="Registro de auditoría" hint={`${filtered.length} eventos · Consulta de solo lectura`} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo de acción">{(id) => <select id={id} className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}><option value="">Todas las acciones</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}</Field><Field label="Buscar actor, detalle o IP">{(id) => <input id={id} type="search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} />}</Field></div><Card className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Eventos de auditoría</caption><thead className="bg-surface-2"><tr>{['Secuencia', 'Fecha', 'Actor', 'Acción', 'Detalle', 'IP'].map((h) => <th scope="col" key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{filtered.map((e) => <tr key={e.id} className="border-t border-line"><td className="p-3">{e.seq}</td><td className="whitespace-nowrap p-3">{fmtFull(e.ts)}</td><td className="p-3">{e.actorName}</td><td className="p-3">{labels[e.action]}</td><td className="min-w-72 p-3">{e.detail}{(e.before != null || e.after != null) && <details><summary>Ver cambios</summary><pre className="whitespace-pre-wrap">{JSON.stringify({ anterior: e.before, nuevo: e.after }, null, 2)}</pre></details>}</td><td className="p-3 font-mono">{e.ip}</td></tr>)}</tbody></table>{!filtered.length && <p className="p-5 text-muted">No hay eventos con estos filtros.</p>}</Card></div>
}
