import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AuthContext, type AuthContextValue } from '@/contexts/auth-context'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/services/api'
import type { LoginResponse, Usuario } from '@/services/auth'

const USUARIO_KEY = 'sesco_usuario'

function leerUsuarioGuardado(): Usuario | null {
  try {
    const guardado = localStorage.getItem(USUARIO_KEY)
    return guardado ? (JSON.parse(guardado) as Usuario) : null
  } catch {
    return null
  }
}

function guardarUsuario(usuario: Usuario | null): void {
  try {
    if (usuario) {
      localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario))
    } else {
      localStorage.removeItem(USUARIO_KEY)
    }
  } catch {
    // almacenamiento no disponible (modo privado, SSR, etc.)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken())
  const [usuario, setUsuario] = useState<Usuario | null>(() =>
    leerUsuarioGuardado(),
  )

  const iniciarSesion = useCallback((sesion: LoginResponse) => {
    setAccessToken(sesion.access_token)
    guardarUsuario(sesion.usuario)
    setToken(sesion.access_token)
    setUsuario(sesion.usuario)
  }, [])

  const cerrarSesion = useCallback(() => {
    clearAccessToken()
    guardarUsuario(null)
    setToken(null)
    setUsuario(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      usuario,
      isAuthenticated: Boolean(token),
      iniciarSesion,
      cerrarSesion,
    }),
    [token, usuario, iniciarSesion, cerrarSesion],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
