import { api, type PeticionPaginada } from './api'
import type { Curso } from './cursos'

export interface MateriaAsistencia {
  id: number
  nombre: string
}

export type EstadoAsistencia =
  | 'presente'
  | 'tardanza'
  | 'falta'
  | 'justificada'

export type OrigenAsistencia = 'qr' | 'manual'

export interface HorarioAsistencia {
  id: number
  curso_id: number
  materia_id: number
  hora_inicio: string
  hora_fin: string
  es_ultimo_bloque: boolean
  materia: MateriaAsistencia | null
  curso: Curso | null
}

export interface RegistroAsistencia {
  id: number
  estudiante_id: number
  horario_id: number
  fecha: string
  estado: EstadoAsistencia
  origen: OrigenAsistencia
  hora_ingreso: string | null
  hora_salida: string | null
  minutos_retraso: number
  registrado_por: number | null
  creado_en: string
  estudiante: { usuario_id: number; curso_id: number } | null
  horario: HorarioAsistencia | null
}

export interface RegistroAsistenciaCreado extends RegistroAsistencia {
  notificacion_encolada: boolean
}

export interface FiltrosAsistencias {
  fecha: string
  cursoId?: number
  estado?: EstadoAsistencia
  skip?: number
  limit?: number
}

/** GET /api/asistencia (Director y Profesor). */
export function listarAsistencias(
  filtros: FiltrosAsistencias,
  signal?: AbortSignal,
): Promise<PeticionPaginada<RegistroAsistencia[]>> {
  return api.getPaginado<RegistroAsistencia[]>('/asistencia', {
    query: {
      fecha: filtros.fecha,
      curso_id: filtros.cursoId,
      estado: filtros.estado,
      skip: filtros.skip ?? 0,
      limit: filtros.limit ?? 15,
    },
    signal,
  })
}

/** POST /api/asistencia/escanear: registra la asistencia desde el QR. */
export function escanearAsistencia(
  contenido: string,
  horarioId?: number,
): Promise<RegistroAsistenciaCreado> {
  return api.post<RegistroAsistenciaCreado>('/asistencia/escanear', {
    contenido,
    horario_id: horarioId,
  })
}

/** Registro manual para estudiantes sin celular. */
export interface AsistenciaManual {
  estudiante_id: number
  /** Si se omite, el backend deduce el bloque vigente del curso. */
  horario_id?: number
  fecha?: string
  estado?: EstadoAsistencia
  hora_ingreso?: string
  minutos_retraso?: number
}

/** POST /api/asistencia/manual: guarda un registro con `origen='manual'`. */
export function registrarAsistenciaManual(
  datos: AsistenciaManual,
): Promise<RegistroAsistenciaCreado> {
  return api.post<RegistroAsistenciaCreado>('/asistencia/manual', datos)
}

/** Código TOTP vigente del estudiante autenticado. */
export interface CodigoQrEstudiante {
  estudiante_id: number
  /** 8 dígitos TOTP. */
  codigo: string
  /** Texto dibujado en el QR: `SESCO|ID_ESTUDIANTE|CODIGO`. */
  contenido: string
  ventana: number
  ventana_seg: number
  expira_en: string
  segundos_restantes: number
}

/** GET /api/asistencia/qr: QR dinámico del estudiante autenticado. */
export function obtenerQrEstudiante(
  signal?: AbortSignal,
): Promise<CodigoQrEstudiante> {
  return api.get<CodigoQrEstudiante>('/asistencia/qr', { signal })
}
