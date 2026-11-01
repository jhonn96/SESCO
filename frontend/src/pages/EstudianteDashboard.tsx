import { useCallback, useEffect, useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  GraduationCap,
  IdCard,
  Inbox,
  LoaderCircle,
  LogOut,
  Phone,
  QrCode,
  RefreshCw,
  ScanLine,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { TablaPaginacion } from '@/components/TablaPaginacion'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { ESTADOS_ASISTENCIA } from '@/lib/asistencia'
import { mensajeDeError } from '@/lib/errores'
import {
  formatearFecha,
  formatearFechaCorta,
  formatearHoraEnColegio,
  minutosDeHora,
  posicionEnColegio,
  type PosicionColegio,
} from '@/lib/fechas'
import { DIAS_SEMANA } from '@/lib/horarios'
import { cn } from '@/lib/utils'
import {
  obtenerQrEstudiante,
  type CodigoQrEstudiante,
  type EstadoAsistencia,
} from '@/services/asistencia'
import { ApiError, type PeticionPaginada } from '@/services/api'
import {
  obtenerMiHorario,
  obtenerMiResumen,
  obtenerMisAsistencias,
  obtenerMiTutor,
  type BloqueHorarioEstudiante,
  type HistorialAsistenciaEstudiante,
  type HorarioEstudiante,
  type TutorACargo,
} from '@/services/estudiantes'

/** Ventana usada solo si el backend aún no respondió con la real. */
const VENTANA_RESPALDO_SEG = 30
/** Espera antes de reintentar cuando la renovación falla sin conexión. */
const REINTENTO_MS = 5_000
/** Pequeña espera tras el vencimiento para no pedir el mismo código dos veces. */
const ESPERA_RENOVACION_MS = 1_000
/** A partir de estos segundos la cuenta regresiva se muestra en alerta. */
const UMBRAL_URGENTE_SEG = 6
/** Cada cuánto se refrescan los KPIs del estudiante. */
const REFRESCO_RESUMEN_MS = 60_000
/** Registros por página en "Mis Asistencias". */
const TAMANO_ASISTENCIAS = 10

/** Código del backend más el vencimiento medido con el reloj del teléfono. */
interface CodigoQrLocal extends CodigoQrEstudiante {
  venceEn: number
}

type Pestana = 'qr' | 'horario' | 'asistencias'

const ESTADOS = Object.keys(ESTADOS_ASISTENCIA) as EstadoAsistencia[]

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

function cursoCorto(curso: HorarioEstudiante['curso']): string {
  return curso ? `${curso.grado}° ${curso.paralelo}` : 'Sin curso'
}

function cursoCompleto(curso: HorarioEstudiante['curso']): string {
  if (!curso) return 'Sin curso asignado'
  const nivel = ETIQUETA_NIVEL[curso.nivel] ?? curso.nivel
  const turno = ETIQUETA_TURNO[curso.turno] ?? curso.turno
  return `${curso.grado}° ${curso.paralelo} · ${nivel} (${turno})`
}

/** Rango horario legible, por ejemplo "08:00–08:45". */
function rangoHorario(inicio: string | null, fin: string | null): string | null {
  if (!inicio || !fin) return null
  return `${inicio.slice(0, 5)}–${fin.slice(0, 5)}`
}

/**
 * Panel principal del rol Estudiante.
 *
 * Es un centro de información con tres pestañas —"Mi QR", "Mi Horario" y
 * "Mis Asistencias"— pensado para celular y escritorio: en móvil todo se
 * apila en una columna y en pantallas grandes el QR convive con el resumen.
 *
 * El código QR se renueva cuando vence la ventana TOTP real (según
 * `segundos_restantes`), no con un intervalo fijo desde el montaje. La cuenta
 * regresiva se calcula con un vencimiento local para tolerar relojes
 * desfasados en el teléfono.
 */
export function EstudianteDashboard() {
  const { usuario, cerrarSesion } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [pestana, setPestana] = useState<Pestana>('qr')
  const [mes, setMes] = useState('')
  const [estado, setEstado] = useState<EstadoAsistencia | ''>('')
  const [pagina, setPagina] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())

  const qr = useQuery<CodigoQrLocal>({
    queryKey: ['asistencia', 'qr-estudiante'],
    queryFn: async ({ signal }) => {
      const codigo = await obtenerQrEstudiante(signal)
      return {
        ...codigo,
        // El vencimiento se ancla al momento de recibir la respuesta, no al
        // reloj del backend, para tolerar teléfonos con hora desfasada.
        venceEn: Date.now() + Math.max(0, codigo.segundos_restantes) * 1_000,
      }
    },
    staleTime: 0,
    retry: 0,
    refetchOnWindowFocus: true,
    // Sin clase (403) se revisa una vez por minuto para habilitar el QR en
    // cuanto empiece el bloque; con un código vigente manda el vencimiento.
    refetchInterval: (query) => {
      const error = query.state.error
      return error instanceof ApiError && error.status === 403 ? 60_000 : false
    },
  })

  const { refetch, isFetching, isError, data } = qr

  const resumen = useQuery({
    queryKey: ['estudiante', 'resumen'],
    queryFn: ({ signal }) => obtenerMiResumen(signal),
    refetchInterval: REFRESCO_RESUMEN_MS,
  })

  const tutor = useQuery({
    queryKey: ['estudiante', 'tutor'],
    queryFn: ({ signal }) => obtenerMiTutor(signal),
    staleTime: 5 * 60_000,
  })

  const horario = useQuery({
    queryKey: ['estudiante', 'horario'],
    queryFn: ({ signal }) => obtenerMiHorario(signal),
    staleTime: 5 * 60_000,
  })

  const asistencias = useQuery({
    queryKey: ['estudiante', 'asistencias', mes, estado, pagina],
    queryFn: ({ signal }) =>
      obtenerMisAsistencias(
        {
          mes,
          estado: estado || undefined,
          skip: pagina * TAMANO_ASISTENCIAS,
          limit: TAMANO_ASISTENCIAS,
        },
        signal,
      ),
    enabled: pestana === 'asistencias',
    placeholderData: keepPreviousData,
  })

  const ventanaSeg = data?.ventana_seg ?? VENTANA_RESPALDO_SEG

  // Reloj local que mueve la cuenta regresiva y el bloque "en curso".
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  const restantes = data
    ? Math.min(
        Math.max(0, data.segundos_restantes),
        Math.max(0, Math.ceil((data.venceEn - ahora) / 1_000)),
      )
    : 0

  const refrescar = useCallback(() => {
    void refetch()
  }, [refetch])

  const expirado = Boolean(data) && restantes <= 0
  const sinClase = qr.error instanceof ApiError && qr.error.status === 403
  const sinConexion = isError && !sinClase
  const renovando = expirado && isFetching

  // Renueva al vencer la ventana y, si hay un error de red con un código
  // anterior, reintenta cada pocos segundos. Con datos viejos el QR sigue
  // visible hasta que llegue uno nuevo.
  useEffect(() => {
    if (isFetching || sinClase) return
    if (!expirado && !sinConexion) return
    const demora = sinConexion ? REINTENTO_MS : ESPERA_RENOVACION_MS
    const id = window.setTimeout(refrescar, demora)
    return () => window.clearTimeout(id)
  }, [expirado, isFetching, sinClase, sinConexion, refrescar])

  const nombre = usuario
    ? `${usuario.nombres} ${usuario.apellidos}`.trim()
    : 'Estudiante'
  const primerNombre = usuario?.nombres.trim() || 'estudiante'

  function manejarCierre() {
    cerrarSesion()
    queryClient.clear()
    toast.success('Sesión cerrada correctamente')
    navigate('/login', { replace: true })
  }

  function cambiarMes(valor: string) {
    setMes(valor)
    setPagina(0)
  }

  function cambiarEstado(valor: EstadoAsistencia | '') {
    setEstado(valor)
    setPagina(0)
  }

  function limpiarFiltros() {
    setMes('')
    setEstado('')
    setPagina(0)
  }

  const progreso = Math.min(100, Math.max(0, (restantes / ventanaSeg) * 100))
  const urgente = restantes > 0 && restantes <= UMBRAL_URGENTE_SEG
  const codigoVisible = data?.codigo
    ? `${data.codigo.slice(0, 4)} ${data.codigo.slice(4)}`
    : null

  const posicion = posicionEnColegio(new Date(ahora))
  const curso = horario.data?.curso ?? null

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background">
      {/* Halo decorativo: da identidad sin competir con el QR. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden"
      >
        <div className="absolute -top-28 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-16 top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="relative flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <GraduationCap className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold tracking-tight">SESCO</p>
          <p className="truncate text-xs text-muted-foreground">
            Portal del estudiante
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={manejarCierre}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Estudiante
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Hola, {primerNombre}
            </h1>
            {curso ? (
              <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {cursoCorto(curso)}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Consulta tu código QR, tu horario y tus asistencias.
          </p>
        </div>

        <Tabs
          value={pestana}
          onValueChange={(valor) => setPestana(valor as Pestana)}
        >
          <TabsList aria-label="Secciones del portal">
            <TabsTrigger value="qr">
              <QrCode className="hidden sm:block" aria-hidden="true" />
              Mi QR
            </TabsTrigger>
            <TabsTrigger value="horario">
              <CalendarDays className="hidden sm:block" aria-hidden="true" />
              Mi Horario
            </TabsTrigger>
            <TabsTrigger value="asistencias">
              <ClipboardList className="hidden sm:block" aria-hidden="true" />
              Mis Asistencias
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------------ */}
          {/* Mi QR                                                        */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="qr" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
              <div>
                {sinClase ? (
                  <TarjetaSinClase />
                ) : (
                  <section
                    aria-busy={isFetching}
                    aria-label="Código QR de asistencia"
                    className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <EstadoCodigo
                        cargando={!data && isFetching}
                        expirado={expirado}
                        sinConexion={sinConexion}
                        renovando={renovando}
                      />

                      {codigoVisible ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
                          <Clock3 className="size-3" aria-hidden="true" />
                          {codigoVisible}
                        </span>
                      ) : null}
                    </div>

                    <div className="relative mx-auto mt-4 aspect-square w-full max-w-[19rem] overflow-hidden rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.25)]">
                      {data ? (
                        <QRCodeSVG
                          value={data.contenido}
                          size={320}
                          level="M"
                          marginSize={2}
                          bgColor="#ffffff"
                          fgColor="#0f172a"
                          title={`Código QR de ${nombre}`}
                          shapeRendering="crispEdges"
                          className={cn(
                            'size-full transition-[opacity,filter] duration-300',
                            expirado && 'opacity-20 blur-sm',
                          )}
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-white">
                          <LoaderCircle
                            className="size-7 animate-spin text-neutral-400"
                            aria-hidden="true"
                          />
                        </div>
                      )}

                      {expirado ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/80 px-4 text-center">
                          {isFetching ? (
                            <LoaderCircle
                              className="size-6 animate-spin text-neutral-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertTriangle
                              className="size-6 text-amber-600"
                              aria-hidden="true"
                            />
                          )}
                          <p className="text-sm font-semibold text-neutral-900">
                            Código expirado
                          </p>
                          <p className="text-xs text-neutral-600">
                            {sinConexion
                              ? 'Reintentando en unos segundos…'
                              : 'Renovando automáticamente…'}
                          </p>
                        </div>
                      ) : null}

                      {!data && isError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 px-4 text-center">
                          <AlertTriangle
                            className="size-6 text-destructive"
                            aria-hidden="true"
                          />
                          <p className="text-sm font-semibold text-neutral-900">
                            No se pudo generar el código
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={refrescar}
                            disabled={isFetching}
                          >
                            Reintentar
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-5 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          role="timer"
                          aria-live="off"
                          className={cn(
                            'text-sm font-medium transition-colors',
                            urgente && 'text-destructive',
                          )}
                        >
                          {restantes > 0 ? (
                            <>
                              El código expira en{' '}
                              <span className="text-base font-semibold tabular-nums">
                                {restantes}
                              </span>{' '}
                              {restantes === 1 ? 'segundo' : 'segundos'}
                            </>
                          ) : renovando ? (
                            'Renovando el código…'
                          ) : expirado ? (
                            sinConexion
                              ? 'El código expiró'
                              : 'Renovando el código…'
                          ) : sinConexion ? (
                            'Sin conexión'
                          ) : (
                            'Generando tu código…'
                          )}
                        </p>

                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                          {restantes > 0 ? `${restantes}/${ventanaSeg} s` : '—'}
                        </span>
                      </div>

                      <div
                        role="progressbar"
                        aria-label="Tiempo restante del código"
                        aria-valuemin={0}
                        aria-valuemax={ventanaSeg}
                        aria-valuenow={restantes}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      >
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-700 ease-linear',
                            urgente ? 'bg-destructive' : 'bg-primary',
                          )}
                          style={{ width: `${progreso}%` }}
                        />
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Se renueva solo cada {ventanaSeg} s.
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="lg"
                      onClick={refrescar}
                      disabled={isFetching}
                      className="mt-4 h-12 w-full gap-2 rounded-xl text-base"
                    >
                      <RefreshCw
                        className={cn('size-4.5', isFetching && 'animate-spin')}
                        aria-hidden="true"
                      />
                      {isFetching ? 'Solicitando…' : 'Solicitar QR'}
                    </Button>

                    {sinConexion ? (
                      <p
                        role="status"
                        className="mt-3 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
                      >
                        <AlertTriangle
                          className="mt-px size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {data
                          ? mensajeDeError(
                              qr.error,
                              'No se pudo renovar el código. Se muestra el último código disponible.',
                            )
                          : mensajeDeError(
                              qr.error,
                              'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
                            )}
                      </p>
                    ) : null}
                  </section>
                )}
              </div>

              <div className="space-y-6">
                <section aria-labelledby="titulo-resumen" className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2
                        id="titulo-resumen"
                        className="text-lg font-semibold tracking-tight"
                      >
                        Mi asistencia
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Resumen acumulado de tus registros.
                      </p>
                    </div>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarCheck2 className="size-4" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <TarjetaKpi
                      etiqueta="Días presente"
                      valor={resumen.data?.dias_presente}
                      cargando={resumen.isLoading}
                      icono={CheckCircle2}
                      tono="success"
                    />
                    <TarjetaKpi
                      etiqueta="Tardanzas"
                      valor={resumen.data?.tardanzas}
                      cargando={resumen.isLoading}
                      icono={Clock3}
                      tono="warning"
                    />
                    <TarjetaKpi
                      etiqueta="Faltas"
                      valor={resumen.data?.faltas}
                      cargando={resumen.isLoading}
                      icono={XCircle}
                      tono="destructive"
                    />
                  </div>

                  {resumen.isError ? (
                    <div
                      role="status"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        {mensajeDeError(
                          resumen.error,
                          'No se pudo cargar el resumen de asistencia.',
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void resumen.refetch()}
                        disabled={resumen.isFetching}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        Reintentar
                      </Button>
                    </div>
                  ) : null}
                </section>

                <TarjetaTutor
                  datos={tutor.data}
                  cargando={tutor.isLoading}
                  error={tutor.error}
                  reintentando={tutor.isFetching}
                  onReintentar={() => void tutor.refetch()}
                />

                <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ScanLine className="size-4.5" aria-hidden="true" />
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Acerca la pantalla al lector.
                    </span>{' '}
                    El profesor escanea el QR con la cámara y tu asistencia
                    queda registrada al instante.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ------------------------------------------------------------ */}
          {/* Mi Horario                                                   */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="horario">
            <VistaHorario
              datos={horario.data}
              cargando={horario.isLoading}
              error={horario.error}
              reintentando={horario.isFetching}
              onReintentar={() => void horario.refetch()}
              posicion={posicion}
            />
          </TabsContent>

          {/* ------------------------------------------------------------ */}
          {/* Mis Asistencias                                              */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="asistencias">
            <VistaAsistencias
              datos={asistencias.data}
              cargando={asistencias.isLoading}
              actualizando={asistencias.isFetching}
              error={asistencias.error}
              mes={mes}
              estado={estado}
              pagina={pagina}
              onCambiarMes={cambiarMes}
              onCambiarEstado={cambiarEstado}
              onLimpiar={limpiarFiltros}
              onCambiarPagina={setPagina}
              onReintentar={() => void asistencias.refetch()}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

// --------------------------------------------------------------------------
// Subcomponentes
// --------------------------------------------------------------------------

/**
 * Reemplaza al QR cuando el backend responde 403: el estudiante está fuera
 * del bloque de clase (o su curso no tiene horario para hoy).
 */
function TarjetaSinClase() {
  return (
    <section
      aria-labelledby="titulo-sin-clase"
      className="rounded-3xl border border-border/80 bg-card p-6 text-center shadow-sm"
    >
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Clock3 className="size-7" aria-hidden="true" />
      </span>
      <h2
        id="titulo-sin-clase"
        className="mt-4 text-lg font-semibold tracking-tight"
      >
        Sin clase en curso
      </h2>
      <p className="mt-1 text-sm text-muted-foreground text-balance">
        Tu próximo QR estará disponible cuando inicie tu clase.
      </p>
      <Button
        type="button"
        size="lg"
        disabled
        className="mt-5 h-12 w-full gap-2 rounded-xl text-base"
      >
        <RefreshCw className="size-4.5" aria-hidden="true" />
        Solicitar QR
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Se verificará automáticamente cada minuto.
      </p>
    </section>
  )
}

interface EstadoCodigoProps {
  cargando: boolean
  expirado: boolean
  sinConexion: boolean
  renovando: boolean
}

/** Insignia que resume si el código está vigente, cargando o sin red. */
function EstadoCodigo({
  cargando,
  expirado,
  sinConexion,
  renovando,
}: EstadoCodigoProps) {
  if (cargando || renovando) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
        {cargando ? 'Generando' : 'Renovando'}
      </span>
    )
  }

  if (sinConexion) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
        <AlertTriangle className="size-3" aria-hidden="true" />
        Sin conexión
      </span>
    )
  }

  if (expirado) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-3" aria-hidden="true" />
        Expirado
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-success" />
      </span>
      Código vigente
    </span>
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
  valor: number | undefined
  cargando: boolean
  icono: LucideIcon
  tono: TonoKpi
}

