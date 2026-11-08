import { api, type PeticionPaginada } from './api'
import type { Curso } from './cursos'

export type TipoAlerta =
  | 'faltas'
  | 'tardanzas'
  | 'inasistencia'
  | 'curso_sin_registro'

export interface AlertaEstudiante {
  usuario_id: number
  curso_id: number
}

/** Alerta automática de asistencia (RF-06/RF-07). */
export interface Alerta {
  id: number
  estudiante_id: number | null
  curso_id: number | null
  tipo: TipoAlerta
  detalle: string | null
  generada_en: string
  dia: string | null
  atendida: boolean
  atendida_por: number | null
  atendida_en: string | null
  estudiante: AlertaEstudiante | null
  curso: Curso | null
}

export interface FiltrosAlertas {
  tipo?: TipoAlerta
  atendida?: boolean
  estudianteId?: number
  desde?: string
  hasta?: string
  skip?: number
  limit?: number
}

/** GET /api/alertas (solo Director). */
export function listarAlertas(
  filtros: FiltrosAlertas = {},
  signal?: AbortSignal,
): Promise<PeticionPaginada<Alerta[]>> {
  return api.getPaginado<Alerta[]>('/alertas', {
    query: {
      tipo: filtros.tipo,
      atendida: filtros.atendida,
      estudiante_id: filtros.estudianteId,
      desde: filtros.desde,
      hasta: filtros.hasta,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 10,
    },
    signal,
  })
}

/** PATCH /api/alertas/{id}/atender (solo Director). */
export function atenderAlerta(alertaId: number): Promise<Alerta> {
  return api.patch<Alerta>(`/alertas/${alertaId}/atender`)
}

/** Tutor principal confirmado del estudiante. */
export interface TutorAlerta {
  tutor_id: number
  nombres: string
  apellidos: string
  ci: string
  parentesco: string
  telefono: string | null
  es_principal: boolean
}

/** Estudiante de los cursos del profesor que alcanzó un umbral de alerta. */
export interface EstudianteRiesgo {
  estudiante_id: number
  nombres: string
  apellidos: string
  ci: string
  curso_id: number
  curso: Curso
  faltas_consecutivas: number
  tardanzas_mes: number
  umbral_faltas: number
  umbral_tardanzas: number
  motivos: string[]
  tutor: TutorAlerta | null
  notificado_hoy: boolean
}

/** Respuesta de `GET /api/alertas/profesor` (solo Profesor). */
export interface RiesgoProfesor {
  generado_en: string
  fecha: string
  umbral_faltas: number
  umbral_tardanzas: number
  total_estudiantes: number
  estudiantes: EstudianteRiesgo[]
}

/** GET /api/alertas/profesor: estudiantes en riesgo de mis cursos. */
export function obtenerRiesgoProfesor(
  fecha?: string,
  signal?: AbortSignal,
): Promise<RiesgoProfesor> {
  return api.get<RiesgoProfesor>('/alertas/profesor', {
    query: { fecha },
    signal,
  })
}

/** Respuesta de `POST /api/alertas/estudiantes/{id}/notificar-tutor`. */
export interface NotificacionTutor {
  notificacion_id: number
  estudiante_id: number
  tutor_id: number
  tutor_nombre: string
  mensaje: string
  creada: boolean
}

/** POST /api/alertas/estudiantes/{id}/notificar-tutor (solo Profesor). */
export function notificarTutor(estudianteId: number): Promise<NotificacionTutor> {
  return api.post<NotificacionTutor>(
    `/alertas/estudiantes/${estudianteId}/notificar-tutor`,
  )
}
