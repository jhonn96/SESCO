import type { Periodo } from '@/services/periodos'

const ORDINALES = ['1.er', '2.º', '3.er'] as const

/** Ejemplo: `2026 · 3.er trimestre`. */
export function etiquetaPeriodo(periodo: Periodo): string {
  const ordinal = ORDINALES[periodo.trimestre - 1] ?? `${periodo.trimestre}.º`
  return `${periodo.gestion} · ${ordinal} trimestre`
}

/** Periodo que contiene la fecha indicada (`YYYY-MM-DD`) o el más reciente. */
export function periodoVigente(
  periodos: Periodo[],
  fechaIso: string,
): Periodo | null {
  const ordenados = [...periodos].sort(
    (a, b) => a.gestion - b.gestion || a.trimestre - b.trimestre,
  )
  const actual = ordenados.find(
    (periodo) =>
      periodo.fecha_ini <= fechaIso && fechaIso <= periodo.fecha_fin,
  )
  return actual ?? ordenados[ordenados.length - 1] ?? null
}