/** Tarjeta compacta de un KPI; en móvil se apila una debajo de otra. */
function TarjetaKpi({
  etiqueta,
  valor,
  cargando,
  icono: Icono,
  tono,
}: TarjetaKpiProps) {
  const estilo = ESTILO_KPI[tono]

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-card p-4 sm:flex-col sm:items-start sm:gap-2.5',
        estilo.borde,
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          estilo.icono,
        )}
      >
        <Icono className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
        {cargando ? (
          <Skeleton className="mt-1 h-7 w-12" />
        ) : (
          <p
            className={cn('text-2xl font-semibold tabular-nums', estilo.valor)}
          >
            {valor ?? '—'}
          </p>
        )}
      </div>
    </div>
  )
}

interface TarjetaTutorProps {
  datos: TutorACargo | null | undefined
  cargando: boolean
  error: unknown
  reintentando: boolean
  onReintentar: () => void
}

/** Tarjeta con el tutor principal del estudiante (nombre, CI y parentesco). */
function TarjetaTutor({
  datos,
  cargando,
  error,
  reintentando,
  onReintentar,
}: TarjetaTutorProps) {
  const nombre = datos ? `${datos.nombres} ${datos.apellidos}`.trim() : ''
  const iniciales = datos
    ? `${datos.nombres[0] ?? ''}${datos.apellidos[0] ?? ''}`.toUpperCase()
    : ''

  return (
    <section aria-labelledby="titulo-tutor" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="titulo-tutor"
            className="text-lg font-semibold tracking-tight"
          >
            Mi Tutor a cargo
          </h2>
          <p className="text-xs text-muted-foreground">
            Contacto principal registrado por el colegio.
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRound className="size-4" aria-hidden="true" />
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        {cargando ? (
          <div className="flex items-center gap-3" role="status">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <span className="sr-only">Cargando tutor a cargo…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <AlertTriangle
              className="size-5 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {mensajeDeError(
                error,
                'No se pudieron cargar los datos de tu tutor.',
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReintentar}
              disabled={reintentando}
            >
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : !datos ? (
          <div className="flex flex-col items-center gap-1.5 py-2 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Sin tutor confirmado</p>
            <p className="text-xs text-muted-foreground">
              El colegio debe confirmar el vínculo de tutoría para mostrarlo
              aquí.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
            >
              {iniciales}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold tracking-tight">
                  {nombre}
                </p>
                <Badge variant="info">{datos.parentesco}</Badge>
                {datos.es_principal ? (
                  <Badge variant="secondary">Principal</Badge>
                ) : null}
              </div>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <IdCard className="size-3.5 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">Cédula de identidad</dt>
                  <dd className="font-medium text-foreground">
                    CI {datos.ci}
                  </dd>
                </div>
                {datos.telefono ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                    <dt className="sr-only">Teléfono</dt>
                    <dd className="font-medium text-foreground">
                      {datos.telefono}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

interface VistaHorarioProps {
  datos: HorarioEstudiante | undefined
  cargando: boolean
  error: unknown
  reintentando: boolean
  onReintentar: () => void
  posicion: PosicionColegio
}

/** Grilla semanal del curso, con el día y el bloque en curso resaltados. */
function VistaHorario({
  datos,
  cargando,
  error,
  reintentando,
  onReintentar,
  posicion,
}: VistaHorarioProps) {
  const bloques = datos?.bloques ?? []
  const curso = datos?.curso ?? null

  return (
    <section aria-labelledby="titulo-horario" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="titulo-horario"
            className="text-xl font-semibold tracking-tight"
          >
            Mi horario
          </h2>
          <p className="text-sm text-muted-foreground">
            {curso ? `${cursoCompleto(curso)}.` : 'Tu grilla semanal de clases.'}{' '}
            {posicion.dia
              ? 'El bloque en curso se resalta automáticamente.'
              : 'Hoy no hay clases programadas.'}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="size-4" aria-hidden="true" />
        </span>
      </div>

      {cargando ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, indice) => (
            <div
              key={indice}
              className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ))}
          <span className="sr-only" role="status">
            Cargando horario…
          </span>
        </div>
      ) : error ? (
        <BloqueError
          mensaje={mensajeDeError(error, 'No se pudo cargar tu horario.')}
          reintentando={reintentando}
          onReintentar={onReintentar}
        />
      ) : bloques.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">Aún no hay horario asignado</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Cuando el colegio cargue la grilla de tu curso, la verás aquí con
            sus materias y horas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DIAS_SEMANA.map((dia) => {
            const esHoy = posicion.dia === dia.valor
            const bloquesDia = bloques.filter(
              (bloque) => bloque.dia_semana === dia.valor,
            )

            return (
              <section
                key={dia.valor}
                aria-label={dia.etiqueta}
                className={cn(
                  'rounded-2xl border bg-card p-4 shadow-sm',
                  esHoy
                    ? 'border-primary/40 ring-1 ring-primary/20'
                    : 'border-border/70',
                )}
              >
                <header className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">
                    {dia.etiqueta}
                  </h3>
                  {esHoy ? (
                    <Badge variant="info">Hoy</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {bloquesDia.length}{' '}
                      {bloquesDia.length === 1 ? 'bloque' : 'bloques'}
                    </span>
                  )}
                </header>

                {bloquesDia.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sin clases programadas
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {bloquesDia.map((bloque) => (
                      <FilaBloque
                        key={bloque.id}
                        bloque={bloque}
                        enCurso={
                          esHoy &&
                          posicion.minutos >=
                            minutosDeHora(bloque.hora_inicio) &&
                          posicion.minutos < minutosDeHora(bloque.hora_fin)
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Un bloque de clase dentro de la tarjeta de su día. */
function FilaBloque({
  bloque,
  enCurso,
}: {
  bloque: BloqueHorarioEstudiante
  enCurso: boolean
}) {
  const rango = rangoHorario(bloque.hora_inicio, bloque.hora_fin)

  return (
    <li
      className={cn(
        'rounded-xl border px-3 py-2',
        enCurso
          ? 'border-primary/40 bg-primary/5'
          : 'border-border/60 bg-background/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm leading-snug font-medium">
          {bloque.materia ?? 'Sin materia'}
        </p>
        {enCurso ? <Badge variant="info">En curso</Badge> : null}
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock3 className="size-3 shrink-0" aria-hidden="true" />
        {rango ?? 'Horario no definido'}
      </p>
    </li>
  )
}

interface VistaAsistenciasProps {
  datos: PeticionPaginada<HistorialAsistenciaEstudiante[]> | undefined
  cargando: boolean
  actualizando: boolean
  error: unknown
  mes: string
  estado: EstadoAsistencia | ''
  pagina: number
  onCambiarMes: (valor: string) => void
  onCambiarEstado: (valor: EstadoAsistencia | '') => void
  onLimpiar: () => void
  onCambiarPagina: (pagina: number) => void
  onReintentar: () => void
}

/** Historial completo con filtros por mes y estado, y paginación. */
function VistaAsistencias({
  datos,
  cargando,
  actualizando,
  error,
  mes,
  estado,
  pagina,
  onCambiarMes,
  onCambiarEstado,
  onLimpiar,
  onCambiarPagina,
  onReintentar,
}: VistaAsistenciasProps) {
  const registros = datos?.data ?? []
  const total = datos?.total ?? 0
  const hayFiltros = Boolean(mes || estado)

  return (
    <section aria-labelledby="titulo-asistencias" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="titulo-asistencias"
            className="text-xl font-semibold tracking-tight"
          >
            Mis asistencias
          </h2>
          <p className="text-sm text-muted-foreground">
            Historial completo de tus registros, con la hora de ingreso y el
            estado de cada bloque.
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="size-4" aria-hidden="true" />
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="filtro-mes">Mes</Label>
            <Input
              id="filtro-mes"
              type="month"
              value={mes}
              onChange={(evento) => onCambiarMes(evento.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filtro-estado">Estado</Label>
            <Select
              id="filtro-estado"
              value={estado}
              onChange={(evento) =>
                onCambiarEstado(evento.target.value as EstadoAsistencia | '')
              }
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map((valor) => (
                <option key={valor} value={valor}>
                  {ESTADOS_ASISTENCIA[valor].etiqueta}
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={onLimpiar}
            disabled={!hayFiltros}
          >
            <RefreshCw aria-hidden="true" />
            Limpiar
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {total} {total === 1 ? 'registro' : 'registros'}
          {hayFiltros ? ' con los filtros aplicados' : ' en total'}.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {cargando ? (
          <div className="space-y-3 p-4" role="status">
            {Array.from({ length: 5 }).map((_, indice) => (
              <div key={indice} className="flex items-center gap-3">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
            <span className="sr-only">Cargando asistencias…</span>
          </div>
        ) : error ? (
          <div className="p-4">
            <BloqueError
              mensaje={mensajeDeError(
                error,
                'No se pudieron cargar tus asistencias.',
              )}
              reintentando={actualizando}
              onReintentar={onReintentar}
              sinBorde
            />
          </div>
        ) : registros.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">
              {hayFiltros ? 'Sin registros con esos filtros' : 'Aún no tienes registros'}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {hayFiltros
                ? 'Prueba con otro mes o estado, o limpia los filtros.'
                : 'Tu historial aparecerá cuando el profesor registre tu primer ingreso.'}
            </p>
            {hayFiltros ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLimpiar}
              >
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className={cn(
                'hidden md:block',
                actualizando && 'opacity-60 transition-opacity',
              )}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Fecha</TableHead>
                    <TableHead>Materia</TableHead>
                    <TableHead>Hora de ingreso</TableHead>
                    <TableHead className="pr-4 text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((registro) => (
                    <FilaAsistenciaTabla
                      key={registro.id}
                      registro={registro}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul
              className={cn(
                'divide-y divide-border/70 md:hidden',
                actualizando && 'opacity-60 transition-opacity',
              )}
            >
              {registros.map((registro) => (
                <FilaAsistenciaMovil key={registro.id} registro={registro} />
              ))}
            </ul>

            <TablaPaginacion
              pagina={pagina}
              tamano={TAMANO_ASISTENCIAS}
              total={total}
              onCambiarPagina={onCambiarPagina}
              etiqueta="registros"
              deshabilitado={actualizando}
            />
          </>
        )}
      </div>
    </section>
  )
}

const ESTILO_ICONO_ESTADO: Record<EstadoAsistencia, string> = {
  presente: 'bg-success/10 text-success',
  tardanza: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  falta: 'bg-destructive/10 text-destructive',
  justificada: 'bg-primary/10 text-primary',
}

function IconoEstado({ estado }: { estado: EstadoAsistencia }) {
  if (estado === 'tardanza') {
    return <Clock3 className="size-4.5" aria-hidden="true" />
  }
  if (estado === 'falta') {
    return <XCircle className="size-4.5" aria-hidden="true" />
  }
  return <CheckCircle2 className="size-4.5" aria-hidden="true" />
}

/** Hora de ingreso legible; las faltas no tienen marca de ingreso. */
function horaIngreso(registro: HistorialAsistenciaEstudiante): string {
  return registro.hora_ingreso
    ? formatearHoraEnColegio(registro.hora_ingreso)
    : '—'
}

/** Fila de la tabla de asistencias en escritorio. */
function FilaAsistenciaTabla({
  registro,
}: {
  registro: HistorialAsistenciaEstudiante
}) {
  const meta = ESTADOS_ASISTENCIA[registro.estado]

  return (
    <TableRow>
      <TableCell className="pl-4 font-medium">
        {formatearFecha(registro.fecha)}
      </TableCell>
      <TableCell className="max-w-[24rem] whitespace-normal">
        {registro.materia ?? 'Sin materia'}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {horaIngreso(registro)}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Badge variant={meta.variante}>{meta.etiqueta}</Badge>
      </TableCell>
    </TableRow>
  )
}

/** Versión apilada de la fila para celular. */
function FilaAsistenciaMovil({
  registro,
}: {
  registro: HistorialAsistenciaEstudiante
}) {
  const meta = ESTADOS_ASISTENCIA[registro.estado]

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          ESTILO_ICONO_ESTADO[registro.estado],
        )}
      >
        <IconoEstado estado={registro.estado} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm leading-snug font-medium">
            {registro.materia ?? 'Sin materia'}
          </p>
          <Badge variant={meta.variante}>{meta.etiqueta}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatearFechaCorta(registro.fecha)} · Ingreso{' '}
          {horaIngreso(registro)}
          {registro.estado === 'tardanza' && registro.minutos_retraso > 0
            ? ` · ${registro.minutos_retraso} min`
            : ''}
        </p>
      </div>
    </li>
  )
}

interface BloqueErrorProps {
  mensaje: string
  reintentando: boolean
  onReintentar: () => void
  sinBorde?: boolean
}

/** Estado de error con botón de reintento, compartido por las pestañas. */
function BloqueError({
  mensaje,
  reintentando,
  onReintentar,
  sinBorde = false,
}: BloqueErrorProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 text-center',
        sinBorde
          ? 'py-4'
          : 'rounded-2xl border border-border/70 bg-card p-6 shadow-sm',
      )}
    >
      <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReintentar}
        disabled={reintentando}
      >
        <RefreshCw aria-hidden="true" />
        Reintentar
      </Button>
    </div>
  )
}
