import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/hooks/use-auth'
import { nombreRol, rutaPorRol, type RolNombre } from '@/lib/roles'

interface ProtectedRouteProps {
  /** Si se indica, solo ese rol puede acceder; los demás vuelven a su inicio. */
  rol?: RolNombre
}

/**
 * Protege las rutas privadas: sin token redirige a `/login`; con un rol
 * distinto al exigido redirige al inicio del rol del usuario.
 */
export function ProtectedRoute({ rol }: ProtectedRouteProps) {
  const { isAuthenticated, usuario } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (rol) {
    const rolActual = nombreRol(usuario)
    if (rolActual !== rol) {
      return (
        <Navigate
          to={rolActual ? rutaPorRol(rolActual) : '/login'}
          replace
        />
      )
    }
  }

  return <Outlet />
}
