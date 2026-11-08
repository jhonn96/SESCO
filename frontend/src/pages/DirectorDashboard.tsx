import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { etiquetaCurso } from '@/lib/cursos'
import {
  diaCorto,
  formatearFechaCorta,
  formatearFechaLarga,
  formatearHora,
  hoyIso,
} from '@/lib/fechas'
import { etiquetaPeriodo } from '@/lib/periodos'
import { ETIQUETA_ROL, nombreRol } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { listarAlertas } from '@/services/alertas'
import { listarPeriodos } from '@/services/periodos'
import { obtenerPanel, type PanelAsistencia } from '@/services/reportes'

// Recharts solo se descarga al entrar al panel, no en el login.
const AsistenciaSemanalChart = lazy(() =>
  import('@/components/AsistenciaSemanalChart').then((modulo) => ({
    default: modulo.AsistenciaSemanalChart,
  })),
)

const FORMATO_NUMERO = new Intl.NumberFormat('es-BO')
const FORMATO_PORCENTAJE = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

interface Kpi {
  titulo: string
  valor: string
  detalle: string
  progreso: number | null
  icono: LucideIcon
  color: string
  fondo: string
  borde: string
  barra: string
}

function formatearNumero(valor: number): string {
  return FORMATO_NUMERO.format(valor)
}

function formatearPorcentaje(valor: number | null): string {
  return valor === null ? '—' : `${FORMATO_PORCENTAJE.format(valor)} %`
}

function calcularPorcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return (parte / total) * 100
}

function construirKpis(panel: PanelAsistencia): Kpi[] {
  const { totales_hoy: hoy } = panel
  const pctPresentes = calcularPorcentaje(hoy.presentes, hoy.registros)
  const pctTardanzas = calcularPorcentaje(hoy.tardanzas, hoy.registros)
  const pctFaltas = calcularPorcentaje(hoy.faltas, hoy.registros)

  const detalle = (porcentaje: number | null) =>
    porcentaje === null
      ? 'Sin registros para esta fecha'
      : `${formatearPorcentaje(porcentaje)} de ${formatearNumero(hoy.registros)} registros`

  return [
    {
      titulo: 'Total Estudiantes',
      valor: formatearNumero(panel.total_estudiantes),
      detalle: `${formatearNumero(panel.cursos.length)} cursos en el panel`,
      progreso: null,
      icono: Users,
      color: 'text-primary',
      fondo: 'bg-primary/10',
      borde: 'border-primary/20',
      barra: 'bg-primary',
    },
    {
      titulo: 'Presentes Hoy',
      valor: formatearNumero(hoy.presentes),
      detalle: detalle(pctPresentes),
      progreso: pctPresentes,
      icono: CheckCircle2,
      color: 'text-success',
      fondo: 'bg-success/10',
      borde: 'border-success/20',
      barra: 'bg-success',
    },
    {
      titulo: 'Tardanzas Hoy',
      valor: formatearNumero(hoy.tardanzas),
      detalle: detalle(pctTardanzas),
      progreso: pctTardanzas,
      icono: Clock,
      color: 'text-warning',
      fondo: 'bg-warning/10',
      borde: 'border-warning/20',
      barra: 'bg-warning',
    },
    {
      titulo: 'Faltas Hoy',
      valor: formatearNumero(hoy.faltas),
      detalle: detalle(pctFaltas),
      progreso: pctFaltas,
      icono: XCircle,
      color: 'text-destructive',
      fondo: 'bg-destructive/10',
      borde: 'border-destructive/20',
      barra: 'bg-destructive',
    },
  ]
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Ocurrió un error inesperado al consultar la API.'
}

function KpisSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4"
      role="status"
      aria-label="Cargando indicadores"
    >
      {Array.from({ length: 4 }).map((_, indice) => (
        <Card key={indice} className="[--card-spacing:--spacing(6)] shadow-sm">
          <CardContent className="space-y-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-20" />
            </div>
            <Skeleton className="h-3 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <Card
      className="[--card-spacing:--spacing(6)] shadow-sm"
      role="status"
      aria-label="Cargando gráfico de asistencia"
    >
      <CardHeader>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[340px] w-full rounded-lg lg:h-[420px]" />
      </CardContent>
    </Card>
  )
}

interface PanelErrorProps {
  mensaje: string
  actualizando: boolean
  onReintentar: () => void
}

function PanelError({ mensaje, actualizando, onReintentar }: PanelErrorProps) {
  return (
    <Card className="border-destructive/30 bg-destructive/5 [--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-lg font-semibold">No se pudo cargar el panel</p>
          <p className="text-base text-muted-foreground">{mensaje}</p>
        </div>
        <Button
          type="button"
          onClick={onReintentar}
          disabled={actualizando}
          className="h-10"
        >
          <RefreshCw
            className={cn('size-4', actualizando && 'animate-spin')}
            aria-hidden="true"
          />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}

export function DirectorDashboard() {
  const { usuario } = useAuth()
  const hoy = hoyIso()
  const [fecha, setFecha] = useState(hoy)
  const [periodoId, setPeriodoId] = useState<number | undefined>()

  const rol = nombreRol(usuario)
  const rolLabel = rol ? ETIQUETA_ROL[rol] : 'Sin rol'
  const nombre = usuario
    ? `${usuario.nombres} ${usuario.apellidos}`.trim()
    : 'Usuario'

  const periodos = useQuery({
    queryKey: ['periodos', 'lista'],
    queryFn: ({ signal }) => listarPeriodos(signal),
    staleTime: 30 * 60_000,
  })

  const periodosOrdenados = useMemo(
    () =>
      [...(periodos.data ?? [])].sort(
        (a, b) => b.gestion - a.gestion || b.trimestre - a.trimestre,
      ),
    [periodos.data],
  )

  const { data, error, isError, isFetching, isLoading, refetch } = useQuery({
    queryKey: ['reportes', 'panel', fecha, periodoId],
    queryFn: ({ signal }) => obtenerPanel({ fecha, periodoId }, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const alertasCursos = useQuery({
    queryKey: ['alertas', 'cursos-sin-registro', hoy],
    queryFn: ({ signal }) =>
      listarAlertas(
        {
          tipo: 'curso_sin_registro',
          atendida: false,
          desde: hoy,
          hasta: hoy,
          limit: 200,
        },
        signal,
      ),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  useEffect(() => {
    if (!isError) return

    toast.error('No se pudo cargar el panel', {
      id: 'panel-error',
      description: mensajeDeError(error),
    })
  }, [isError, error])

  useEffect(() => {
    if (data) toast.dismiss('panel-error')
  }, [data])

  const kpis = useMemo(() => (data ? construirKpis(data) : []), [data])

  const serie = useMemo(
    () =>
      (data?.serie_semana ?? []).map((dia) => ({
        dia: diaCorto(dia.fecha),
        fecha: formatearFechaCorta(dia.fecha),
        presentes: calcularPorcentaje(dia.presentes, dia.registros),
        tardanzas: calcularPorcentaje(dia.tardanzas, dia.registros),
        faltas: calcularPorcentaje(dia.faltas, dia.registros),
        registros: dia.registros,
      })),
    [data],
  )

  const esHoy = fecha === hoy
  const sinRegistros = data !== undefined && data.totales_hoy.registros === 0
  const cursosSobreUmbral =
    data?.cursos.filter((curso) => curso.supera_umbral).length ?? 0

  const cursosSinRegistro = useMemo(() => {
    const etiquetas = (alertasCursos.data?.data ?? []).map((alerta) =>
      alerta.curso
        ? etiquetaCurso(alerta.curso)
        : alerta.curso_id
          ? `Curso #${alerta.curso_id}`
          : 'Curso sin identificar',
    )
    return [...new Set(etiquetas)]
  }, [alertasCursos.data])

  const cursosSinRegistroCargados = alertasCursos.isSuccess

  function cambiarFecha(valor: string) {
    if (valor) setFecha(valor)
  }

  return (
    <DashboardShell seccion="Resumen general">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
          <CalendarDays className="size-4" aria-hidden="true" />
          <span>{formatearFechaLarga(fecha)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {esHoy ? 'Jornada en curso' : 'Consulta histórica'}
          </span>
        </div>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
              Bienvenido {nombre} - Rol: {rolLabel}
            </h1>
            <p className="max-w-3xl text-base text-muted-foreground lg:text-lg">
              {usuario ? `Sesión iniciada con el CI ${usuario.ci}. ` : ''}
              {esHoy
                ? 'Resumen de la asistencia escolar de hoy.'
                : `Panel de asistencia del ${formatearFechaLarga(fecha).toLowerCase()}.`}
            </p>
          </div>

          <Card className="[--card-spacing:--spacing(4)] shadow-sm xl:min-w-96">
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="fecha-panel" className="text-sm">
                    Fecha del panel
                  </Label>
                  <Input
                    id="fecha-panel"
                    type="date"
                    value={fecha}
                    max={hoy}
                    onChange={(evento) => cambiarFecha(evento.target.value)}
                    className="h-10 w-48 text-base md:text-base"
                  />
                </div>
                <div className="grid w-56 gap-1.5">
                  <Label htmlFor="periodo-panel" className="text-sm">
                    Trimestre
                  </Label>
                  <Select
                    id="periodo-panel"
                    value={periodoId === undefined ? '' : String(periodoId)}
                    onChange={(evento) =>
                      setPeriodoId(
                        evento.target.value
                          ? Number(evento.target.value)
                          : undefined,
                      )
                    }
                    disabled={periodos.isLoading}
                  >
                    <option value="">Todos los trimestres</option>
                    {periodosOrdenados.map((periodo) => (
                      <option key={periodo.id} value={periodo.id}>
                        {etiquetaPeriodo(periodo)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={() => setFecha(hoy)}
                  disabled={esHoy}
                >
                  Hoy
                </Button>
                <Button asChild className="h-10">
                  <Link to="/director/control-jornada">
                    <CalendarClock aria-hidden="true" />
                    Programar Salida
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  aria-label="Actualizar datos"
                  title="Actualizar datos"
                >
                  <RefreshCw
                    className={cn('size-4', isFetching && 'animate-spin')}
                    aria-hidden="true"
                  />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {isFetching
                  ? 'Actualizando el panel…'
                  : data
                    ? `Actualizado a las ${formatearHora(data.generado_en)}`
                    : isError
                      ? 'No se pudo actualizar el panel.'
                      : 'Consultando el panel…'}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {cursosSinRegistroCargados ? (
        cursosSinRegistro.length > 0 ? (
          <Card
            className="border-destructive/40 bg-destructive/5 [--card-spacing:--spacing(6)]"
            role="alert"
          >
            <CardContent className="flex flex-wrap items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
                <CalendarX2 className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-lg font-semibold">
                  Los siguientes cursos no tienen registro de asistencia hoy:
                </p>
                <ul className="flex flex-wrap gap-2">
                  {cursosSinRegistro.map((curso) => (
                    <li
                      key={curso}
                      className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive"
                    >
                      {curso}
                    </li>
                  ))}
                </ul>
              </div>
              <Button asChild variant="outline" className="h-10">
                <Link to="/director/alertas">Ver alertas</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-success/30 bg-success/5 [--card-spacing:--spacing(6)]">
            <CardContent className="flex flex-wrap items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-lg font-semibold">
                  Todos los cursos registraron asistencia hoy
                </p>
                <p className="text-base text-muted-foreground">
                  No hay alertas de cursos sin registro para esta fecha.
                </p>
              </div>
            </CardContent>
          </Card>
        )
      ) : null}

      <section
        aria-labelledby="kpis-titulo"
        aria-busy={isFetching}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="kpis-titulo"
              className="text-xl font-semibold tracking-tight"
            >
              Indicadores del día
            </h2>
            <p className="text-base text-muted-foreground">
              {data
                ? `${formatearFechaLarga(data.fecha)} · ${formatearNumero(data.totales_hoy.registros)} registros de asistencia.`
                : isError
                  ? 'No se pudo obtener el resumen del día.'
                  : 'Cargando el resumen del día…'}
            </p>
          </div>

          {sinRegistros ? (
            <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-sm font-medium text-muted-foreground">
              Sin registros para esta fecha
            </span>
          ) : null}
        </div>

        {isLoading ? <KpisSkeleton /> : null}

        {!isLoading && isError && !data ? (
          <PanelError
            mensaje={mensajeDeError(error)}
            actualizando={isFetching}
            onReintentar={() => void refetch()}
          />
        ) : null}

        {data ? (
          <>
            {isError ? (
              <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                No se pudo actualizar la información. Se muestran los últimos
                datos disponibles.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4">
              {kpis.map((kpi) => {
                const Icono = kpi.icono
                return (
                  <Card
                    key={kpi.titulo}
                    className="[--card-spacing:--spacing(6)] shadow-sm"
                  >
                    <CardContent className="space-y-4">
                      <span
                        className={cn(
                          'flex size-12 items-center justify-center rounded-xl border',
                          kpi.fondo,
                          kpi.color,
                          kpi.borde,
                        )}
                      >
                        <Icono className="size-6" aria-hidden="true" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-base font-medium text-muted-foreground">
                          {kpi.titulo}
                        </p>
                        <p className="text-4xl font-semibold tracking-tight tabular-nums">
                          {kpi.valor}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          {kpi.detalle}
                        </p>
                        {kpi.progreso !== null ? (
                          <div
                            role="progressbar"
                            aria-label={`${kpi.titulo}: ${formatearPorcentaje(kpi.progreso)}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(kpi.progreso)}
                            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className={cn(
                                'h-full rounded-full transition-[width] duration-500',
                                kpi.barra,
                              )}
                              style={{
                                width: `${Math.min(Math.max(kpi.progreso, 0), 100)}%`,
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        ) : null}
      </section>

      {isLoading ? <ChartSkeleton /> : null}

      {data ? (
        <Card className="[--card-spacing:--spacing(6)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Asistencia de la semana</CardTitle>
            <CardDescription className="text-base">
              Del {formatearFechaCorta(data.semana_inicio)} al{' '}
              {formatearFechaCorta(data.semana_fin)} · Inasistencia semanal{' '}
              {formatearPorcentaje(data.inasistencia_pct)} (umbral{' '}
              {formatearPorcentaje(data.umbral_inasistencia_pct)}).
            </CardDescription>
            <CardAction>
              <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-sm font-medium text-muted-foreground">
                {esHoy ? 'Semana en curso' : 'Consulta histórica'}
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={
                <Skeleton className="h-[340px] w-full rounded-lg lg:h-[420px]" />
              }
            >
              <AsistenciaSemanalChart datos={serie} />
            </Suspense>

            {data.cursos.length > 0 ? (
              <p
                className={cn(
                  'mt-4 border-t border-border/70 pt-4 text-sm',
                  cursosSobreUmbral > 0
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {cursosSobreUmbral > 0
                  ? `${formatearNumero(cursosSobreUmbral)} de ${formatearNumero(data.cursos.length)} cursos superan el umbral de inasistencia del ${formatearPorcentaje(data.umbral_inasistencia_pct)}.`
                  : `Ningún curso supera el umbral de inasistencia del ${formatearPorcentaje(data.umbral_inasistencia_pct)} (${formatearNumero(data.cursos.length)} cursos).`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </DashboardShell>
  )
}
