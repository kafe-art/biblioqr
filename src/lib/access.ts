import { BarChart3, BookCopy, BookOpen, KanbanSquare, Library, Map, ScanLine, ScrollText, Users, type LucideIcon } from 'lucide-react'
import type { Role } from './types'
import type { Permission } from '../../shared/access'
export { PERMISSIONS, can, ROLE_LABEL } from '../../shared/access'
export type { Permission } from '../../shared/access'

/** ───────────── Control de acceso (RBAC) ─────────────
 *  1. Cada rol tiene una lista cerrada de permisos.
 *  2. La navegación se deriva de esos permisos (un rol no ve vistas ajenas).
 *  3. El backend vuelve a validar el permiso en cada acción.
 *  La navegación y los middlewares consumen shared/access.ts. */

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  permission: Permission
}

export const NAV: Record<Role, NavItem[]> = {
  student: [
    { id: 'inicio', label: 'Descubrir', icon: BookOpen, permission: 'catalog:read' },
    { id: 'casillero', label: 'Mi casillero', icon: Library, permission: 'loan:renew' },
  ],
  librarian: [
    { id: 'circulacion', label: 'Circulación', icon: ScanLine, permission: 'circulation:write' },
    { id: 'reservas', label: 'Reservas', icon: KanbanSquare, permission: 'reservation:manage' },
    { id: 'mapa', label: 'Ubicación', icon: Map, permission: 'inventory:locate' },
  ],
  admin: [
    { id: 'analitica', label: 'Analítica', icon: BarChart3, permission: 'analytics:read' },
    { id: 'usuarios', label: 'Usuarios', icon: Users, permission: 'user:manage' },
    { id: 'catalogo', label: 'Catálogo', icon: BookCopy, permission: 'catalog:write' },
    { id: 'auditoria', label: 'Auditoría', icon: ScrollText, permission: 'audit:read' },
  ],
}

export const homeView = (role: Role) => NAV[role][0].id
