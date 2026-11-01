import { api } from './api'

export interface Rol {
  id: number
  nombre: string
}

export interface Usuario {
  id: number
  ci: string
  nombres: string
  apellidos: string
  rol_id: number
  activo: boolean
  bloqueado_hasta: string | null
  ultimo_acceso: string | null
  creado_en: string
  rol?: Rol | null
}

export interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  usuario: Usuario
}

export interface Credenciales {
  ci: string
  password: string
}

/** POST /api/auth/login */
export function login(credenciales: Credenciales): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', credenciales)
}

/** GET /api/auth/me: perfil del usuario dueño del token. */
export function obtenerPerfil(): Promise<Usuario> {
  return api.get<Usuario>('/auth/me')
}
