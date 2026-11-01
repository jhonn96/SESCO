import type { Curso } from '@/services/cursos'

const NIVELES: Record<string, string> = {
  inicial: 'Inicial',
  primaria: 'Primaria',
  secundaria: 'Secundaria',
}

const TURNOS: Record<string, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
}

const ORDEN_NIVEL: Record<string, number> = {
  inicial: 0,
  primaria: 1,
  secundaria: 2,
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function nombreNivel(nivel: string): string {
  return NIVELES[nivel] ?? capitalizar(nivel)
}

export function nombreTurno(turno: string): string {
  return TURNOS[turno] ?? capitalizar(turno)
}

type CursoEtiquetable = Pick<Curso, 'nivel' | 'grado' | 'paralelo'>

/** Ejemplo: `Primaria 1° "A"`. */
export function etiquetaCurso(curso: CursoEtiquetable): string {
  return `${nombreNivel(curso.nivel)} ${curso.grado}° "${curso.paralelo.trim()}"`
}

/** Ejemplo: `1° "A"`. */
export function etiquetaCortaCurso(curso: CursoEtiquetable): string {
  return `${curso.grado}° "${curso.paralelo.trim()}"`
}

/** Ordena por nivel, grado y paralelo para los filtros. */
export function compararCursos(a: Curso, b: Curso): number {
  return (
    (ORDEN_NIVEL[a.nivel] ?? 99) - (ORDEN_NIVEL[b.nivel] ?? 99) ||
    a.grado - b.grado ||
    a.paralelo.localeCompare(b.paralelo)
  )
}
