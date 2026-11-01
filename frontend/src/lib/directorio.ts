import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import type { Estudiante } from '@/services/estudiantes'
import type { Curso } from '@/services/cursos'

export interface DatosEstudiante {
  nombre: string
  ci: string | null
  curso: Curso | null
  iniciales: string
  encontrado: boolean
}

/**
 * Resuelve nombre, CI y curso desde el directorio cacheado. Si el estudiante
 * aún no está disponible se muestra un identificador legible.
 */
export function datosEstudiante(
  directorio: Map<number, Estudiante> | undefined,
  usuarioId: number,
): DatosEstudiante {
  const estudiante = directorio?.get(usuarioId)

  if (!estudiante) {
    return {
      nombre: `Estudiante #${usuarioId}`,
      ci: null,
      curso: null,
      iniciales: '#',
      encontrado: false,
    }
  }

  return {
    nombre: nombreCompleto(estudiante.usuario) || `Estudiante #${usuarioId}`,
    ci: estudiante.usuario?.ci ?? null,
    curso: estudiante.curso,
    iniciales: inicialesPersona(estudiante.usuario),
    encontrado: true,
  }
}
