import { api } from './api'

/** Valores admitidos por ``tutoria.parentesco``. */
export type Parentesco = 'Padre' | 'Madre' | 'Abuelo/a' | 'Tutor legal'

export type EstadoTutoria = 'pendiente' | 'confirmada' | 'baja'

/** Vínculo estudiante-tutor. Espejo de `TutoriaResponse`. */
export interface Tutoria {
  estudiante_id: number
  tutor_id: number
  parentesco: Parentesco
  es_principal: boolean
  estado: EstadoTutoria
  confirmado_por: number | null
  confirmado_en: string | null
}

export interface NuevaTutoria {
  estudiante_id: number
  tutor_id: number
  parentesco: Parentesco
  es_principal: boolean
}

/** POST /api/tutorias: crea el vínculo en estado `pendiente`. */
export function crearTutoria(datos: NuevaTutoria): Promise<Tutoria> {
  return api.post<Tutoria>('/tutorias', datos)
}

/**
 * POST /api/tutorias/{estudiante}/{tutor}/confirmar.
 * RD-02: solo el Director puede confirmar el vínculo.
 */
export function confirmarTutoria(
  estudianteId: number,
  tutorId: number,
): Promise<Tutoria> {
  return api.post<Tutoria>(
    `/tutorias/${estudianteId}/${tutorId}/confirmar`,
  )
}
