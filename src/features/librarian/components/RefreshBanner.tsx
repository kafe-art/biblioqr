import { AlertTriangle } from 'lucide-react'
import { Button } from '../../../components/ui/primitives'
import { useLibrary } from '../../../store/library'

export function RefreshBanner() {
  const { refreshError, actions } = useLibrary()
  return refreshError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-bad/10 p-4 text-bad"><AlertTriangle aria-hidden size={18} />No se pudieron actualizar los datos.<Button variant="secondary" onClick={() => void actions.refresh().catch(() => {})}>Reintentar</Button></div>
}
