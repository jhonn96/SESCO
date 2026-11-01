import { useEffect, useState } from 'react'

import { useTheme } from '@/hooks/use-theme'

export interface ChartTheme {
  /** Color de la grilla horizontal. */
  grid: string
  /** Color de ejes y etiquetas. */
  axis: string
  tooltipBackground: string
  tooltipBorder: string
  tooltipText: string
  /** Paleta de series (`--chart-1` … `--chart-5`). */
  series: [string, string, string, string, string]
}

const RESPALDO: ChartTheme = {
  grid: 'hsl(214.3 31.8% 91.4%)',
  axis: 'hsl(215.4 16.3% 46.9%)',
  tooltipBackground: 'hsl(0 0% 100%)',
  tooltipBorder: 'hsl(214.3 31.8% 91.4%)',
  tooltipText: 'hsl(222.2 84% 4.9%)',
  series: [
    'hsl(221.2 83.2% 53.3%)',
    'hsl(142.1 76.2% 36.3%)',
    'hsl(37.7 92.1% 50.2%)',
    'hsl(0 84.2% 60.2%)',
    'hsl(173.4 80.4% 40%)',
  ],
}

const TOKENS_SERIE = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
] as const

function leerToken(token: string, respaldo: string): string {
  if (typeof document === 'undefined') return respaldo
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim()
  return valor || respaldo
}

function calcularTema(): ChartTheme {
  return {
    grid: leerToken('--border', RESPALDO.grid),
    axis: leerToken('--muted-foreground', RESPALDO.axis),
    tooltipBackground: leerToken('--popover', RESPALDO.tooltipBackground),
    tooltipBorder: leerToken('--border', RESPALDO.tooltipBorder),
    tooltipText: leerToken(
      '--popover-foreground',
      RESPALDO.tooltipText,
    ),
    series: TOKENS_SERIE.map(
      (token, indice) => leerToken(token, RESPALDO.series[indice]),
    ) as ChartTheme['series'],
  }
}

/**
 * Colores de Recharts resueltos desde las variables CSS del tema activo.
 *
 * Se recalculan al cambiar entre claro/oscuro (en el siguiente frame, cuando
 * `<html>` ya tiene la clase `dark`) para que ejes, grilla y tooltip sigan
 * siendo legibles.
 */
export function useChartTheme(): ChartTheme {
  const { tema } = useTheme()
  const [paleta, setPaleta] = useState<ChartTheme>(calcularTema)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPaleta(calcularTema()))
    return () => cancelAnimationFrame(frame)
  }, [tema])

  return paleta
}
