import type { Usuario } from '@/services/auth'

export type RolNombre = 'director' | 'profesor' | 'estudiante' | 'tutor'

const ROL_POR_ID: Record<number, RolNombre> = {
  1: 'director',
  2: 'profesor',
  3: 'estudiante',
  4: 'tutor',
}

/** Ids del catálogo `rol` definidos en el esquema. */
export const IDS_ROL: Record<RolNombre, number> = {
  director: 1,
  profesor: 2,
  estudiante: 3,
  tutor: 4,
}

/** Ruta inicial de cada rol tras iniciar sesión. */
export const RUTA_POR_ROL: Record<RolNombre, string> = {
  director: '/director',
  profesor: '/profesor',
  estudiante: '/estudiante',
  tutor: '/tutor',
}

/** Nombre legible del rol para la interfaz. */
export const ETIQUETA_ROL: Record<RolNombre, string> = {
  director: 'Director',
  profesor: 'Profesor',
  estudiante: 'Estudiante',
  tutor: 'Tutor',
}

function esRolNombre(valor: string | null | undefined): valor is RolNombre {
  return (
    valor === 'director' ||
    valor === 'profesor' ||
    valor === 'estudiante' ||
    valor === 'tutor'
  )
}

/**
 * Nombre del rol del usuario. Usa `usuario.rol.nombre` y, si no viniera,
 * cae al catálogo fijo de `rol_id` (1..4) del esquema.
 */
export function nombreRol(usuario: Usuario | null): RolNombre | null {
  if (!usuario) return null

  const nombre = usuario.rol?.nombre?.toLowerCase()
  if (esRolNombre(nombre)) return nombre

  return ROL_POR_ID[usuario.rol_id] ?? null
}

export function rutaPorRol(rol: RolNombre): string {
  return RUTA_POR_ROL[rol]
}
