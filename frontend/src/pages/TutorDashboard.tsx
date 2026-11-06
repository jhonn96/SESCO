import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  HeartHandshake,
  Inbox,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  Send,
  Star,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { ESTADOS_ASISTENCIA } from '@/lib/asistencia'
import { mensajeDeError } from '@/lib/errores'
import {
  diaCorto,
  formatearFechaCorta,
  formatearFechaHora,
  hoyIso,
} from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  confirmarAviso,
  listarAvisos,
  type Aviso,
  type TipoAviso,
} from '@/services/avisos'
import {
  crearJustificacion,
  type EstadoJustificacion,
} from '@/services/justificaciones'
import { listarNotificaciones } from '@/services/notificaciones'
import {
  obtenerHistorialHijo,
  obtenerMisHijos,
  obtenerResumenHijo,
  type CursoHijo,
  type HijoDelTutor,
  type HistorialHijo,
} from '@/services/tutores'
import type { PuntoSerieSemanal } from '@/components/AsistenciaSemanalChart'

const AsistenciaSemanalChart = lazy(() =>
  import('@/components/AsistenciaSemanalChart').then((modulo) => ({
    default: modulo.AsistenciaSemanalChart,
  })),
)

/** Registros recientes que se consultan por hijo (máximo del backend). */
const LIMITE_HISTORIAL = 100
/** Comunicados visibles en la bandeja. */
const LIMITE_AVISOS = 6
/** Citaciones que se revisan para detectar recordatorios pendientes. */
const LIMITE_CITACIONES = 50
/** Incidencias que se listan en el panel; el resto queda en el historial. */
const LIMITE_INCIDENCIAS = 6
/** Mínimo del backend para el motivo de una justificación. */
const MOTIVO_MIN = 10
/** Días con registros que se dibujan en la evolución de asistencia. */
const DIAS_GRAFICA = 10

const HISTORIAL_VACIO: HistorialHijo[] = []

const ETIQUETA_NIVEL: Record<string, string> = {
  inicial: 'Inicial',
  primaria: 'Primaria',
  secundaria: 'Secundaria',
}

const ETIQUETA_TURNO: Record<string, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
}

const ESTILO_TIPO_AVISO: Record<
  TipoAviso,
  { etiqueta: string; variante: 'info' | 'warning' | 'destructive' }
> = {
  general: { etiqueta: 'General', variante: 'info' },
  citacion: { etiqueta: 'Citación', variante: 'warning' },
  urgente: { etiqueta: 'Urgente', variante: 'destructive' },
}

const ETIQUETA_JUSTIFICACION: Record<
  EstadoJustificacion,
  { texto: string; variante: 'warning' | 'success' | 'destructive' }
> = {
  pendiente: { texto: 'Justificación pendiente', variante: 'warning' },
  aprobada: { texto: 'Justificación aprobada', variante: 'success' },
  rechazada: { texto: 'Justificación rechazada', variante: 'destructive' },
}

function nombreCompleto(hijo: HijoDelTutor): string {
  return `${hijo.nombres} ${hijo.apellidos}`.trim()
}

function cursoCorto(curso: CursoHijo | null): string {
  return curso ? `${curso.grado}° ${curso.paralelo}` : 'Sin curso'
}

function cursoCompleto(curso: CursoHijo | null): string {
  if (!curso) return 'Sin curso asignado'
  const nivel = ETIQUETA_NIVEL[curso.nivel] ?? curso.nivel
  const turno = ETIQUETA_TURNO[curso.turno] ?? curso.turno
  return `${curso.grado}° ${curso.paralelo} · ${nivel} (${turno})`
}

function iniciales(hijo: HijoDelTutor): string {
  return `${hijo.nombres[0] ?? ''}${hijo.apellidos[0] ?? ''}`.toUpperCase()
}

/** Rango horario legible, por ejemplo "08:00–08:45". */
function rangoHorario(inicio: string | null, fin: string | null): string | null {
  if (!inicio || !fin) return null
  return `${inicio.slice(0, 5)}–${fin.slice(0, 5)}`
}

function esJustificable(registro: HistorialHijo): boolean {
  return registro.estado === 'falta' || registro.estado === 'tardanza'
}

/** Entrega del aviso al tutor autenticado (el backend solo envía la propia). */
function entregaDe(aviso: Aviso) {
  return aviso.destinatarios?.[0]
}

