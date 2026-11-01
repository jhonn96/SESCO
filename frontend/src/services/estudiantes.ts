import { api, type PeticionPaginada } from './api'
import type { EstadoAsistencia, OrigenAsistencia } from './asistencia'
import type { Usuario } from './auth'
import type { Curso } from './cursos'
import type { DiaSemana } from '../lib/horarios'

/** Estudiante con su usuario y curso expandidos. */
export interface Estudiante {
  usuario_id: number
  curso_id: number
  fecha_nac: string
  usuario: Usuario | null
  curso: Curso | null
}

export interface FiltrosEstudiantes {
  curso_id?: number
  /** Busca por CI, nombres o apellidos. */
  q?: string
  skip?: number
  limit?: number
}

export interface NuevoEstudiante {
  usuario_id: number
  curso_id: number
  fecha_nac: string
}

/** Actualización de un estudiante; los datos personales viven en `usuario`. */
export interface ActualizarEstudiante {
  nombres?: string
  apellidos?: string
  ci?: string
  curso_id?: number
  fecha_nac?: string
}

/** POST /api/estudiantes (solo Director). El backend genera el secreto QR. */
export function crearEstudiante(datos: NuevoEstudiante): Promise<Estudiante> {
  return api.post<Estudiante>('/estudiantes', datos)
}

/** PUT /api/estudiantes/{id} (solo Director). */
export function actualizarEstudiante(
  usuarioId: number,
  datos: ActualizarEstudiante,
): Promise<Estudiante> {
  return api.put<Estudiante>(`/estudiantes/${usuarioId}`, datos)
}

/** GET /api/estudiantes (Director y Profesor). */export function listarEstudiantes(
  filtros: FiltrosEstudiantes = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Estudiante[]>> {
  return api.getPaginado<Estudiante[]>('/estudiantes', {
    query: {
      curso_id: filtros.curso_id,
      q: filtros.q?.trim() || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/**
 * GET /api/profesores/mis-estudiantes (solo Profesor).
 * El backend limita el resultado a los cursos asignados al docente.
 */
export function listarMisEstudiantes(
  filtros: FiltrosEstudiantes = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Estudiante[]>> {
  return api.getPaginado<Estudiante[]>('/profesores/mis-estudiantes', {
    query: {
      curso_id: filtros.curso_id,
      q: filtros.q?.trim() || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/** KPIs del panel del estudiante autenticado. */
export interface ResumenAsistenciaEstudiante {
  /** Días distintos con al menos un registro `presente`. */
  dias_presente: number
  tardanzas: number
  faltas: number
}

/** Registro de asistencia del estudiante autenticado. */
export interface HistorialAsistenciaEstudiante {
  id: number
  fecha: string
  estado: EstadoAsistencia
  origen: OrigenAsistencia
  materia: string | null
  hora_inicio: string | null
  hora_fin: string | null
  /** Momento exacto del ingreso (ISO con zona) o `null` si no asistió. */
  hora_ingreso: string | null
  minutos_retraso: number
}

/** Tutor principal del estudiante autenticado. */
export interface TutorACargo {
  tutor_id: number
  nombres: string
  apellidos: string
  ci: string
  parentesco: string
  telefono: string | null
  es_principal: boolean
}

/** Bloque del horario semanal del estudiante. */
export interface BloqueHorarioEstudiante {
  id: number
  dia_semana: DiaSemana
  hora_inicio: string
  hora_fin: string
  es_ultimo_bloque: boolean
  materia: string | null
}

/** Grilla semanal del curso al que pertenece el estudiante. */
export interface HorarioEstudiante {
  curso: Curso | null
  bloques: BloqueHorarioEstudiante[]
}

export interface FiltrosMisAsistencias {
  /** Mes en formato `YYYY-MM`. */
  mes?: string
  estado?: EstadoAsistencia
  skip?: number
  limit?: number
}

/** GET /api/estudiantes/mi-resumen (solo Estudiante). */
export function obtenerMiResumen(
  signal?: AbortSignal,
): Promise<ResumenAsistenciaEstudiante> {
  return api.get<ResumenAsistenciaEstudiante>('/estudiantes/mi-resumen', {
    signal,
  })
}

/** GET /api/estudiantes/mi-tutor (solo Estudiante). */
export function obtenerMiTutor(
  signal?: AbortSignal,
): Promise<TutorACargo | null> {
  return api.get<TutorACargo | null>('/estudiantes/mi-tutor', { signal })
}

/** GET /api/estudiantes/mi-horario (solo Estudiante). */
export function obtenerMiHorario(
  signal?: AbortSignal,
): Promise<HorarioEstudiante> {
  return api.get<HorarioEstudiante>('/estudiantes/mi-horario', { signal })
}

/** GET /api/estudiantes/mi-asistencias (solo Estudiante). */
export function obtenerMisAsistencias(
  filtros: FiltrosMisAsistencias = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<HistorialAsistenciaEstudiante[]>> {
  return api.getPaginado<HistorialAsistenciaEstudiante[]>(
    '/estudiantes/mi-asistencias',
    {
      query: {
        mes: filtros.mes?.trim() || undefined,
        estado: filtros.estado,
        skip: filtros.skip ?? 0,
        limit: filtros.limit ?? 10,
      },
      signal,
    },
  )
}

/**
 * Descarga el directorio completo de estudiantes para resolver nombres y
 * cursos en las tablas de alertas y justificaciones (evita N+1 consultas).
 */
export async function obtenerDirectorioEstudiantes(
  signal?: AbortSignal,
): Promise<Map<number, Estudiante>> {
  const tamano = 100
  const directorio = new Map<number, Estudiante>()
  let skip = 0
  let total = Number.POSITIVE_INFINITY

  while (skip < total) {
    const { data, total: encontrados } = await listarEstudiantes(
      { skip, limit: tamano },
      signal,
    )
    total = encontrados
    for (const estudiante of data) {
      directorio.set(estudiante.usuario_id, estudiante)
    }
    if (data.length === 0) break
    skip += data.length
  }

  return directorio
}
