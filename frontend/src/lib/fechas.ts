const ZONA = 'es-BO'

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Convierte una fecha ISO (`YYYY-MM-DD`) a `Date` local sin desfase de zona. */
function aFechaLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** Fecha de hoy en formato `YYYY-MM-DD` según la zona local del navegador. */
export function hoyIso(): string {
  const ahora = new Date()
  const anio = ahora.getFullYear()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/** Ejemplo: "Miércoles, 21 de octubre de 2026". */
export function formatearFechaLarga(iso: string): string {
  const texto = new Intl.DateTimeFormat(ZONA, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(aFechaLocal(iso))

  return capitalizar(texto)
}

/** Ejemplo: "5 feb 2024". */
export function formatearFecha(iso: string): string {
  const texto = new Intl.DateTimeFormat(ZONA, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(aFechaLocal(iso))
    .replace(/\./g, '')

  return capitalizar(texto)
}

/** Ejemplo: "21 oct". */
export function formatearFechaCorta(iso: string): string {
  const texto = new Intl.DateTimeFormat(ZONA, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(aFechaLocal(iso))
    .replace(/\./g, '')
    .replace(/,\s*/g, ' ')

  return capitalizar(texto)
}

/** Ejemplo: "21 oct, 18:30" para marcas de tiempo completas. */
export function formatearFechaHora(iso: string): string {
  const texto = new Intl.DateTimeFormat(ZONA, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(/\./g, '')

  return capitalizar(texto)
}

/** Ejemplo: "Mié". */
export function diaCorto(iso: string): string {
  const texto = new Intl.DateTimeFormat(ZONA, { weekday: 'short' })
    .format(aFechaLocal(iso))
    .replace(/\./g, '')

  return capitalizar(texto)
}

/** Hora local de un instante ISO, por ejemplo "23:33". */
export function formatearHora(iso: string): string {
  return new Intl.DateTimeFormat(ZONA, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

// --------------------------------------------------------------------------
// Zona horaria del colegio (Bolivia, UTC-4 sin horario de verano)
// --------------------------------------------------------------------------

/** Zona IANA del colegio; se usa para horarios y bloques "en curso". */
export const ZONA_COLEGIO = 'America/La_Paz'

/** Desfase fijo del colegio respecto a UTC (Bolivia no aplica DST). */
const DESFASE_COLEGIO_MIN = -4 * 60

/** Días hábiles de la grilla, en el orden de `Date#getUTCDay()` (lunes = 1). */
const DIAS_HABILES = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
] as const

export type DiaColegio = (typeof DIAS_HABILES)[number]

export interface PosicionColegio {
  /** Día hábil actual o `null` en fin de semana. */
  dia: DiaColegio | null
  /** Minutos transcurridos desde la medianoche del colegio. */
  minutos: number
  /** Fecha actual del colegio en formato `YYYY-MM-DD`. */
  fecha: string
}

/** Día, minutos y fecha actuales en la zona horaria del colegio. */
export function posicionEnColegio(ahora: Date = new Date()): PosicionColegio {
  const local = new Date(ahora.getTime() + DESFASE_COLEGIO_MIN * 60_000)
  const indice = local.getUTCDay()
  const dia = indice >= 1 && indice <= 5 ? DIAS_HABILES[indice - 1] : null

  return {
    dia,
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes(),
    fecha: local.toISOString().slice(0, 10),
  }
}

/** Hora actual en formato "HH:MM" según la zona del colegio. */
export function horaActualEnColegio(ahora: Date = new Date()): string {
  const { minutos } = posicionEnColegio(ahora)
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/** Hora "HH:MM" de un instante ISO en la zona del colegio. */
export function formatearHoraEnColegio(iso: string): string {
  return new Intl.DateTimeFormat(ZONA, {
    timeZone: ZONA_COLEGIO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Minutos desde la medianoche de una hora `HH:MM` o `HH:MM:SS`. */
export function minutosDeHora(hora: string): number {
  const [horas, minutos] = hora.split(':')
  return Number(horas) * 60 + Number(minutos)
}
