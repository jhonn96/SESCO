import { api } from './api'

/** Materia del catálogo. Espejo de `MateriaResponse`. */
export interface Materia {
  id: number
  nombre: string
}

/** GET /api/materias (Director y Profesor). */
export function listarMaterias(signal?: AbortSignal): Promise<Materia[]> {
  return api.get<Materia[]>('/materias', { query: { limit: 200 }, signal })
}
