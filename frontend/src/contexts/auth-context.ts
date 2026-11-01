import { createContext } from 'react'

import type { LoginResponse, Usuario } from '@/services/auth'

export interface AuthContextValue {
  /** JWT vigente (persistido en `localStorage`). */
  token: string | null
  /** Datos del usuario autenticado (persistidos en `localStorage`). */
  usuario: Usuario | null
  /** `true` cuando hay un token guardado. */
  isAuthenticated: boolean
  /** Guarda el token y el usuario de una sesión recién iniciada. */
  iniciarSesion: (sesion: LoginResponse) => void
  /** Elimina la sesión del estado y del `localStorage`. */
  cerrarSesion: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
