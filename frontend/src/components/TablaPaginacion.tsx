import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface TablaPaginacionProps {
  /** Índice de página basado en cero. */
  pagina: number
  tamano: number
  total: number
  onCambiarPagina: (pagina: number) => void
  /** Plural del recurso, por ejemplo "estudiantes". */
  etiqueta: string
  deshabilitado?: boolean
}

/** Devuelve números de página con elipsis cuando hay muchas. */
function paginasVisibles(pagina: number, total: number): (number | 'gap')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, indice) => indice)
  }

  const visibles = new Set<number>([0, total - 1])
  for (let indice = pagina - 1; indice <= pagina + 1; indice += 1) {
    if (indice > 0 && indice < total - 1) visibles.add(indice)
  }

  const ordenadas = [...visibles].sort((a, b) => a - b)
  const salida: (number | 'gap')[] = []
  ordenadas.forEach((valor, indice) => {
    if (indice > 0 && valor - ordenadas[indice - 1] > 1) salida.push('gap')
    salida.push(valor)
  })
  return salida
}

const FORMATO = new Intl.NumberFormat('es-BO')

/**
 * Pie de tabla con el rango visible, el total y los controles de página.
 * Se usa en todas las tablas del panel del director.
 */
export function TablaPaginacion({
  pagina,
  tamano,
  total,
  onCambiarPagina,
  etiqueta,
  deshabilitado = false,
}: TablaPaginacionProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamano))
  const paginaActual = Math.min(Math.max(pagina, 0), totalPaginas - 1)
  const desde = total === 0 ? 0 : paginaActual * tamano + 1
  const hasta = Math.min(total, (paginaActual + 1) * tamano)
  const paginas = paginasVisibles(paginaActual, totalPaginas)

  return (
    <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando{' '}
        <span className="font-medium text-foreground tabular-nums">
          {FORMATO.format(desde)}–{FORMATO.format(hasta)}
        </span>{' '}
        de <span className="font-medium text-foreground">{FORMATO.format(total)}</span>{' '}
        {etiqueta}
      </p>

      <nav
        aria-label="Paginación"
        className="flex items-center gap-1 self-start sm:self-auto"
      >
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onCambiarPagina(paginaActual - 1)}
          disabled={deshabilitado || paginaActual === 0}
          aria-label="Página anterior"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>

        {paginas.map((valor, indice) =>
          valor === 'gap' ? (
            <span
              key={`gap-${indice}`}
              className="px-1 text-sm text-muted-foreground"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Button
              key={valor}
              type="button"
              variant={valor === paginaActual ? 'default' : 'outline'}
              size="icon-sm"
              onClick={() => onCambiarPagina(valor)}
              disabled={deshabilitado}
              aria-label={`Página ${valor + 1}`}
              aria-current={valor === paginaActual ? 'page' : undefined}
              className="tabular-nums"
            >
              {valor + 1}
            </Button>
          ),
        )}

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onCambiarPagina(paginaActual + 1)}
          disabled={deshabilitado || paginaActual >= totalPaginas - 1}
          aria-label="Página siguiente"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
    </div>
  )
}
