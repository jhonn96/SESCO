import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  ThemeContext,
  type ThemeContextValue,
  type Tema,
} from '@/contexts/theme-context'

/** Clave de `localStorage` donde se recuerda la preferencia del usuario. */
export const TEMA_KEY = 'sesco_tema'

function leerTemaInicial(): Tema {
  try {
    const guardado = localStorage.getItem(TEMA_KEY)
    if (guardado === 'light' || guardado === 'dark') return guardado
  } catch {
    // almacenamiento no disponible (modo privado, SSR, etc.)
  }

  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }

  return 'light'
}

function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(TEMA_KEY, tema)
  } catch {
    // sin persistencia: el tema sigue funcionando durante la sesión
  }
}

/**
 * Aplica la clase `dark` en `<html>` y expone el tema activo.
 *
 * El primer pintado lo resuelve el script de `index.html` para evitar el
 * destello claro al recargar en modo oscuro.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(leerTemaInicial)

  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle('dark', tema === 'dark')
    raiz.style.colorScheme = tema
  }, [tema])

  const alternarTema = useCallback(() => {
    setTema((actual) => {
      const siguiente: Tema = actual === 'dark' ? 'light' : 'dark'
      guardarTema(siguiente)
      return siguiente
    })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ tema, esOscuro: tema === 'dark', alternarTema }),
    [tema, alternarTema],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
