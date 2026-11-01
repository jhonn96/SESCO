import type { Usuario } from '@/services/auth'

type Persona = Pick<Usuario, 'nombres' | 'apellidos'>

/** Ejemplo: `Limbert Javier Ortuño Yujra`. */
export function nombreCompleto(persona: Persona | null | undefined): string {
  if (!persona) return ''
  return `${persona.nombres} ${persona.apellidos}`.trim()
}

/** Iniciales para el avatar de las tablas. */
export function inicialesPersona(persona: Persona | null | undefined): string {
  if (!persona) return '?'
  const primera = persona.nombres.trim().charAt(0)
  const segunda = persona.apellidos.trim().charAt(0)
  return `${primera}${segunda}`.toUpperCase() || '?'
}

const COLADOR_PERSONAS = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
})

/**
 * Divide `apellidos` en apellido paterno y materno. La base de datos guarda
 * ambos apellidos separados por un espacio (`Mendoza Aliaga`).
 */
export function partesApellidos(
  apellidos: string | null | undefined,
): [string, string] {
  const partes = (apellidos ?? '').trim().split(/\s+/)
  return [partes[0] ?? '', partes[1] ?? '']
}

/**
 * Orden escolar de las listas: apellido paterno, apellido materno y nombres.
 * Es el mismo criterio que aplica el backend con `split_part` en SQL.
 */
export function compararPersonas(
  a: Persona | null | undefined,
  b: Persona | null | undefined,
): number {
  const [paternoA, maternoA] = partesApellidos(a?.apellidos)
  const [paternoB, maternoB] = partesApellidos(b?.apellidos)

  return (
    COLADOR_PERSONAS.compare(paternoA, paternoB) ||
    COLADOR_PERSONAS.compare(maternoA, maternoB) ||
    COLADOR_PERSONAS.compare(a?.nombres ?? '', b?.nombres ?? '')
  )
}
