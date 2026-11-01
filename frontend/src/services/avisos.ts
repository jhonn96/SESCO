import { api, type PeticionPaginada } from './api'

export type TipoAviso = 'general' | 'citacion' | 'urgente'

/** Entrega del aviso al usuario autenticado (bandeja del tutor). */
export interface EntregaAviso {
  aviso_id: number
  usuario_id: number
  entregado_en: string | null
  leido_en: string | null
  confirmado_en: string | null
}

/** Aviso con el estado de entrega calculado por el backend. */
export interface Aviso {
  id: number
  autor_id: number
  titulo: string
  contenido: string
  tipo: TipoAviso
  importante: boolean
  fecha_cita: string | null
  publicado_en: string
  total_destinatarios: number
  leidos: number
  confirmados: number
  /**
   * Solo se incluye en la bandeja del destinatario (tutores y `solo_mios`);
   * contiene únicamente la entrega del usuario autenticado.
   */
  destinatarios?: EntregaAviso[]
}

export interface NuevoAviso {
  titulo: string
  contenido: string
  tipo: TipoAviso
  importante: boolean
  /** Obligatoria cuando el tipo es `citacion`. */
  fecha_cita?: string
}

export interface FiltrosAvisos {
  /** Restringe a un tipo de aviso (`general`, `citacion` o `urgente`). */
  tipo?: TipoAviso
  importante?: boolean
  /** Solo los avisos dirigidos al usuario autenticado. */
  soloMios?: boolean
  skip?: number
  limit?: number
}

/** GET /api/avisos (Director, Profesor y Tutor). */
export function listarAvisos(
  {
    tipo,
    importante,
    soloMios,
    skip = 0,
    limit = 8,
  }: FiltrosAvisos = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Aviso[]>> {
  return api.getPaginado<Aviso[]>('/avisos', {
    query: { tipo, importante, solo_mios: soloMios, skip, limit },
    signal,
  })
}

/** POST /api/avisos: si no se indican destinatarios se difunde a todos. */
export function crearAviso(datos: NuevoAviso): Promise<Aviso> {
  return api.post<Aviso>('/avisos', datos)
}

/**
 * PATCH /api/avisos/{id}/confirmar: registra la lectura confirmada del
 * destinatario autenticado. Es idempotente.
 */
export function confirmarAviso(avisoId: number): Promise<EntregaAviso> {
  return api.patch<EntregaAviso>(`/avisos/${avisoId}/confirmar`)
}
