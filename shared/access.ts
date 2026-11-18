import type { Role } from '../src/lib/types'

export type Permission =
  | 'catalog:read'
  | 'reservation:create'
  | 'loan:renew'
  | 'circulation:write'
  | 'reservation:manage'
  | 'inventory:locate'
  | 'analytics:read'
  | 'user:manage'
  | 'catalog:write'
  | 'fine:waive'
  | 'audit:read'

export const PERMISSIONS: Record<Role, Permission[]> = {
  student: ['catalog:read', 'reservation:create', 'loan:renew'],
  librarian: ['catalog:read', 'circulation:write', 'reservation:manage', 'inventory:locate'],
  admin: ['catalog:read', 'analytics:read', 'user:manage', 'catalog:write', 'fine:waive', 'audit:read'],
}

export const can = (role: Role, permission: Permission) => PERMISSIONS[role].includes(permission)

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Estudiante',
  librarian: 'Bibliotecario',
  admin: 'Administrador',
}

