/** Utilidades de la grilla semanal de horarios. */

export const DIAS_SEMANA = [
  { valor: 'lunes', etiqueta: 'Lunes', abreviatura: 'Lun' },
  { valor: 'martes', etiqueta: 'Martes', abreviatura: 'Mar' },
  { valor: 'miercoles', etiqueta: 'Miércoles', abreviatura: 'Mié' },
  { valor: 'jueves', etiqueta: 'Jueves', abreviatura: 'Jue' },
  { valor: 'viernes', etiqueta: 'Viernes', abreviatura: 'Vie' },
] as const

export type DiaSemana = (typeof DIAS_SEMANA)[number]['valor']

/** Etiqueta legible de un día (`miercoles` → `Miércoles`). */
export function etiquetaDia(dia: string): string {
  return DIAS_SEMANA.find((item) => item.valor === dia)?.etiqueta ?? dia
}
