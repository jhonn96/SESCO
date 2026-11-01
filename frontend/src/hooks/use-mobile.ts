import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function suscribir(callback: () => void) {
  const mql = window.matchMedia(CONSULTA)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function esMovil(): boolean {
  return window.matchMedia(CONSULTA).matches
}

/** `true` cuando el viewport corresponde a un dispositivo móvil. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(suscribir, esMovil, () => false)
}
