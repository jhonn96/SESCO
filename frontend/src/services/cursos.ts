import { api } from './api'

/** Curso del periodo activo. Espejo de `CursoResponse` del backend. */
export interface Curso {
  id: number
  nivel: string
  grado: number
  paralelo: string
  turno: string
  periodo_id: number
}

/** Alta de un curso. El backend normaliza el paralelo a mayúscula. */
export interface NuevoCurso {
  nivel: string
  grado: number
  paralelo: string
  turno: string
  periodo_id: number
}

/** GET /api/cursos (Director y Profesor). */
export function listarCursos(signal?: AbortSignal): Promise<Curso[]> {
  return api.get<Curso[]>('/cursos', { query: { limit: 100 }, signal })
}

/** POST /api/cursos (solo Director). */
export function crearCurso(datos: NuevoCurso): Promise<Curso> {
  return api.post<Curso>('/cursos', datos)
}

/** PUT /api/cursos/{id} (solo Director). */
export function actualizarCurso(
  cursoId: number,
  datos: Partial<NuevoCurso>,
): Promise<Curso> {
  return api.put<Curso>(`/cursos/${cursoId}`, datos)
}

/** DELETE /api/cursos/{id} (solo Director). */
export function eliminarCurso(cursoId: number): Promise<void> {
  return api.delete(`/cursos/${cursoId}`)
}
