import { api } from './api'
import type { Curso } from './cursos'

/** Conteo de asistencias por estado. Espejo de `ResumenEstados` del backend. */
export interface ResumenEstados {
  registros: number
  presentes: number
  tardanzas: number
  faltas: number
  justificadas: number
}

/** Conteo de un día de la semana en curso. */
export interface SerieDia extends ResumenEstados {
  fecha: string
}

export interface CursoPanel {
  curso_id: number
  nivel: string
  grado: number
  paralelo: string
  turno: string
  periodo_id: number
  estudiantes: number
  hoy: ResumenEstados
  semana: ResumenEstados
  inasistencia_pct: number
  supera_umbral: boolean
}

/** Respuesta de `GET /api/reportes/panel`. */
export interface PanelAsistencia {
  generado_en: string
  fecha: string
  semana_inicio: string
  semana_fin: string
  umbral_inasistencia_pct: number
  total_estudiantes: number
  totales_hoy: ResumenEstados
  totales_semana: ResumenEstados
  inasistencia_pct: number
  serie_semana: SerieDia[]
  cursos: CursoPanel[]
}

export interface FiltrosPanel {
  fecha?: string
  periodoId?: number
}

/**
 * Panel de asistencia del director.
 *
 * El cliente `api` añade el token JWT y llama a `/api/reportes/panel`.
 * Si no se envía `fecha`, el backend usa la fecha local del colegio.
 */
export function obtenerPanel(
  filtros: FiltrosPanel = {},
  signal?: AbortSignal,
): Promise<PanelAsistencia> {
  return api.get<PanelAsistencia>('/reportes/panel', {
    query: { fecha: filtros.fecha, periodo_id: filtros.periodoId },
    signal,
  })
}

/** Conteo mensual dentro de un periodo lectivo. */
export interface MesComparacion extends ResumenEstados {
  /** Primer día del mes en formato ISO. */
  mes: string
  porcentaje_asistencia: number
}

/** Respuesta de `GET /api/reportes/comparacion-mensual`. */
export interface ComparacionMensual {
  generado_en: string
  periodo_id: number
  gestion: number
  trimestre: number
  desde: string
  hasta: string
  totales: ResumenEstados
  porcentaje_asistencia: number
  meses: MesComparacion[]
}

/** Comparación mes a mes de la asistencia de un periodo (solo Director). */
export function obtenerComparacionMensual(
  periodoId: number,
  signal?: AbortSignal,
): Promise<ComparacionMensual> {
  return api.get<ComparacionMensual>('/reportes/comparacion-mensual', {
    query: { periodo_id: periodoId },
    signal,
  })
}

/** Totales de un estudiante en el rango consultado. */
export interface EstudianteReporte {
  usuario_id: number
  apellido_paterno: string
  apellido_materno: string
  nombres: string
  /** Apellidos completos (`Paterno Materno`); se conserva por compatibilidad. */
  apellidos: string
  ci: string
  curso_id: number
  curso: Curso | null
  registros: number
  presentes: number
  tardanzas: number
  faltas: number
  justificadas: number
  porcentaje_asistencia: number
}

/** Respuesta de `GET /api/reportes/estudiantes`. */
export interface ReporteEstudiantes {
  generado_en: string
  desde: string
  hasta: string
  curso_id: number | null
  total_estudiantes: number
  totales: ResumenEstados
  estudiantes: EstudianteReporte[]
}

export interface FiltrosReporteEstudiantes {
  desde: string
  hasta: string
  cursoId?: number
}

/** Reporte por estudiante para un rango de fechas (solo Director). */
export function obtenerReporteEstudiantes(
  filtros: FiltrosReporteEstudiantes,
  signal?: AbortSignal,
): Promise<ReporteEstudiantes> {
  return api.get<ReporteEstudiantes>('/reportes/estudiantes', {
    query: {
      desde: filtros.desde,
      hasta: filtros.hasta,
      curso_id: filtros.cursoId,
    },
    signal,
  })
}

/** Tutor principal confirmado de un estudiante. */
export interface TutorRanking {
  tutor_id: number
  nombres: string
  apellidos: string
  ci: string
  parentesco: string
  telefono: string | null
  es_principal: boolean
}

/** Fila del ranking mensual de inasistencias. */
export interface RankingInasistencia {
  usuario_id: number
  nombres: string
  apellidos: string
  ci: string
  curso_id: number
  curso: Curso | null
  faltas: number
  tardanzas: number
  tutor: TutorRanking | null
  tutor_nombre: string | null
}

/** Respuesta de `GET /api/reportes/ranking-inasistencias`. */
export interface RankingInasistencias {
  generado_en: string
  desde: string
  hasta: string
  total_estudiantes: number
  estudiantes: RankingInasistencia[]
}

export interface FiltrosRankingInasistencias {
  desde?: string
  hasta?: string
  cursoId?: number
  periodoId?: number
  limit?: number
}

/** Ranking de estudiantes por faltas y tardanzas (solo Director). */
export function obtenerRankingInasistencias(
  filtros: FiltrosRankingInasistencias = {},
  signal?: AbortSignal,
): Promise<RankingInasistencias> {
  return api.get<RankingInasistencias>('/reportes/ranking-inasistencias', {
    query: {
      desde: filtros.desde,
      hasta: filtros.hasta,
      curso_id: filtros.cursoId,
      periodo_id: filtros.periodoId,
      limit: filtros.limit,
    },
    signal,
  })
}
