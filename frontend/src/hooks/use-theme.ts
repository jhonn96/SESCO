import { useContext } from 'react'

import { ThemeContext, type ThemeContextValue } from '@/contexts/theme-context'

/** Acceso al tema activo. Debe usarse dentro de `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const contexto = useContext(ThemeContext)

  if (!contexto) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  }

  return contexto
}
