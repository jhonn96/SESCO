import { api, type PeticionPaginada } from './api'
import type { EstadoAsistencia, RegistroAsistencia } from './asistencia'
import type { Usuario } from './auth'
import type { Curso } from './cursos'
import type { Horario } from './horarios'

/** Profesor con su usuario expandido. Espejo de `ProfesorResponse`. */
export interface Profesor {
  usuario_id: number
  fecha_ingreso: string
  direccion: string
  telefono: string
  usuario: Usuario | null
}

export interface FiltrosProfesores {
  /** Busca por CI, nombres, apellidos, teléfono o dirección. */
  q?: string
  skip?: number
  limit?: number
}

/** Datos del perfil; la cuenta se crea antes con `POST /api/usuarios`. */
export interface NuevoProfesor {
  usuario_id: number
  fecha_ingreso: string
  direccion: string
  telefono: string
}

/** Actualización de un profesor; los datos personales viven en `usuario`. */
export interface ActualizarProfesor {
  nombres?: string
  apellidos?: string
  ci?: string
  fecha_ingreso?: string
  direccion?: string
  telefono?: string
}

/** Clase que el docente está dictando en este momento. */
export interface ClaseActual {
  en_clase: boolean
  /** Bloque en curso con curso y materia; `null` si no hay clase. */
  bloque: Horario | null
  /** Asistencias registradas hoy para ese bloque. */
  registrados: number
  /** Estudiantes matriculados en el curso. */
  total_estudiantes: number
}

/**
 * GET /api/profesores/clase-actual (solo Profesor): bloque que el docente
 * autenticado tiene en curso según la hora del servidor.
 */
export function obtenerClaseActual(
  signal?: AbortSignal,
): Promise<ClaseActual> {
  return api.get<ClaseActual>('/profesores/clase-actual', { signal })
}

/** Filtros del historial diario del docente. */
export interface FiltrosMisRegistros {
  cursoId?: number
  materiaId?: number
}

/**
 * GET /api/profesores/mis-cursos (solo Profesor): todos los cursos asignados
 * al docente, para el selector de curso del historial diario.
 */
export function obtenerMisCursos(signal?: AbortSignal): Promise<Curso[]> {
  return api.get<Curso[]>('/profesores/mis-cursos', { signal })
}

/**
 * GET /api/profesores/mi-horario (solo Profesor): todos los bloques de la
 * semana de los cursos asignados al docente, ordenados por día y hora.
 */
export function obtenerMiHorario(
  signal?: AbortSignal,
): Promise<Horario[]> {
  return api.get<Horario[]>('/profesores/mi-horario', { signal })
}

/** Día del mes en la lista mensual de asistencia. */
export interface DiaListaAsistencia {
  fecha: string
  dia: number
  dia_semana: string
  es_clase: boolean
}

/** Estudiante con sus estados de asistencia indexados por fecha ISO. */
export interface EstudianteListaAsistencia {
  usuario_id: number
  nombres: string
  apellidos: string
  ci: string
  estados: Record<string, EstadoAsistencia>
}

/** Matriz mensual de asistencia de un curso y materia. */
export interface ListaAsistencia {
  mes: string
  curso: Curso
  materia: { id: number; nombre: string }
  dias: DiaListaAsistencia[]
  estudiantes: EstudianteListaAsistencia[]
}

export interface FiltrosListaAsistencia {
  cursoId: number
  materiaId: number
  /** Mes en formato `AAAA-MM`. */
  mes: string
}

/**
 * GET /api/profesores/lista-asistencia (solo Profesor): matriz mensual del
 * curso y materia indicados, con los estados de cada estudiante por día.
 */
export function obtenerListaAsistencia(
  filtros: FiltrosListaAsistencia,
  signal?: AbortSignal,
): Promise<ListaAsistencia> {
  return api.get<ListaAsistencia>('/profesores/lista-asistencia', {
    query: {
      curso_id: filtros.cursoId,
      materia_id: filtros.materiaId,
      mes: filtros.mes,
    },
    signal,
  })
}

/**
 * GET /api/profesores/bloques-hoy (solo Profesor): bloques del día actual de
 * los cursos asignados al docente. Es la fuente del selector de materias,
 * existan o no registros de asistencia.
 */
export function obtenerBloquesHoy(
  signal?: AbortSignal,
): Promise<Horario[]> {
  return api.get<Horario[]>('/profesores/bloques-hoy', { signal })
}

/**
 * GET /api/profesores/mis-registros-hoy (solo Profesor): todos los registros
 * del día de los cursos asignados al docente, con curso y materia.
 */
export function obtenerMisRegistrosHoy(
  filtros: FiltrosMisRegistros = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<RegistroAsistencia[]>> {
  return api.getPaginado<RegistroAsistencia[]>(
    '/profesores/mis-registros-hoy',
    {
      query: {
        curso_id: filtros.cursoId,
        materia_id: filtros.materiaId,
      },
      signal,
    },
  )
}

/** GET /api/profesores (solo Director). */
export function listarProfesores(
  filtros: FiltrosProfesores = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Profesor[]>> {
  return api.getPaginado<Profesor[]>('/profesores', {
    query: {
      q: filtros.q?.trim() || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/**
 * GET /api/profesores/{usuario_id}/horario (solo Director): bloques semanales
 * de los cursos asignados al profesor indicado, ordenados por día y hora.
 */
export function obtenerHorarioProfesor(
  usuarioId: number,
  signal?: AbortSignal,
): Promise<Horario[]> {
  return api.get<Horario[]>(`/profesores/${usuarioId}/horario`, { signal })
}

/** POST /api/profesores (solo Director). */
export function crearProfesor(datos: NuevoProfesor): Promise<Profesor> {
  return api.post<Profesor>('/profesores', datos)
}

/** PUT /api/profesores/{id} (solo Director). */
export function actualizarProfesor(
  usuarioId: number,
  datos: ActualizarProfesor,
): Promise<Profesor> {
  return api.put<Profesor>(`/profesores/${usuarioId}`, datos)
}
