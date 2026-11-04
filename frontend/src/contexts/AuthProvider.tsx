import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdleTimer } from 'react-idle-timer'
import { toast } from 'sonner'

import { AuthContext, type AuthContextValue } from '@/contexts/auth-context'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/services/api'
import type { LoginResponse, Usuario } from '@/services/auth'

const USUARIO_KEY = 'sesco_usuario'

/** RNF-02: cierre de sesión tras 15 minutos sin actividad. */
const TIEMPO_INACTIVIDAD = 15 * 60 * 1000

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
  const navigate = useNavigate()
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

  const cerrarPorInactividad = useCallback(() => {
    if (!token) return
    cerrarSesion()
    toast.info('Sesión cerrada por inactividad')
    navigate('/login', { replace: true })
  }, [token, cerrarSesion, navigate])

  // La librería reinicia la cuenta atrás con mouse, clic, teclado y demás
  // eventos de actividad; solo se detiene mientras no haya sesión iniciada.
  useIdleTimer({
    timeout: TIEMPO_INACTIVIDAD,
    disabled: !token,
    onIdle: cerrarPorInactividad,
  })

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
