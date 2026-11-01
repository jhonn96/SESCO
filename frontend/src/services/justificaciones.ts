import { api, type PeticionPaginada } from './api'
import type { Curso } from './cursos'

export type EstadoJustificacion = 'pendiente' | 'aprobada' | 'rechazada'
export type EstadoAsistencia =
  | 'presente'
  | 'tardanza'
  | 'falta'
  | 'justificada'

/** Bloque de clase asociado a la asistencia. */
export interface HorarioJustificacion {
  id: number
  curso_id: number
  materia_id: number
  hora_inicio: string
  hora_fin: string
  es_ultimo_bloque: boolean
  materia: { id: number; nombre: string } | null
  curso: Curso | null
}

/** Asistencia asociada a la justificación (campos usados por la tabla). */
export interface AsistenciaJustificada {
  id: number
  estudiante_id: number
  horario_id: number
  fecha: string
  estado: EstadoAsistencia
  origen: string
  hora_ingreso: string | null
  hora_salida: string | null
  minutos_retraso: number
  creado_en: string
  estudiante: { usuario_id: number; curso_id: number } | null
  horario: HorarioJustificacion | null
}

export interface Justificacion {
  id: number
  asistencia_id: number
  tutor_id: number
  motivo: string
  estado: EstadoJustificacion
  revisado_por: number | null
  revisado_en: string | null
  comentario_resolucion: string | null
  creado_en: string
  asistencia: AsistenciaJustificada | null
}

export interface FiltrosJustificaciones {
  estado?: EstadoJustificacion
  skip?: number
  limit?: number
}

/** GET /api/justificaciones (Director, Profesor y Tutor). */
export function listarJustificaciones(
  filtros: FiltrosJustificaciones = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Justificacion[]>> {
  return api.getPaginado<Justificacion[]>('/justificaciones', {
    query: {
      estado: filtros.estado,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

export interface ResolucionJustificacion {
  estado: 'aprobada' | 'rechazada'
  comentario_resolucion?: string
}

export interface NuevaJustificacion {
  /** Registro de asistencia en estado `falta` o `tardanza`. */
  asistencia_id: number
  /** Motivo del descargo (mínimo 10 caracteres). */
  motivo: string
}

/**
 * POST /api/justificaciones (solo Tutor): envía el descargo de una falta o
 * tardanza. El backend solo lo acepta el mismo día de la asistencia.
 */
export function crearJustificacion(
  datos: NuevaJustificacion,
): Promise<Justificacion> {
  return api.post<Justificacion>('/justificaciones', datos)
}

/** PATCH /api/justificaciones/{id}/resolver (Director y Profesor). */
export function resolverJustificacion(
  justificacionId: number,
  datos: ResolucionJustificacion,
): Promise<Justificacion> {
  return api.patch<Justificacion>(
    `/justificaciones/${justificacionId}/resolver`,
    datos,
  )
}
