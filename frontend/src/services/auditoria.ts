import { api, type PeticionPaginada } from './api'
import type { Rol } from './auth'

/** Cuenta que generó un evento de auditoría. */
export interface BitacoraUsuario {
  id: number
  ci: string
  nombres: string
  apellidos: string
  rol: Rol | null
}

/** Registro de la tabla `bitacora` (RNF-02 / RD-02). */
export interface RegistroAuditoria {
  id: number
  usuario_id: number | null
  accion: string
  entidad: string
  entidad_id: number | null
  detalle: Record<string, unknown> | null
  ip: string | null
  momento: string
  usuario: BitacoraUsuario | null
}

export interface FiltrosAuditoria {
  /** Busca por nombres, apellidos o CI. */
  usuario?: string
  usuarioId?: number
  accion?: string
  entidad?: string
  /** Día inicial inclusive (`YYYY-MM-DD`). */
  desde?: string
  /** Día final inclusive (`YYYY-MM-DD`). */
  hasta?: string
  skip?: number
  limit?: number
}

/** GET /api/auditoria (solo Director). */
export function listarAuditoria(
  filtros: FiltrosAuditoria = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<RegistroAuditoria[]>> {
  return api.getPaginado<RegistroAuditoria[]>('/auditoria', {
    query: {
      usuario: filtros.usuario?.trim() || undefined,
      usuario_id: filtros.usuarioId,
      accion: filtros.accion || undefined,
      entidad: filtros.entidad?.trim() || undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/** GET /api/auditoria/acciones (solo Director). */
export function listarAccionesAuditoria(
  signal?: AbortSignal,
): Promise<string[]> {
  return api.get<string[]>('/auditoria/acciones', { signal })
}
