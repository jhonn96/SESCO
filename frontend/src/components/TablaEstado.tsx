import type { LucideIcon } from 'lucide-react'
import { Inbox, RefreshCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'

interface TablaEstadoProps {
  /** Número de columnas de la tabla, para el `colSpan`. */
  columnas: number
  cargando: boolean
  error?: string | null
  onReintentar?: () => void
  vacio: boolean
  tituloVacio: string
  descripcionVacio?: string
  iconoVacio?: LucideIcon
}

const ANCHOS = ['60%', '40%', '52%', '32%', '46%', '28%'] as const

/**
 * Estados de carga, error y vacío dentro del `<TableBody>`. Devuelve filas,
 * por lo que debe renderizarse como hijo directo del cuerpo de la tabla.
 */
export function TablaEstado({
  columnas,
  cargando,
  error,
  onReintentar,
  vacio,
  tituloVacio,
  descripcionVacio,
  iconoVacio: IconoVacio = Inbox,
}: TablaEstadoProps) {
  if (cargando) {
    return (
      <>
        {Array.from({ length: 6 }).map((_, fila) => (
          <TableRow key={`cargando-${fila}`} aria-hidden="true">
            {Array.from({ length: columnas }).map((_, columna) => (
              <TableCell key={columna}>
                <Skeleton
                  className="h-4"
                  style={{ width: ANCHOS[(fila + columna) % ANCHOS.length] }}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
        <TableRow className="sr-only">
          <TableCell colSpan={columnas}>
            <span role="status">Cargando información…</span>
          </TableCell>
        </TableRow>
      </>
    )
  }

  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={columnas} className="py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert className="size-6" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold">No se pudo cargar la información</p>
              <p className="max-w-lg text-sm text-muted-foreground">{error}</p>
            </div>
            {onReintentar ? (
              <Button type="button" variant="outline" onClick={onReintentar}>
                <RefreshCw aria-hidden="true" />
                Reintentar
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  if (!vacio) return null

  return (
    <TableRow>
      <TableCell colSpan={columnas} className="py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <IconoVacio className="size-6" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold">{tituloVacio}</p>
            {descripcionVacio ? (
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {descripcionVacio}
              </p>
            ) : null}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