/** Una citación sigue pendiente mientras el tutor no confirme la lectura. */
function esCitacionPendiente(aviso: Aviso): boolean {
  return aviso.tipo === 'citacion' && !entregaDe(aviso)?.confirmado_en
}

/** Resumen legible de las novedades de un hijo. */
function textoNovedades(hijo: HijoDelTutor): string {
  const partes: string[] = []

  if (hijo.notificaciones_pendientes > 0) {
    partes.push(
      hijo.notificaciones_pendientes === 1
        ? '1 notificación pendiente'
        : `${hijo.notificaciones_pendientes} notificaciones pendientes`,
    )
  }

  if (hijo.faltas_recientes > 0) {
    partes.push(
      hijo.faltas_recientes === 1
        ? '1 incidencia reciente'
        : `${hijo.faltas_recientes} incidencias recientes`,
    )
  }

  return partes.join(' · ')
}

/**
 * Agrupa los registros por fecha y calcula el porcentaje diario de presentes,
 * tardanzas y faltas para la gráfica de evolución.
 */
function construirSerieEvolucion(
  registros: HistorialHijo[],
): PuntoSerieSemanal[] {
  const porFecha = new Map<
    string,
    { presente: number; tardanza: number; falta: number }
  >()

  for (const registro of registros) {
    const conteo = porFecha.get(registro.fecha) ?? {
      presente: 0,
      tardanza: 0,
      falta: 0,
    }

    if (registro.estado === 'presente') conteo.presente += 1
    else if (registro.estado === 'tardanza') conteo.tardanza += 1
    else if (registro.estado === 'falta') conteo.falta += 1

    porFecha.set(registro.fecha, conteo)
  }

  return [...porFecha.entries()]
    .filter(([, conteo]) => conteo.presente + conteo.tardanza + conteo.falta > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-DIAS_GRAFICA)
    .map(([fecha, conteo]) => {
      const total = conteo.presente + conteo.tardanza + conteo.falta
      const porcentaje = (cantidad: number) =>
        total > 0 ? Math.round((cantidad / total) * 1000) / 10 : null

      return {
        dia: `${diaCorto(fecha)} ${Number(fecha.slice(8, 10))}`,
        fecha: formatearFechaCorta(fecha),
        presentes: porcentaje(conteo.presente),
        tardanzas: porcentaje(conteo.tardanza),
        faltas: porcentaje(conteo.falta),
        registros: total,
      }
    })
}

/**
 * Panel del rol Tutor.
 *
 * En escritorio usa dos columnas (resumen y evolución a la izquierda; buzón de
 * comunicados a la derecha). En móvil todo se apila en una sola columna.
 */
