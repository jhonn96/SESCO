import { api, type PeticionPaginada } from './api'
import type { Usuario } from './auth'

export interface FiltrosUsuarios {
  rol_id?: number
  activo?: boolean
  /** Busca por CI, nombres o apellidos. */
  q?: string
  skip?: number
  limit?: number
}

/** Alta de una cuenta; el backend hashea la contraseña. */
export interface NuevoUsuario {
  ci: string
  nombres: string
  apellidos: string
  rol_id: number
  password: string
}

export interface DisponibilidadCI {
  ci: string
  disponible: boolean
}

/** GET /api/usuarios (solo Director). */
export function listarUsuarios(
  filtros: FiltrosUsuarios = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Usuario[]>> {
  return api.getPaginado<Usuario[]>('/usuarios', {
    query: {
      rol_id: filtros.rol_id,
      activo: filtros.activo,
      q: filtros.q?.trim() || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 50,
    },
    signal,
  })
}

/** POST /api/usuarios (solo Director). */
export function crearUsuario(datos: NuevoUsuario): Promise<Usuario> {
  return api.post<Usuario>('/usuarios', datos)
}

export interface CambioEstadoUsuario {
  activo?: boolean
  /** Fecha ISO futura para bloquear; `null` desbloquea y reinicia intentos. */
  bloqueado_hasta?: string | null
}

/** PATCH /api/usuarios/{id}/estado (solo Director). */
export function cambiarEstadoUsuario(
  usuarioId: number,
  datos: CambioEstadoUsuario,
): Promise<Usuario> {
  return api.patch<Usuario>(`/usuarios/${usuarioId}/estado`, datos)
}

/** PATCH /api/usuarios/{id}/desbloquear: quita el bloqueo y reinicia intentos. */
export function desbloquearUsuario(usuarioId: number): Promise<Usuario> {
  return api.patch<Usuario>(`/usuarios/${usuarioId}/desbloquear`)
}

export interface CambioPassword {
  password_actual: string
  password_nueva: string
}

export interface PasswordActualizada {
  mensaje: string
}

export interface PasswordRestablecida {
  usuario: Usuario
  password_temporal: string
}

/** Contraseña asignada por el restablecimiento administrativo. */
export const PASSWORD_TEMPORAL = 'Sesco2026!'

/** PUT /api/usuarios/mi-password: cambio de contraseña del propio usuario. */
export function cambiarMiPassword(
  datos: CambioPassword,
): Promise<PasswordActualizada> {
  return api.put<PasswordActualizada>('/usuarios/mi-password', datos)
}

/** PATCH /api/usuarios/{id}/reset-password (solo Director). */
export function restablecerPasswordUsuario(
  usuarioId: number,
): Promise<PasswordRestablecida> {
  return api.patch<PasswordRestablecida>(
    `/usuarios/${usuarioId}/reset-password`,
  )
}

/** DELETE /api/usuarios/{id} (solo Director). */
export function eliminarUsuario(usuarioId: number): Promise<void> {
  return api.delete(`/usuarios/${usuarioId}`)
}

/** GET /api/usuarios/verificar-ci: ¿la cédula está libre? */
export function verificarCi(ci: string): Promise<DisponibilidadCI> {
  return api.get<DisponibilidadCI>('/usuarios/verificar-ci', {
    query: { ci: ci.trim() },
  })
}

/**
 * Descarga todos los usuarios de un rol para resolver nombres en tablas que
 * solo reciben identificadores. Se cachea en el cliente.
 */
export async function obtenerDirectorioUsuarios(
  rolId: number,
  signal?: AbortSignal,
): Promise<Map<number, Usuario>> {
  const tamano = 100
  const directorio = new Map<number, Usuario>()
  let skip = 0
  let total = Number.POSITIVE_INFINITY

  while (skip < total) {
    const { data, total: encontrados } = await listarUsuarios(
      { rol_id: rolId, skip, limit: tamano },
      signal,
    )
    total = encontrados
    for (const usuario of data) {
      directorio.set(usuario.id, usuario)
    }
    if (data.length === 0) break
    skip += data.length
  }

  return directorio
}
