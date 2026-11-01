import type { ReactNode } from 'react'
import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmarEliminacionDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  titulo: string
  descripcion: ReactNode
  /** Texto del botón que confirma la baja. */
  textoConfirmar?: string
  pendiente?: boolean
  onConfirmar: () => void
}

/**
 * Confirmación reutilizable para acciones destructivas. El padre controla la
 * mutación y pasa `pendiente` para bloquear los botones mientras se ejecuta.
 */
export function ConfirmarEliminacionDialog({
  abierto,
  onOpenChange,
  titulo,
  descripcion,
  textoConfirmar = 'Eliminar',
  pendiente = false,
  onConfirmar,
}: ConfirmarEliminacionDialogProps) {
  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor && !pendiente) onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription asChild>
            <div>{descripcion}</div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pendiente}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirmar}
            disabled={pendiente}
          >
            {pendiente ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            {pendiente ? 'Eliminando…' : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
