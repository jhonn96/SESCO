import { api } from './api'

/** Configuración única de asistencia. Espejo de `ParametroAsistenciaResponse`. */
export interface ParametroAsistencia {
  id: number
  tolerancia_min: number
  limite_falta_min: number
  umbral_alerta_faltas: number
  umbral_alerta_tardanzas: number
  umbral_inasistencia_pct: number
  qr_ventana_seg: number
  hora_cierre_dia: string | null
  actualizado_por: number | null
  actualizado_en: string
}

export interface ParametroAsistenciaUpdate {
  tolerancia_min: number
  limite_falta_min: number
  umbral_alerta_faltas: number
  umbral_alerta_tardanzas: number
  umbral_inasistencia_pct: number
}

/** GET /api/configuracion/parametros-asistencia (solo Director). */
export function obtenerParametrosAsistencia(
  signal?: AbortSignal,
): Promise<ParametroAsistencia> {
  return api.get<ParametroAsistencia>('/configuracion/parametros-asistencia', {
    signal,
  })
}

/** PUT /api/configuracion/parametros-asistencia (solo Director). */
export function actualizarParametrosAsistencia(
  datos: ParametroAsistenciaUpdate,
): Promise<ParametroAsistencia> {
  return api.put<ParametroAsistencia>(
    '/configuracion/parametros-asistencia',
    datos,
  )
}
