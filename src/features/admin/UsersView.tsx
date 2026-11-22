import { useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, SectionTitle, inputCls } from '../../components/ui/primitives'
import { ROLE_LABEL } from '../../lib/access'
import { fmtDateTime } from '../../lib/format'
import type { Role } from '../../lib/types'
import { useLibrary, type UserBulkOp } from '../../store/library'

export function UsersView() {
  const { users, actions } = useLibrary()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [role, setRole] = useState<Role>('student')
  const visible = users.filter((u) => `${u.name} ${u.email} ${u.code}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const all = visible.length > 0 && visible.every((u) => selected.includes(u.id))
  const [grant, setGrant] = useState({ email: '', name: '', role: 'librarian' as Role })
  const [granting, setGranting] = useState(false)
  const submitGrant = async (event: FormEvent) => {
    event.preventDefault()
    setGranting(true)
    const result = await actions.grantAccess(grant.email.trim(), grant.name.trim(), grant.role)
    setGranting(false)
    if (!result.ok) { toast.error(result.error); return }
    toast.success(grant.role === 'student' ? `Acceso registrado para ${result.data.email}` : `Acceso otorgado a ${result.data.email}. Debe crear su contraseña desde «Personal → ¿Primera vez?».`)
    setGrant({ email: '', name: '', role: grant.role })
  }
  const apply = async (op: UserBulkOp) => { const result = await actions.bulkUsers(selected, op); if (!result.ok) toast.error(result.error); else { toast.success(`Acción aplicada a ${result.data} usuario(s)`); setSelected([]) } }
  return <div className="space-y-5"><SectionTitle title="Gestión de usuarios" hint={`${users.length} cuentas · ${selected.length} seleccionadas`} /><Card className="p-4"><form onSubmit={submitGrant} className="flex flex-wrap items-end gap-3"><div className="w-full"><p className="flex items-center gap-2 font-semibold"><UserPlus size={17} /> Dar acceso</p><p className="mt-0.5 text-sm text-muted">El personal entra con su correo personal y crea su contraseña con un código enviado a ese correo. Los estudiantes entran solos con su correo institucional.</p></div><div className="min-w-[220px] flex-[2]"><Field label="Correo">{(id) => <input id={id} type="email" required className={inputCls} placeholder="persona@gmail.com" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} />}</Field></div><div className="min-w-[180px] flex-[1.5]"><Field label="Nombre (opcional)">{(id) => <input id={id} className={inputCls} value={grant.name} onChange={(e) => setGrant({ ...grant, name: e.target.value })} />}</Field></div><div className="min-w-[160px] flex-1"><Field label="Rol">{(id) => <select id={id} className={inputCls} value={grant.role} onChange={(e) => setGrant({ ...grant, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}</Field></div><Button type="submit" disabled={granting}>Dar acceso</Button></form></Card><Field label="Buscar por nombre, correo o carnet">{(id) => <input id={id} type="search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} />}</Field>
    <Card className="flex flex-wrap items-end gap-3 p-4"><Button disabled={!selected.length} onClick={() => apply({ type: 'activate' })}>Reactivar</Button><Button variant="danger" disabled={!selected.length} onClick={() => apply({ type: 'block' })}>Bloquear</Button><Button variant="secondary" disabled={!selected.length} onClick={() => apply({ type: 'reset' })}>Restablecer contraseña</Button><Field label="Nuevo rol">{(id) => <select id={id} className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}</Field><Button variant="secondary" disabled={!selected.length} onClick={() => apply({ type: 'role', role })}>Cambiar rol</Button></Card>
    <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Cuentas institucionales y selección para acciones masivas</caption><thead className="bg-surface-2"><tr><th className="p-3"><input type="checkbox" aria-label="Seleccionar todas las cuentas visibles" checked={all} onChange={() => setSelected(all ? selected.filter((id) => !visible.some((u) => u.id === id)) : [...new Set([...selected, ...visible.map((u) => u.id)])])} /></th>{['Usuario', 'Carnet', 'Rol', 'Estado', 'Último acceso'].map((h) => <th scope="col" key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{visible.map((u) => <tr key={u.id} className="border-t border-line"><td className="p-3"><input type="checkbox" aria-label={`Seleccionar a ${u.name}`} checked={selected.includes(u.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, u.id] : selected.filter((id) => id !== u.id))} /></td><td className="p-3">{u.name}<p className="text-xs text-muted">{u.email}</p></td><td className="p-3">{u.code}</td><td className="p-3">{ROLE_LABEL[u.role]}</td><td className="p-3"><Badge tone={u.status === 'active' ? 'ok' : 'bad'}>{u.status === 'active' ? 'Activa' : 'Bloqueada'}</Badge></td><td className="p-3">{fmtDateTime(u.lastAccess)}</td></tr>)}</tbody></table>{!visible.length && <p className="p-5 text-muted">No se encontraron usuarios.</p>}</Card>
  </div>
}
