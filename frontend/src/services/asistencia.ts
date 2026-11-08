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
  horarioId?: number
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
      horario_id: filtros.horarioId,
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

/** Resultado de cerrar un bloque: ausentes marcados y avisos encolados. */
export interface CierreBloque {
  horario_id: number
  fecha: string
  faltas_registradas: number
  notificaciones_encoladas: number
}

/**
 * POST /api/asistencia/cerrar-bloque (Director y Profesor): marca como
 * `falta` a los estudiantes del curso que no tienen registro en el bloque.
 */
export function cerrarBloque(
  horarioId: number,
  fecha?: string,
): Promise<CierreBloque> {
  return api.post<CierreBloque>('/asistencia/cerrar-bloque', {
    horario_id: horarioId,
    fecha,
  })
}

/**
 * PATCH /api/asistencia/{id}/salida-manual (Director y Profesor): registra
 * la salida de un estudiante. Si se omite `horaSalida`, el backend usa la
 * hora actual del colegio.
 */
export function registrarSalidaManual(
  asistenciaId: number,
  horaSalida?: string,
): Promise<RegistroAsistenciaCreado> {
  return api.patch<RegistroAsistenciaCreado>(
    `/asistencia/${asistenciaId}/salida-manual`,
    { hora_salida: horaSalida },
  )
}

/** Resultado de la salida masiva de un curso. */
export interface SalidaMasivaResultado {
  curso_id: number
  fecha: string
  hora_salida: string
  /** Estudiantes a los que se les registró la salida. */
  estudiantes: number
  /** Registros de asistencia actualizados (puede haber varios por estudiante). */
  salidas_registradas: number
  notificaciones_encoladas: number
}

/**
 * POST /api/asistencia/salida-masiva (Director y Profesor): registra la
 * misma hora de salida para todos los presentes del curso.
 */
export function registrarSalidaMasiva(
  cursoId: number,
  horaSalida?: string,
): Promise<SalidaMasivaResultado> {
  return api.post<SalidaMasivaResultado>('/asistencia/salida-masiva', {
    curso_id: cursoId,
    hora_salida: horaSalida,
  })
}

/**
 * POST /api/asistencia/salida-programada (solo Director): registra una salida
 * especial del curso y envía el motivo a los tutores. La hora no puede ser
 * posterior a la actual.
 */
export function programarSalida(
  cursoId: number,
  horaSalida: string | undefined,
  motivo: string,
): Promise<SalidaMasivaResultado> {
  return api.post<SalidaMasivaResultado>('/asistencia/salida-programada', {
    curso_id: cursoId,
    hora_salida: horaSalida,
    motivo,
  })
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
  /** Materia del bloque de clase en curso. */
  materia: string | null
  /** Nombre completo del profesor que dicta la clase en curso. */
  profesor: string | null
  /** Hora de inicio del bloque en curso (HH:MM:SS). */
  hora_inicio: string | null
  /** Hora de fin del bloque en curso (HH:MM:SS). */
  hora_fin: string | null
}

/** GET /api/asistencia/qr: QR dinámico del estudiante autenticado. */
export function obtenerQrEstudiante(
  signal?: AbortSignal,
): Promise<CodigoQrEstudiante> {
  return api.get<CodigoQrEstudiante>('/asistencia/qr', { signal })
}
