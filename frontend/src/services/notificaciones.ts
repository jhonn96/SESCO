import { api, type PeticionPaginada } from './api'

/** Notificación de la cola personal del usuario autenticado. */
export interface Notificacion {
  id: number
  usuario_id: number
  asistencia_id: number | null
  alerta_id: number | null
  justificacion_id: number | null
  tipo: string
  canal: string
  mensaje: string
  intentos: number
  creada_en: string
  entregada_en: string | null
  leida_en: string | null
}

export interface FiltrosNotificaciones {
  /** Solo las que aún no se han leído. */
  soloNoLeidas?: boolean
  /** Tipo de origen: `falta`, `tardanza`, `salida`, `justificacion`, etc. */
  tipo?: string
  skip?: number
  limit?: number
}

/** GET /api/notificaciones (usuario autenticado). */
export function listarNotificaciones(
  filtros: FiltrosNotificaciones = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Notificacion[]>> {
  return api.getPaginado<Notificacion[]>('/notificaciones', {
    query: {
      solo_no_leidas: filtros.soloNoLeidas,
      tipo: filtros.tipo?.trim() || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 50,
    },
    signal,
  })
}

/** PATCH /api/notificaciones/{id}/leer: marca la notificación como leída. */
export function marcarNotificacionLeida(id: number): Promise<Notificacion> {
  return api.patch<Notificacion>(`/notificaciones/${id}/leer`)
}
