import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './primitives'

/** Modales accesibles sobre Radix Dialog: foco atrapado, cierre con Esc,
 *  `aria-labelledby/-describedby` y retorno de foco al disparador. */

interface OverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

const CloseButton = () => (
  <RD.Close
    aria-label="Cerrar"
    className="absolute top-4 right-4 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
  >
    <X size={18} aria-hidden />
  </RD.Close>
)

export function Dialog({ open, onOpenChange, title, description, children, className }: OverlayProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="overlay" />
        <RD.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'dialog-content fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop focus:outline-none',
            className,
          )}
        >
          <RD.Title className="pr-10 text-lg font-semibold tracking-tight">{title}</RD.Title>
          {description && <RD.Description className="mt-1 text-sm text-muted">{description}</RD.Description>}
          <CloseButton />
          <div className="mt-5">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

/** Hoja lateral (slide-over) para flujos contextuales como la reserva. */
export function Sheet({ open, onOpenChange, title, description, children, className }: OverlayProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="overlay" />
        <RD.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn('sheet-content fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-pop focus:outline-none', className)}
        >
          <header className="border-b border-line px-6 py-4">
            <RD.Title className="pr-10 text-base font-semibold tracking-tight">{title}</RD.Title>
            {description && <RD.Description className="mt-0.5 text-sm text-muted">{description}</RD.Description>}
            <CloseButton />
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
