import { createContext } from 'react'

export type Tema = 'light' | 'dark'

export interface ThemeContextValue {
  /** Tema activo de la aplicación. */
  tema: Tema
  /** Atajo para saber si el modo oscuro está activo. */
  esOscuro: boolean
  /** Alterna entre modo claro y oscuro y persiste la elección. */
  alternarTema: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
