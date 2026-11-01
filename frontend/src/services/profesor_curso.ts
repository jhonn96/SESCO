import { api, type PeticionPaginada } from './api'
import type { Curso } from './cursos'
import type { Profesor } from './profesores'

/** Asignación profesor-curso. Espejo de `ProfesorCursoResponse`. */
export interface ProfesorCurso {
  profesor_id: number
  curso_id: number
  es_asesor: boolean
  profesor: Profesor | null
  curso: Curso | null
}

export interface NuevaAsignacion {
  profesor_id: number
  curso_id: number
  es_asesor: boolean
}

/** GET /api/profesor_curso?curso_id= (Director y Profesor). */
export function listarAsignacionesCurso(
  cursoId: number,
  signal?: AbortSignal,
): Promise<PeticionPaginada<ProfesorCurso[]>> {
  return api.getPaginado<ProfesorCurso[]>('/profesor_curso', {
    query: { curso_id: cursoId, limit: 200 },
    signal,
  })
}

/** POST /api/profesor_curso (solo Director). */
export function crearAsignacion(
  datos: NuevaAsignacion,
): Promise<ProfesorCurso> {
  return api.post<ProfesorCurso>('/profesor_curso', datos)
}

/** DELETE /api/profesor_curso/{profesor_id}/{curso_id} (solo Director). */
export function eliminarAsignacion(
  profesorId: number,
  cursoId: number,
): Promise<void> {
  return api.delete(`/profesor_curso/${profesorId}/${cursoId}`)
}