export function TutorDashboard() {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const hoy = hoyIso()

  const [hijoId, setHijoId] = useState<number | null>(null)
  const [justificando, setJustificando] = useState<HistorialHijo | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null)

  const fueraDePlazo = justificando !== null && justificando.fecha !== hoy

  const hijosQuery = useQuery({
    queryKey: ['tutor', 'hijos'],
    queryFn: ({ signal }) => obtenerMisHijos(signal),
    staleTime: 60_000,
  })

  const hijos = hijosQuery.data ?? []
  const hijoActivo =
    hijos.find((hijo) => hijo.usuario_id === hijoId) ?? hijos[0] ?? null
  const idHijo = hijoActivo?.usuario_id ?? null

  const resumenQuery = useQuery({
    queryKey: ['tutor', 'resumen', idHijo],
    queryFn: ({ signal }) => obtenerResumenHijo(idHijo as number, signal),
    enabled: idHijo !== null,
  })

  const historialQuery = useQuery({
    queryKey: ['tutor', 'historial', idHijo],
    queryFn: ({ signal }) =>
      obtenerHistorialHijo(idHijo as number, LIMITE_HISTORIAL, signal),
    enabled: idHijo !== null,
  })

  const avisosQuery = useQuery({
    queryKey: ['tutor', 'avisos'],
    queryFn: ({ signal }) => listarAvisos({ limit: LIMITE_AVISOS }, signal),
    staleTime: 60_000,
  })

  const citacionesQuery = useQuery({
    queryKey: ['tutor', 'citaciones'],
    queryFn: ({ signal }) =>
      listarAvisos({ tipo: 'citacion', limit: LIMITE_CITACIONES }, signal),
    staleTime: 60_000,
  })

  const notificacionesQuery = useQuery({
    queryKey: ['tutor', 'notificaciones', 'resumen'],
    queryFn: ({ signal }) =>
      listarNotificaciones({ soloNoLeidas: true, limit: 1 }, signal),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const justificar = useMutation({
    mutationFn: crearJustificacion,
    onSuccess: () => {
      toast.success('Justificación enviada', {
        description:
          'El colegio revisará tu descargo y te notificará la respuesta.',
      })
      setJustificando(null)
      setMotivo('')
      setErrorMotivo(null)
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'historial'] })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'resumen'] })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'hijos'] })
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'historial-completo'],
      })
    },
    onError: (error) =>
      setErrorMotivo(
        mensajeDeError(error, 'No se pudo enviar la justificación.'),
      ),
  })

  const confirmar = useMutation({
    mutationFn: confirmarAviso,
    onSuccess: () => {
      toast.success('Lectura confirmada', {
        description: 'El colegio ya sabe que leíste el comunicado.',
      })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'avisos'] })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'citaciones'] })
    },
    onError: (error) =>
      toast.error('No se pudo confirmar la lectura', {
        description: mensajeDeError(error),
      }),
  })

  const nombreTutor = usuario
    ? `${usuario.nombres} ${usuario.apellidos}`.trim()
    : 'Tutor'
  const primerNombre = usuario?.nombres.trim() || 'tutor'

  const registros = historialQuery.data ?? HISTORIAL_VACIO
  const incidencias = registros.filter(esJustificable)
  const incidenciasVisibles = incidencias.slice(0, LIMITE_INCIDENCIAS)

  const avisos = avisosQuery.data?.data ?? []
  const citacionesPendientes = (citacionesQuery.data?.data ?? []).filter(
    esCitacionPendiente,
  )
  const idsCitacionesPendientes = new Set(
    citacionesPendientes.map((aviso) => aviso.id),
  )
  const otrosAvisos = avisos.filter(
    (aviso) => !idsCitacionesPendientes.has(aviso.id),
  )

  const serieEvolucion = useMemo(
    () => construirSerieEvolucion(registros),
    [registros],
  )

  const notificacionesPendientes = notificacionesQuery.data?.total ?? 0

  const actualizando =
    hijosQuery.isFetching ||
    resumenQuery.isFetching ||
    historialQuery.isFetching ||
    avisosQuery.isFetching ||
    citacionesQuery.isFetching ||
    notificacionesQuery.isFetching

  function actualizarTodo() {
    void hijosQuery.refetch()
    void resumenQuery.refetch()
    void historialQuery.refetch()
    void avisosQuery.refetch()
    void citacionesQuery.refetch()
    void notificacionesQuery.refetch()
  }

  function abrirJustificacion(registro: HistorialHijo) {
    setJustificando(registro)
    setMotivo('')
    setErrorMotivo(null)
  }

  function cerrarJustificacion() {
    setJustificando(null)
    setMotivo('')
    setErrorMotivo(null)
  }

  function enviarJustificacion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!justificando) return

    if (justificando.fecha !== hoy) {
      setErrorMotivo(
        'Solo puedes enviar la justificación el mismo día de la falta o tardanza.',
      )
      return
    }

    const texto = motivo.trim()
    if (texto.length < MOTIVO_MIN) {
      setErrorMotivo(
        `Describe el motivo con al menos ${MOTIVO_MIN} caracteres.`,
      )
      return
    }

    setErrorMotivo(null)
    justificar.mutate({ asistencia_id: justificando.id, motivo: texto })
  }

  // ------------------------------------------------------------------------
  // Buzón de comunicados y citaciones (columna derecha en escritorio)
  // ------------------------------------------------------------------------
  const buzonComunicados = (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader className="border-b border-border/70">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg">
              Buzón de Comunicados y Citaciones
            </CardTitle>
            <CardDescription>
              Últimos avisos del colegio. Confirma la lectura para dejar
              constancia.
            </CardDescription>
          </div>
        </div>
        {citacionesPendientes.length > 0 ? (
          <CardAction>
            <Badge variant="destructive">
              <CalendarClock aria-hidden="true" />
              {citacionesPendientes.length}{' '}
              {citacionesPendientes.length === 1 ? 'pendiente' : 'pendientes'}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {avisosQuery.isLoading ? (
          <div className="space-y-3" role="status">
            {Array.from({ length: 3 }).map((_, indice) => (
              <div key={indice} className="space-y-2 rounded-xl border p-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
            <span className="sr-only">Cargando comunicados…</span>
          </div>
        ) : avisosQuery.isError ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <AlertTriangle
              className="size-6 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {mensajeDeError(
                avisosQuery.error,
                'No se pudieron cargar los comunicados.',
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void avisosQuery.refetch()}
              disabled={avisosQuery.isFetching}
            >
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : avisos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Megaphone className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Sin comunicados por ahora</p>
            <p className="text-xs text-muted-foreground">
              Aquí verás los avisos y citaciones que el colegio envíe a los
              tutores.
            </p>
          </div>
        ) : (
          <>
            {citacionesPendientes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-destructive uppercase">
                  Citaciones pendientes
                </p>
                {citacionesPendientes.map((aviso) => (
                  <AvisoBuzon
                    key={aviso.id}
                    aviso={aviso}
                    destacado
                    confirmando={
                      confirmar.isPending && confirmar.variables === aviso.id
                    }
                    onConfirmar={(id) => confirmar.mutate(id)}
                  />
                ))}
              </div>
            ) : null}

            {otrosAvisos.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {citacionesPendientes.length > 0
                    ? 'Otros comunicados'
                    : 'Últimos comunicados'}
                </p>
                {otrosAvisos.map((aviso) => (
                  <AvisoBuzon
                    key={aviso.id}
                    aviso={aviso}
                    confirmando={
                      confirmar.isPending && confirmar.variables === aviso.id
                    }
                    onConfirmar={(id) => confirmar.mutate(id)}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )

  return (
    <DashboardShell seccion="Panel del tutor">
      <PageHeader
        titulo="Panel del tutor"
        descripcion={`Hola, ${primerNombre}. Revisa la asistencia de ${
          hijos.length > 1 ? 'tus hijos' : 'tu hijo'
        }, justifica faltas y confirma los comunicados del colegio.`}
        icono={HeartHandshake}
        acciones={
          <>
            <Button
              asChild
              variant={notificacionesPendientes > 0 ? 'default' : 'outline'}
              className="h-10"
            >
              <Link
                to="/tutor/notificaciones"
                aria-label={`Ver notificaciones${notificacionesPendientes > 0 ? `, ${notificacionesPendientes} sin leer` : ''}`}
              >
                <Bell aria-hidden="true" />
                Notificaciones
                {notificacionesPendientes > 0 ? (
                  <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-background/20 px-1.5 text-xs font-semibold tabular-nums">
                    {notificacionesPendientes}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={actualizarTodo}
              disabled={actualizando}
            >
              <RefreshCw
                className={cn('size-4', actualizando && 'animate-spin')}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Estudiantes vinculados: selección a lo ancho de la pantalla       */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="titulo-hijos" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="titulo-hijos"
              className="text-xl font-semibold tracking-tight"
            >
              Estudiantes vinculados
            </h2>
            <p className="text-sm text-muted-foreground">
              Selecciona un estudiante para actualizar su resumen, evolución y
              comunicados.
            </p>
          </div>
          {hijos.length > 0 ? (
            <Badge variant="outline" className="h-7 px-3">
              {hijos.length}{' '}
              {hijos.length === 1 ? 'estudiante' : 'estudiantes'}
            </Badge>
          ) : null}
        </div>

        {hijosQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 2 }).map((_, indice) => (
              <Card key={indice} className="shadow-sm">
                <CardContent className="flex items-center gap-3">
                  <Skeleton className="size-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : hijosQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
            <CardContent className="flex flex-wrap items-center gap-3">
              <AlertTriangle
                className="size-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-sm text-destructive">
                {mensajeDeError(
                  hijosQuery.error,
                  'No se pudieron cargar tus estudiantes.',
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void hijosQuery.refetch()}
                disabled={hijosQuery.isFetching}
              >
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : hijos.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold">
                Aún no tienes estudiantes vinculados
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                El director del colegio debe confirmar tu vínculo de tutoría.
                Cuando lo haga, aquí verás la asistencia de tus hijos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {hijos.map((hijo) => (
              <TarjetaHijo
                key={hijo.usuario_id}
                hijo={hijo}
                activo={hijo.usuario_id === hijoActivo?.usuario_id}
                onSeleccionar={() => setHijoId(hijo.usuario_id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Dos columnas: resumen/evolución + buzón                           */}
      {/* ---------------------------------------------------------------- */}
      {hijoActivo ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* KPIs */}
            <section aria-labelledby="titulo-kpis" className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="titulo-kpis"
                    className="text-xl font-semibold tracking-tight"
                  >
                    Resumen de asistencia
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Acumulado de {nombreCompleto(hijoActivo)}.
                  </p>
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarCheck2 className="size-4" aria-hidden="true" />
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TarjetaKpi
                  etiqueta="Presentes"
                  detalle="Días con asistencia"
                  valor={resumenQuery.data?.dias_presente}
                  cargando={resumenQuery.isLoading}
                  icono={CheckCircle2}
                  tono="success"
                />
                <TarjetaKpi
                  etiqueta="Tardanzas"
                  detalle="Registros con retraso"
                  valor={resumenQuery.data?.tardanzas}
                  cargando={resumenQuery.isLoading}
                  icono={Clock3}
                  tono="warning"
                />
                <TarjetaKpi
                  etiqueta="Faltas"
                  detalle="Inasistencias registradas"
                  valor={resumenQuery.data?.faltas}
                  cargando={resumenQuery.isLoading}
                  icono={XCircle}
                  tono="destructive"
                />
              </div>

              {resumenQuery.isError ? (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    {mensajeDeError(
                      resumenQuery.error,
                      'No se pudo cargar el resumen de asistencia.',
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void resumenQuery.refetch()}
                    disabled={resumenQuery.isFetching}
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    Reintentar
                  </Button>
                </div>
              ) : null}
            </section>

            {/* Evolución */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">
                  Evolución de asistencia
                </CardTitle>
                <CardDescription>
                  Últimos {DIAS_GRAFICA} días con registros de{' '}
                  {nombreCompleto(hijoActivo)}.
                </CardDescription>
                <CardAction>
                  <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                    Porcentaje diario
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent>
                {historialQuery.isLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-lg sm:h-[300px]" />
                ) : historialQuery.isError ? (
                  <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center sm:h-[300px]">
                    <AlertTriangle
                      className="size-6 text-destructive"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground">
                      {mensajeDeError(
                        historialQuery.error,
                        'No se pudo cargar la evolución de asistencia.',
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void historialQuery.refetch()}
                      disabled={historialQuery.isFetching}
                    >
                      <RefreshCw aria-hidden="true" />
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <Skeleton className="h-[260px] w-full rounded-lg sm:h-[300px]" />
                    }
                  >
                    <AsistenciaSemanalChart
                      datos={serieEvolucion}
                      alturaClase="h-[260px] sm:h-[300px]"
                      descripcionVacio="Aún no hay registros de asistencia para graficar la evolución."
                      etiqueta={`Evolución de asistencia de ${nombreCompleto(hijoActivo)}`}
                    />
                  </Suspense>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">{buzonComunicados}</div>
        </div>
      ) : !hijosQuery.isLoading && !hijosQuery.isError ? (
        <div className="lg:max-w-xl">{buzonComunicados}</div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Incidencias recientes (justificación del mismo día)               */}
      {/* ---------------------------------------------------------------- */}
      {hijoActivo ? (
        <section aria-labelledby="titulo-historial" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="titulo-historial"
                className="text-xl font-semibold tracking-tight"
              >
                Incidencias recientes
              </h2>
              <p className="text-sm text-muted-foreground">
                Faltas y tardanzas de {nombreCompleto(hijoActivo)} que puedes
                justificar el mismo día.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {incidencias.length > 0 ? (
                <Badge variant="warning">
                  {incidencias.length}{' '}
                  {incidencias.length === 1 ? 'incidencia' : 'incidencias'}
                </Badge>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link to="/tutor/asistencia">
                  <ClipboardList aria-hidden="true" />
                  Ver historial completo
                </Link>
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            {historialQuery.isLoading ? (
              <div className="space-y-4 p-4" role="status">
                {Array.from({ length: 4 }).map((_, indice) => (
                  <div key={indice} className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-lg" />
                  </div>
                ))}
                <span className="sr-only">Cargando historial…</span>
              </div>
            ) : historialQuery.isError ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <AlertTriangle
                  className="size-6 text-destructive"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  {mensajeDeError(
                    historialQuery.error,
                    'No se pudo cargar el historial.',
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void historialQuery.refetch()}
                  disabled={historialQuery.isFetching}
                >
                  <RefreshCw aria-hidden="true" />
                  Reintentar
                </Button>
              </div>
            ) : registros.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium">Sin registros todavía</p>
                <p className="text-xs text-muted-foreground">
                  La asistencia aparecerá cuando el profesor registre el primer
                  ingreso.
                </p>
              </div>
            ) : incidencias.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium">
                  Sin faltas ni tardanzas recientes
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Los últimos registros de {nombreCompleto(hijoActivo)} no
                  tienen inasistencias que justificar.
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/70">
                  {incidenciasVisibles.map((registro) => (
                    <FilaHistorial
                      key={registro.id}
                      registro={registro}
                      esDeHoy={registro.fecha === hoy}
                      onJustificar={() => abrirJustificacion(registro)}
                    />
                  ))}
                </ul>
                {incidencias.length > LIMITE_INCIDENCIAS ? (
                  <div className="border-t border-border/70 p-3 text-center">
                    <Button asChild variant="link" size="sm">
                      <Link to="/tutor/asistencia">
                        Ver las {incidencias.length} incidencias
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      <Dialog
        open={justificando !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarJustificacion()
        }}
      >
        <DialogContent>
          <form className="space-y-4" onSubmit={enviarJustificacion} noValidate>
            <DialogHeader>
              <DialogTitle>Justificar inasistencia</DialogTitle>
              <DialogDescription>
                {justificando
                  ? `${justificando.materia ?? 'Sin materia'} · ${formatearFechaCorta(justificando.fecha)}${
                      rangoHorario(
                        justificando.hora_inicio,
                        justificando.hora_fin,
                      )
                        ? ` · ${rangoHorario(justificando.hora_inicio, justificando.hora_fin)}`
                        : ''
                    }`
                  : ''}
              </DialogDescription>
            </DialogHeader>

            {fueraDePlazo && justificando ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Solo puedes justificar el mismo día de la falta o tardanza.
                  Este registro es del{' '}
                  {formatearFechaCorta(justificando.fecha)}.
                </span>
              </p>
            ) : null}

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="motivo-justificacion">Motivo</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {motivo.length}/500
                </span>
              </div>
              <Textarea
                id="motivo-justificacion"
                value={motivo}
                onChange={(evento) => {
                  setMotivo(evento.target.value)
                  setErrorMotivo(null)
                }}
                rows={4}
                maxLength={500}
                placeholder="Ej.: Cita médica programada en el Hospital del Niño."
                aria-invalid={Boolean(errorMotivo)}
                aria-describedby={
                  errorMotivo ? 'error-motivo' : 'ayuda-motivo'
                }
                className="min-h-28"
              />
              {errorMotivo ? (
                <p
                  id="error-motivo"
                  role="alert"
                  className="flex items-start gap-1.5 text-sm text-destructive"
                >
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {errorMotivo}
                </p>
              ) : (
                <p
                  id="ayuda-motivo"
                  className="text-xs text-muted-foreground"
                >
                  Mínimo {MOTIVO_MIN} caracteres. Solo puedes justificar el
                  mismo día de la falta o tardanza.
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={justificar.isPending || fueraDePlazo}
              >
                {justificar.isPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send aria-hidden="true" />
                )}
                Enviar justificación
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <p className="sr-only">
        Tutor: {nombreTutor}. Estudiante activo:{' '}
        {hijoActivo ? nombreCompleto(hijoActivo) : 'ninguno'}.
      </p>
    </DashboardShell>
  )
}

// --------------------------------------------------------------------------
// Subcomponentes
// --------------------------------------------------------------------------

interface TarjetaHijoProps {
  hijo: HijoDelTutor
  activo: boolean
  onSeleccionar: () => void
}

/**
 * Tarjeta seleccionable de un hijo vinculado. La campana con punto rojo
 * indica notificaciones pendientes o incidencias recientes; el check verde,
 * que no hay novedades.
 */
function TarjetaHijo({ hijo, activo, onSeleccionar }: TarjetaHijoProps) {
  const novedades = hijo.notificaciones_pendientes + hijo.faltas_recientes
  const detalle = textoNovedades(hijo)

  return (
    <button
      type="button"
      onClick={onSeleccionar}
      aria-pressed={activo}
      aria-label={`${nombreCompleto(hijo)}, ${cursoCorto(hijo.curso)}. ${
        novedades > 0 ? detalle : 'Sin novedades'
      }`}
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        activo
          ? 'border-primary/60 bg-primary/5 ring-2 ring-primary/25'
          : 'border-border/70 hover:border-primary/30 hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          activo
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/10 text-primary',
        )}
      >
        {iniciales(hijo)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {nombreCompleto(hijo)}
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {cursoCompleto(hijo.curso)}
        </span>
        <span className="mt-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {hijo.parentesco}
          {hijo.es_principal ? ' · Apoderado principal' : ''}
        </span>
        <span
          className={cn(
            'mt-2 block text-xs font-medium',
            novedades > 0 ? 'text-destructive' : 'text-success',
          )}
        >
          {novedades > 0 ? detalle : 'Sin novedades'}
        </span>
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'relative flex size-9 shrink-0 items-center justify-center rounded-full',
          novedades > 0
            ? 'bg-destructive/10 text-destructive'
            : 'bg-success/10 text-success',
        )}
      >
        {novedades > 0 ? (
          <Bell className="size-4" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        {novedades > 0 ? (
          <span className="absolute top-0 right-0 size-2.5 rounded-full bg-destructive ring-2 ring-card" />
        ) : null}
      </span>
    </button>
  )
}

type TonoKpi = 'success' | 'warning' | 'destructive'

const ESTILO_KPI: Record<
  TonoKpi,
  { borde: string; icono: string; valor: string }
> = {
  success: {
    borde: 'border-success/25',
    icono: 'bg-success/10 text-success',
    valor: 'text-success',
  },
  warning: {
    borde: 'border-amber-500/25',
    icono: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    valor: 'text-amber-600 dark:text-amber-400',
  },
  destructive: {
    borde: 'border-destructive/25',
    icono: 'bg-destructive/10 text-destructive',
    valor: 'text-destructive',
  },
}

interface TarjetaKpiProps {
  etiqueta: string
  detalle: string
  valor: number | undefined
  cargando: boolean
  icono: LucideIcon
  tono: TonoKpi
}

/** KPI compacto: se apila en móvil y forma una fila de 3 desde `sm`. */
function TarjetaKpi({
  etiqueta,
  detalle,
  valor,
  cargando,
  icono: Icono,
  tono,
}: TarjetaKpiProps) {
  const estilo = ESTILO_KPI[tono]

  return (
    <Card className={cn('shadow-sm', estilo.borde)}>
      <CardContent className="flex items-center gap-4">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            estilo.icono,
          )}
        >
          <Icono className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {etiqueta}
          </p>
          {cargando ? (
            <Skeleton className="mt-1 h-8 w-14" />
          ) : (
            <p
              className={cn(
                'text-3xl font-semibold tracking-tight tabular-nums',
                estilo.valor,
              )}
            >
              {valor ?? '—'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{detalle}</p>
        </div>
      </CardContent>
    </Card>
  )
}

interface AvisoBuzonProps {
  aviso: Aviso
  confirmando: boolean
  onConfirmar: (avisoId: number) => void
  /** Fuerza el resaltado (por ejemplo, citaciones pendientes). */
  destacado?: boolean
}

/** Comunicado compacto del buzón, con su acción de confirmar lectura. */
function AvisoBuzon({
  aviso,
  confirmando,
  onConfirmar,
  destacado = false,
}: AvisoBuzonProps) {
  const confirmado = Boolean(entregaDe(aviso)?.confirmado_en)
  const esCitacion = aviso.tipo === 'citacion'
  const resaltar = destacado || esCitacion || aviso.importante

  return (
    <article
      className={cn(
        'space-y-2 rounded-xl border p-3 transition-colors',
        esCitacion
          ? 'border-destructive/40 bg-destructive/5 ring-1 ring-destructive/10'
          : resaltar
            ? 'border-amber-500/35 bg-amber-500/5'
            : 'border-border/70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm leading-snug font-semibold">
          {aviso.titulo}
        </h3>
        <Badge
          variant={ESTILO_TIPO_AVISO[aviso.tipo].variante}
          className="shrink-0"
        >
          {ESTILO_TIPO_AVISO[aviso.tipo].etiqueta}
        </Badge>
      </div>

      {esCitacion && !confirmado ? (
        <Badge variant="destructive">
          <CalendarClock aria-hidden="true" />
          Citación pendiente
        </Badge>
      ) : aviso.importante ? (
        <Badge variant="warning">
          <Star aria-hidden="true" />
          Importante
        </Badge>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {formatearFechaHora(aviso.publicado_en)}
        {esCitacion && aviso.fecha_cita
          ? ` · Cita: ${formatearFechaHora(aviso.fecha_cita)}`
          : ''}
      </p>

      <p className="line-clamp-3 text-sm text-foreground/85">
        {aviso.contenido}
      </p>

      <div className="pt-1">
        <AccionLectura
          avisoId={aviso.id}
          confirmado={confirmado}
          confirmando={confirmando}
          onConfirmar={onConfirmar}
        />
      </div>
    </article>
  )
}

const ESTILO_ICONO_ESTADO: Record<string, string> = {
  presente: 'bg-success/10 text-success',
  tardanza: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  falta: 'bg-destructive/10 text-destructive',
  justificada: 'bg-primary/10 text-primary',
}

function IconoEstado({ estado }: { estado: HistorialHijo['estado'] }) {
  if (estado === 'tardanza') {
    return <Clock3 className="size-5" aria-hidden="true" />
  }
  if (estado === 'falta') {
    return <XCircle className="size-5" aria-hidden="true" />
  }
  return <CheckCircle2 className="size-5" aria-hidden="true" />
}

interface FilaHistorialProps {
  registro: HistorialHijo
  esDeHoy: boolean
  onJustificar: () => void
}

/** Una fila del historial: fecha, materia, estado y acción de justificar. */
function FilaHistorial({
  registro,
  esDeHoy,
  onJustificar,
}: FilaHistorialProps) {
  const meta = ESTADOS_ASISTENCIA[registro.estado]
  const rango = rangoHorario(registro.hora_inicio, registro.hora_fin)
  const retraso =
    registro.estado === 'tardanza' && registro.minutos_retraso > 0
      ? ` · ${registro.minutos_retraso} min`
      : ''
  const justificacion = registro.justificacion

  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          ESTILO_ICONO_ESTADO[registro.estado] ?? 'bg-muted text-muted-foreground',
        )}
      >
        <IconoEstado estado={registro.estado} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-snug font-medium">
            {registro.materia ?? 'Sin materia'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatearFechaCorta(registro.fecha)}
            {rango ? ` · ${rango}` : ''}
            {retraso}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          <Badge variant={meta.variante}>{meta.etiqueta}</Badge>

          {justificacion ? (
            <Badge
              variant={ETIQUETA_JUSTIFICACION[justificacion.estado].variante}
            >
              {ETIQUETA_JUSTIFICACION[justificacion.estado].texto}
            </Badge>
          ) : esJustificable(registro) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onJustificar}
              title={
                esDeHoy
                  ? 'Enviar una justificación'
                  : 'Solo puedes justificar el mismo día de la falta'
              }
              aria-label={`Justificar ${registro.materia ?? 'la inasistencia'} del ${formatearFechaCorta(registro.fecha)}`}
            >
              Justificar
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

interface AccionLecturaProps {
  avisoId: number
  confirmado: boolean
  confirmando: boolean
  onConfirmar: (avisoId: number) => void
}

/** Botón para confirmar la lectura o sello cuando ya está confirmada. */
function AccionLectura({
  avisoId,
  confirmado,
  confirmando,
  onConfirmar,
}: AccionLecturaProps) {
  if (confirmado) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
        <CheckCheck className="size-3.5" aria-hidden="true" />
        Lectura confirmada
      </span>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => onConfirmar(avisoId)}
      disabled={confirmando}
      aria-label="Confirmar la lectura de este aviso"
    >
      {confirmando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCheck aria-hidden="true" />
      )}
      Confirmar lectura
    </Button>
  )
}
