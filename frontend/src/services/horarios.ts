import { api } from './api'
import type { Curso } from './cursos'
import type { Materia } from './materias'
import type { DiaSemana } from '../lib/horarios'

/** Bloque de clase de un curso. Espejo de `HorarioResponse`. */
export interface Horario {
  id: number
  curso_id: number
  materia_id: number
  dia_semana: DiaSemana
  hora_inicio: string
  hora_fin: string
  es_ultimo_bloque: boolean
  materia: Materia | null
  curso: Curso | null
}

/** Alta de un bloque; el backend rechaza solapamientos y segundos cierres. */
export interface NuevoHorario {
  curso_id: number
  materia_id: number
  dia_semana: DiaSemana
  hora_inicio: string
  hora_fin: string
  es_ultimo_bloque: boolean
}

/** GET /api/horarios?curso_id= (Director y Profesor). */
export function listarHorarios(
  cursoId: number,
  signal?: AbortSignal,
): Promise<Horario[]> {
  return api.get<Horario[]>('/horarios', {
    query: { curso_id: cursoId, limit: 200 },
    signal,
  })
}

/**
 * GET /api/profesores/bloques-vigentes (solo Profesor): bloques que están en
 * curso ahora en los cursos asignados al docente autenticado.
 */
export function obtenerBloquesVigentes(
  signal?: AbortSignal,
): Promise<Horario[]> {
  return api.get<Horario[]>('/profesores/bloques-vigentes', { signal })
}

/** POST /api/horarios (solo Director). */
export function crearHorario(datos: NuevoHorario): Promise<Horario> {
  return api.post<Horario>('/horarios', datos)
}

/** PUT /api/horarios/{id} (solo Director). */
export function actualizarHorario(
  horarioId: number,
  datos: Partial<NuevoHorario>,
): Promise<Horario> {
  return api.put<Horario>(`/horarios/${horarioId}`, datos)
}

/** DELETE /api/horarios/{id} (solo Director). */
export function eliminarHorario(horarioId: number): Promise<void> {
  return api.delete(`/horarios/${horarioId}`)
}
