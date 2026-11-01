import type { EstadoAsistencia, OrigenAsistencia } from '@/services/asistencia'

export interface MetaEstadoAsistencia {
  etiqueta: string
  variante: 'success' | 'warning' | 'destructive' | 'info'
}

/** Etiqueta y color de cada estado de asistencia en tablas y avisos. */
export const ESTADOS_ASISTENCIA: Record<EstadoAsistencia, MetaEstadoAsistencia> =
  {
    presente: { etiqueta: 'Presente', variante: 'success' },
    tardanza: { etiqueta: 'Tardanza', variante: 'warning' },
    falta: { etiqueta: 'Falta', variante: 'destructive' },
    justificada: { etiqueta: 'Justificada', variante: 'info' },
  }

/** Estados que un docente puede fijar en el registro manual. */
export type EstadoManual = 'presente' | 'tardanza' | 'falta'

export const ESTADOS_MANUALES: readonly EstadoManual[] = [
  'presente',
  'tardanza',
  'falta',
]

export const ORIGENES_ASISTENCIA: Record<
  OrigenAsistencia,
  { etiqueta: string; variante: 'info' | 'muted' }
> = {
  qr: { etiqueta: 'QR', variante: 'info' },
  manual: { etiqueta: 'Manual', variante: 'muted' },
}
