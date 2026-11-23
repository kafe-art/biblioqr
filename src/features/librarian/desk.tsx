import { createContext, useContext, useSyncExternalStore } from 'react'
const mobileQuery = '(max-width: 767px)'
function subscribeMobile(update: () => void) {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
export const useMobile = () => useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false)
export const bottomSheet = 'top-auto! bottom-0! left-0! w-full! max-w-none! translate-x-0! translate-y-0! rounded-b-none!'
export type ScanMode = 'loan' | 'return' | 'reservation'
export type ReservationGroup = 'pending' | 'ready' | 'closed'
export const modes = [
  { value: 'loan', label: 'Préstamo', short: 'Prestar', key: 'F1' },
  { value: 'return', label: 'Devolución', short: 'Devolver', key: 'F2' },
  { value: 'reservation', label: 'Entrega de reserva', short: 'Entregar', key: 'F3' },
] as const
export interface DeskRequest { mode?: ScanMode; group?: ReservationGroup; reservationId?: string }
export const DeskContext = createContext({ request: {} as DeskRequest, go: (_view: string, _request?: DeskRequest, _book?: string) => {} })
export const useDesk = () => useContext(DeskContext)
export function Shortcut({ children }: { children: string }) {
  return <kbd className="rounded-lg border border-current/25 px-1 font-mono text-xs max-md:hidden [@media(pointer:coarse)]:hidden">{children}</kbd>
}
