import { api, type PeticionPaginada } from './api'
import type { Usuario } from './auth'

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
