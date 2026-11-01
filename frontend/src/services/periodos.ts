import { api } from './api'

/** Periodo lectivo (gestión + trimestre). Espejo de `PeriodoResponse`. */
export interface Periodo {
  id: number
  gestion: number
  trimestre: number
  fecha_ini: string
  fecha_fin: string
}

/** GET /api/periodos (Director y Profesor). */
export function listarPeriodos(signal?: AbortSignal): Promise<Periodo[]> {
  return api.get<Periodo[]>('/periodos', { query: { limit: 100 }, signal })
}
