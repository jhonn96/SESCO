import { useContext } from 'react'

import { AuthContext, type AuthContextValue } from '@/contexts/auth-context'

/** Acceso al estado de sesión. Debe usarse dentro de `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext)

  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }

  return contexto
}
