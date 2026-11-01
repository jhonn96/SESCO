import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  titulo: string
  descripcion: string
  icono: LucideIcon
  acciones?: ReactNode
}

/** Encabezado común de las vistas del panel administrativo. */
export function PageHeader({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
}: PageHeaderProps) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Icono className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            {titulo}
          </h1>
          <p className="max-w-3xl text-base text-muted-foreground">
            {descripcion}
          </p>
        </div>
      </div>
      {acciones ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {acciones}
        </div>
      ) : null}
    </section>
  )
}
