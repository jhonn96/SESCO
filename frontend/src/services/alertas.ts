import { api, type PeticionPaginada } from './api'

export type TipoAlerta = 'faltas' | 'tardanzas' | 'inasistencia'

export interface AlertaEstudiante {
  usuario_id: number
  curso_id: number
}

/** Alerta automática de asistencia (RF-06/RF-07). */
export interface Alerta {
  id: number
  estudiante_id: number
  tipo: TipoAlerta
  detalle: string | null
  generada_en: string
  dia: string | null
  atendida: boolean
  atendida_por: number | null
  atendida_en: string | null
  estudiante: AlertaEstudiante | null
}

export interface FiltrosAlertas {
  tipo?: TipoAlerta
  atendida?: boolean
  skip?: number
  limit?: number
}

/** GET /api/alertas (solo Director). */
export function listarAlertas(
  filtros: FiltrosAlertas = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Alerta[]>> {
  return api.getPaginado<Alerta[]>('/alertas', {
    query: {
      tipo: filtros.tipo,
      atendida: filtros.atendida,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/** PATCH /api/alertas/{id}/atender (solo Director). */
export function atenderAlerta(alertaId: number): Promise<Alerta> {
  return api.patch<Alerta>(`/alertas/${alertaId}/atender`)
}
