import { api, type PeticionPaginada } from './api'
import type { Usuario } from './auth'
import type {
  HistorialAsistenciaEstudiante,
  ResumenAsistenciaEstudiante,
} from './estudiantes'
import type { EstadoJustificacion } from './justificaciones'

/** Tutor con su usuario expandido. Espejo de `TutorResponse`. */
export interface Tutor {
  usuario_id: number
  telefono: string
  usuario: Usuario | null
}

export interface FiltrosTutores {
  /** Busca por CI, nombres, apellidos o teléfono. */
  q?: string
  skip?: number
  limit?: number
}

/** GET /api/tutores (solo Director). */
export function listarTutores(
  filtros: FiltrosTutores = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Tutor[]>> {
  return api.getPaginado<Tutor[]>('/tutores', {
    query: {
      q: filtros.q?.trim() || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/**
 * Descarga todos los tutores paginando la API (hay más de 100 en el seed).
 * El backend ya los devuelve ordenados por apellidos.
 */
export async function listarTodosLosTutores(
  signal?: AbortSignal,
): Promise<Tutor[]> {
  const tamano = 100
  const tutores: Tutor[] = []
  let skip = 0
  let total = Number.POSITIVE_INFINITY

  while (skip < total) {
    const { data, total: encontrados } = await listarTutores(
      { skip, limit: tamano },
      signal,
    )
    total = encontrados
    tutores.push(...data)
    if (data.length === 0) break
    skip += data.length
  }

  return tutores
}

// --------------------------------------------------------------------------
// Panel del tutor autenticado
// --------------------------------------------------------------------------

/** Curso del hijo, suficiente para identificarlo en el selector. */
export interface CursoHijo {
  id: number
  nivel: string
  grado: number
  paralelo: string
  turno: string
}

/** Hijo del tutor con vínculo confirmado. */
export interface HijoDelTutor {
  usuario_id: number
  nombres: string
  apellidos: string
  ci: string
  parentesco: string
  es_principal: boolean
  curso: CursoHijo | null
  /** Notificaciones de asistencia sin leer del tutor para este hijo. */
  notificaciones_pendientes: number
  /** Faltas y tardanzas de los últimos 7 días. */
  faltas_recientes: number
}

/** Justificación ya registrada para un registro de asistencia. */
export interface JustificacionBreve {
  id: number
  estado: EstadoJustificacion
  motivo: string
}

/** Registro de asistencia del hijo, con su justificación si existe. */
export interface HistorialHijo extends HistorialAsistenciaEstudiante {
  justificacion: JustificacionBreve | null
}

/** GET /api/tutores/mis-estudiantes (solo Tutor). */
export function obtenerMisHijos(
  signal?: AbortSignal,
): Promise<HijoDelTutor[]> {
  return api.get<HijoDelTutor[]>('/tutores/mis-estudiantes', { signal })
}

/** GET /api/tutores/estudiantes/{id}/resumen (solo Tutor confirmado). */
export function obtenerResumenHijo(
  estudianteId: number,
  signal?: AbortSignal,
): Promise<ResumenAsistenciaEstudiante> {
  return api.get<ResumenAsistenciaEstudiante>(
    `/tutores/estudiantes/${estudianteId}/resumen`,
    { signal },
  )
}

/** Filtros del historial completo del hijo. */
export interface FiltrosHistorialHijo {
  /** Mes en formato `YYYY-MM`. */
  mes?: string
  estado?: HistorialHijo['estado']
  skip?: number
  limit?: number
}

/** GET /api/tutores/estudiantes/{id}/historial (solo Tutor confirmado). */
export function obtenerHistorialHijo(
  estudianteId: number,
  limite = 10,
  signal?: AbortSignal,
): Promise<HistorialHijo[]> {
  return api.get<HistorialHijo[]>(
    `/tutores/estudiantes/${estudianteId}/historial`,
    { query: { limit: limite }, signal },
  )
}

/**
 * GET /api/tutores/estudiantes/{id}/historial paginado, con filtros de mes y
 * estado. El total de registros llega en la cabecera `X-Total-Count`.
 */
export function listarHistorialHijo(
  estudianteId: number,
  filtros: FiltrosHistorialHijo = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<HistorialHijo[]>> {
  return api.getPaginado<HistorialHijo[]>(
    `/tutores/estudiantes/${estudianteId}/historial`,
    {
      query: {
        mes: filtros.mes?.trim() || undefined,
        estado: filtros.estado,
        skip: filtros.skip ?? 0,
        limit: filtros.limit ?? 20,
      },
      signal,
    },
  )
}
