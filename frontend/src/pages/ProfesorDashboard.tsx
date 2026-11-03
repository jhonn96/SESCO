import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LoaderCircle,
  QrCode,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { ProfesorShell } from '@/components/ProfesorShell'
import { RegistroManualDialog } from '@/components/RegistroManualDialog'
import { TablaEstado } from '@/components/TablaEstado'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { useDirectorioEstudiantes } from '@/hooks/use-directorio-estudiantes'
import {
  ESTADOS_ASISTENCIA,
  ORIGENES_ASISTENCIA,
} from '@/lib/asistencia'
import {
  compararCursos,
  etiquetaCompactaCurso,
  etiquetaCortaCurso,
} from '@/lib/cursos'
import { datosEstudiante } from '@/lib/directorio'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaLarga, formatearHora, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { cerrarBloque } from '@/services/asistencia'
import type { Curso } from '@/services/cursos'
import {
  obtenerBloquesHoy,
  obtenerClaseActual,
  obtenerMisCursos,
  obtenerMisRegistrosHoy,
} from '@/services/profesores'

// html5-qrcode solo se descarga al abrir el escáner, no al entrar al panel.
const QrScanner = lazy(() =>
  import('@/components/QrScanner').then((modulo) => ({
    default: modulo.QrScanner,
  })),
)

/**
 * Vista principal del rol Profesor: las dos formas de registrar asistencia
 * (QR y manual) y un resumen de los registros del día.
 */
export function ProfesorDashboard() {
  const { usuario } = useAuth()
  const { hash } = useLocation()
  const queryClient = useQueryClient()
  const hoy = hoyIso()

  const [scannerAbierto, setScannerAbierto] = useState(false)
  const [manualAbierto, setManualAbierto] = useState(false)
  const [bloqueCerradoId, setBloqueCerradoId] = useState<number | null>(null)
  const [cursoFiltro, setCursoFiltro] = useState<string | null>(null)
  const [materiaFiltro, setMateriaFiltro] = useState<string | null>(null)

  const directorio = useDirectorioEstudiantes()

  // La tarjeta y los permisos dependen de la hora del servidor, por eso se
  // refresca periódicamente sin recargar la página.
  const clase = useQuery({
    queryKey: ['profesor', 'clase-actual'],
    queryFn: ({ signal }) => obtenerClaseActual(signal),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })

  const bloque = clase.data?.bloque ?? null
  const hayClase = Boolean(bloque)
  const puedeRegistrar = hayClase && !clase.isError
  const horarioId = bloque?.id

  // Historial completo del día: todos los cursos asignados al docente.
  const registros = useQuery({
    queryKey: ['profesor', 'mis-registros-hoy', hoy],
    queryFn: ({ signal }) => obtenerMisRegistrosHoy({}, signal),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  // Horario de hoy: fuente de verdad para las materias del filtro.
  const horarioHoy = useQuery({
    queryKey: ['profesor', 'bloques-hoy', hoy],
    queryFn: ({ signal }) => obtenerBloquesHoy(signal),
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  })

  // Cursos asignados: fuente de verdad para el selector de curso.
  const misCursos = useQuery({
    queryKey: ['profesor', 'mis-cursos'],
    queryFn: ({ signal }) => obtenerMisCursos(signal),
    refetchOnWindowFocus: true,
    staleTime: 5 * 60_000,
  })

  const filas = useMemo(
    () => registros.data?.data ?? [],
    [registros.data],
  )
  const total = registros.data?.total ?? filas.length
  const cargando = registros.isLoading || clase.isLoading
  const cargandoFiltros =
    clase.isLoading || horarioHoy.isLoading || misCursos.isLoading
  const bloquesHoy = useMemo(
    () => horarioHoy.data ?? [],
    [horarioHoy.data],
  )

  // Mientras el profesor no toque los selectores, se usan el curso y la
  // materia de la clase en curso; si no hay clase, se muestra todo el día.
  const cursoActual = bloque ? String(bloque.curso_id) : ''
  const materiaActual = bloque ? String(bloque.materia_id) : ''
  const cursoEfectivo = cursoFiltro ?? cursoActual
  const materiaEfectiva = materiaFiltro ?? materiaActual
  const hayFiltros = Boolean(cursoEfectivo || materiaEfectiva)

  const cursosDisponibles = useMemo(() => {
    const mapa = new Map<number, Curso>()
    for (const curso of misCursos.data ?? []) mapa.set(curso.id, curso)
    for (const bloqueHoy of bloquesHoy) {
      if (bloqueHoy.curso) mapa.set(bloqueHoy.curso.id, bloqueHoy.curso)
    }
    if (bloque?.curso) mapa.set(bloque.curso.id, bloque.curso)
    return [...mapa.values()].sort(compararCursos)
  }, [misCursos.data, bloquesHoy, bloque])

  const materiasDisponibles = useMemo(() => {
    const mapa = new Map<number, string>()
    for (const bloqueHoy of bloquesHoy) {
      if (!bloqueHoy.materia) continue
      if (
        cursoEfectivo &&
        String(bloqueHoy.curso_id) !== cursoEfectivo
      ) {
        continue
      }
      mapa.set(bloqueHoy.materia.id, bloqueHoy.materia.nombre)
    }
    if (
      bloque?.materia &&
      (!cursoEfectivo || String(bloque.curso_id) === cursoEfectivo)
    ) {
      mapa.set(bloque.materia.id, bloque.materia.nombre)
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [bloquesHoy, bloque, cursoEfectivo])

  const filasFiltradas = useMemo(
    () =>
      filas.filter((registro) => {
        if (
          cursoEfectivo &&
          String(registro.horario?.curso_id) !== cursoEfectivo
        ) {
          return false
        }
        if (
          materiaEfectiva &&
          String(registro.horario?.materia_id) !== materiaEfectiva
        ) {
          return false
        }
        return true
      }),
    [filas, cursoEfectivo, materiaEfectiva],
  )

  const sinDatos = filasFiltradas.length === 0 && !cargando && !registros.isError
  const sinRegistrosHoy = filas.length === 0

  function verTodos() {
    setCursoFiltro('')
    setMateriaFiltro('')
  }

  function cambiarCurso(valor: string) {
    if (!valor) {
      verTodos()
      return
    }

    setCursoFiltro(valor)
    setMateriaFiltro('')
  }

  function limpiarFiltros() {
    verTodos()
  }

  const tituloVacio =
    hayFiltros && !sinRegistrosHoy
      ? 'Sin registros con esos filtros'
      : 'Todavía no hay registros hoy'
  const descripcionVacio =
    hayFiltros && !sinRegistrosHoy
      ? 'Prueba con otro curso o materia, o limpia los filtros.'
      : 'Cuando registres asistencias, aparecerán aquí con curso, materia y hora.'

  const cerrar = useMutation({
    mutationFn: () => {
      if (!bloque) throw new Error('No hay clase en curso')
      return cerrarBloque(bloque.id, hoy)
    },
    onSuccess: (resultado) => {
      setBloqueCerradoId(bloque?.id ?? null)
      toast.success('Bloque cerrado', {
        description:
          `${resultado.faltas_registradas} ` +
          `${resultado.faltas_registradas === 1 ? 'falta registrada' : 'faltas registradas'}` +
          ` · ${resultado.notificaciones_encoladas} aviso(s) a tutores`,
      })
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['profesor', 'clase-actual'] })
      void queryClient.invalidateQueries({
        queryKey: ['profesor', 'mis-registros-hoy'],
      })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
    },
    onError: (error) => {
      toast.error('No se pudo cerrar el bloque', {
        description: mensajeDeError(error),
      })
    },
  })

  const yaCerrado = bloque ? bloqueCerradoId === bloque.id : false
  const cerrando = cerrar.isPending

  useEffect(() => {
    if (hash !== '#registros') return
    document
      .getElementById('registros')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const nombre = usuario?.nombres ?? 'profesor'

  function abrirEscaner() {
    if (!puedeRegistrar) return
    setScannerAbierto(true)
  }

  function abrirManual() {
    if (!puedeRegistrar) return
    setManualAbierto(true)
  }

  return (
    <ProfesorShell
      seccion="Panel del profesor"
      onEscanear={abrirEscaner}
      onRegistroManual={abrirManual}
      puedeRegistrar={puedeRegistrar}
    >
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
          <CalendarCheck2 className="size-4" aria-hidden="true" />
          <span>{formatearFechaLarga(hoy)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Jornada en curso</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
          Hola, {nombre}
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground lg:text-lg">
          Registra el ingreso de tus estudiantes escaneando su código QR o de
          forma manual cuando no tengan el celular a mano.
        </p>
      </section>

      <Card
        className={cn(
          'gap-0 overflow-hidden shadow-sm [--card-spacing:0px]',
          hayClase && 'ring-primary/25',
        )}
      >
        <CardHeader className="border-b border-border/70 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="size-5 text-primary" aria-hidden="true" />
            Clase en curso
          </CardTitle>
          <CardDescription>
            {hayClase
              ? 'El escáner y el registro manual están limitados a esta clase.'
              : 'Aquí aparecerá el bloque horario que te toca dictar.'}
          </CardDescription>
          {hayClase ? (
            <CardAction>
              <Badge variant="info">En curso</Badge>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent className="px-5 py-4">
          {clase.isLoading ? (
            <div className="space-y-2" role="status">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-44" />
              <span className="sr-only">Comprobando tu clase en curso…</span>
            </div>
          ) : clase.isError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 text-sm text-destructive"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {mensajeDeError(
                  clase.error,
                  'No se pudo comprobar tu clase en curso.',
                )}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void clase.refetch()}
                disabled={clase.isFetching}
              >
                <RefreshCw
                  className={cn(
                    'size-4',
                    clase.isFetching && 'animate-spin',
                  )}
                  aria-hidden="true"
                />
                Reintentar
              </Button>
            </div>
          ) : bloque ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
                  {bloque.curso
                    ? etiquetaCompactaCurso(bloque.curso)
                    : `Curso #${bloque.curso_id}`}
                  <span className="text-muted-foreground"> - </span>
                  {bloque.materia?.nombre ?? 'Sin materia'}
                  <span className="ml-1.5 text-base font-normal text-muted-foreground tabular-nums">
                    ({bloque.hora_inicio.slice(0, 5)} -{' '}
                    {bloque.hora_fin.slice(0, 5)})
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-4" aria-hidden="true" />
                    {bloque.hora_inicio.slice(0, 5)} –{' '}
                    {bloque.hora_fin.slice(0, 5)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {clase.data?.registrados ?? 0} de{' '}
                    {clase.data?.total_estudiantes ?? 0} estudiantes registrados
                  </span>
                </p>
              </div>

              <Button
                type="button"
                variant={yaCerrado ? 'secondary' : 'outline'}
                onClick={() => cerrar.mutate()}
                disabled={cerrando || yaCerrado}
                className="w-full shrink-0 sm:w-auto"
              >
                {cerrando ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
                {yaCerrado
                  ? 'Bloque cerrado'
                  : cerrando
                    ? 'Cerrando…'
                    : 'Cerrar bloque'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <BookOpen className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">No tienes clases en este momento</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Cuando empiece tu bloque, verás aquí el curso y la materia,
                    y se habilitarán el escáner y el registro manual.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void clase.refetch()}
                disabled={clase.isFetching}
                className="w-full shrink-0 sm:w-auto"
              >
                <RefreshCw
                  className={cn('size-4', clase.isFetching && 'animate-spin')}
                  aria-hidden="true"
                />
                {clase.isFetching ? 'Actualizando…' : 'Actualizar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <section
        aria-label="Formas de registrar asistencia"
        className="grid gap-4 md:grid-cols-2 lg:gap-5"
      >
        <button
          type="button"
          onClick={abrirEscaner}
          disabled={!puedeRegistrar}
          aria-disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : 'No tienes clases en este momento'}
          className="group relative min-h-48 overflow-hidden rounded-2xl bg-primary p-6 text-left text-primary-foreground shadow-sm outline-none transition-all hover:bg-primary/90 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
        >
          <QrCode
            className="pointer-events-none absolute -right-8 -bottom-8 size-52 text-primary-foreground/10 transition-transform duration-500 group-hover:scale-105"
            aria-hidden="true"
          />
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-foreground/15">
            <QrCode className="size-7" aria-hidden="true" />
          </span>
          <span className="mt-5 block text-2xl font-semibold tracking-tight">
            Escanear QR
          </span>
          <p className="mt-1 max-w-xs text-sm text-primary-foreground/80">
            Abre la cámara y lee el código dinámico del estudiante. Se registra
            al instante.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
            {puedeRegistrar ? 'Abrir cámara' : 'Disponible con clase en curso'}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </button>

        <button
          type="button"
          onClick={abrirManual}
          disabled={!puedeRegistrar}
          aria-disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : 'No tienes clases en este momento'}
          className="group relative min-h-48 overflow-hidden rounded-2xl border border-border bg-card p-6 text-left shadow-sm outline-none transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
        >
          <UserPlus
            className="pointer-events-none absolute -right-8 -bottom-8 size-52 text-primary/5 transition-transform duration-500 group-hover:scale-105"
            aria-hidden="true"
          />
          <span className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <UserPlus className="size-7" aria-hidden="true" />
          </span>
          <span className="mt-5 block text-2xl font-semibold tracking-tight">
            Registro Manual
          </span>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Busca al estudiante por nombre o CI y marca Presente, Tardanza o
            Falta.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            {puedeRegistrar ? 'Buscar estudiante' : 'Disponible con clase en curso'}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </button>
      </section>

      <Card
        id="registros"
        className="scroll-mt-24 gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={registros.isFetching}
      >
        <CardHeader className="[--card-spacing:--spacing(4)] border-b border-border/70 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ClipboardList className="size-5 text-primary" aria-hidden="true" />
            Registros de hoy
          </CardTitle>
          <CardDescription>
            Todos los movimientos del día en los cursos que tienes asignados.
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            {registros.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'asistencia' : 'asistencias'}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => void registros.refetch()}
              disabled={registros.isFetching}
              aria-label="Actualizar registros"
              title="Actualizar registros"
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  registros.isFetching && 'animate-spin',
                )}
                aria-hidden="true"
              />
            </Button>
          </CardAction>
        </CardHeader>

        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid gap-1.5 sm:w-52">
                <Label htmlFor="filtro-curso">Curso</Label>
                <Select
                  id="filtro-curso"
                  value={cursoEfectivo}
                  onChange={(evento) => cambiarCurso(evento.target.value)}
                  disabled={cargandoFiltros}
                  className="h-10"
                >
                  <option value="">Todos los registros de hoy</option>
                  {cursosDisponibles.map((curso) => (
                    <option key={curso.id} value={curso.id}>
                      {etiquetaCortaCurso(curso)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5 sm:w-52">
                <Label htmlFor="filtro-materia">Materia</Label>
                <Select
                  id="filtro-materia"
                  value={materiaEfectiva}
                  onChange={(evento) => {
                    const valor = evento.target.value
                    if (!valor) {
                      verTodos()
                      return
                    }
                    setCursoFiltro(cursoEfectivo)
                    setMateriaFiltro(valor)
                  }}
                  disabled={cargandoFiltros}
                  className="h-10"
                >
                  <option value="">Todos los registros de hoy</option>
                  {materiasDisponibles.map(([id, nombre]) => (
                    <option key={id} value={id}>
                      {nombre}
                    </option>
                  ))}
                </Select>
              </div>

              {hayFiltros ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={limpiarFiltros}
                >
                  <RefreshCw aria-hidden="true" />
                  Limpiar
                </Button>
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground">
              Total de asistencias registradas hoy:{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {total}
              </span>
              {hayFiltros ? (
                <>
                  {' · '}Mostrando{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {filasFiltradas.length}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {registros.isError && filas.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar la asistencia. Se muestran los últimos datos
            disponibles.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4">Estudiante</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Materia</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="px-4">Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={6}
              cargando={cargando}
              error={
                registros.isError && filas.length === 0
                  ? mensajeDeError(registros.error)
                  : null
              }
              onReintentar={() => void registros.refetch()}
              vacio={sinDatos}
              tituloVacio={tituloVacio}
              descripcionVacio={descripcionVacio}
              iconoVacio={CalendarCheck2}
            />

            {filasFiltradas.map((registro) => {
              const estudiante = datosEstudiante(
                directorio.data,
                registro.estudiante_id,
              )
              const curso =
                estudiante.curso ?? registro.horario?.curso ?? null
              const estado = ESTADOS_ASISTENCIA[registro.estado]
              const origen = ORIGENES_ASISTENCIA[registro.origen]

              return (
                <TableRow key={registro.id}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {estudiante.iniciales}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {estudiante.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {estudiante.ci
                            ? `CI ${estudiante.ci}`
                            : 'Sin datos del usuario'}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {curso ? (
                      <p className="font-medium">{etiquetaCortaCurso(curso)}</p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {registro.horario?.materia?.nombre ? (
                      <span className="font-medium">
                        {registro.horario.materia.nombre}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="tabular-nums">
                    {registro.hora_ingreso
                      ? formatearHora(registro.hora_ingreso)
                      : registro.horario
                        ? registro.horario.hora_inicio.slice(0, 5)
                        : '—'}
                  </TableCell>

                  <TableCell>
                    <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                  </TableCell>

                  <TableCell className="px-4">
                    <Badge variant={origen.variante}>{origen.etiqueta}</Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {registros.isFetching && !cargando ? (
          <p className="sr-only" role="status">
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Actualizando los registros de hoy…
          </p>
        ) : null}
      </Card>

      {scannerAbierto ? (
        <Suspense fallback={null}>
          <QrScanner
            abierto
            horarioId={horarioId}
            onCerrar={() => setScannerAbierto(false)}
          />
        </Suspense>
      ) : null}
      <RegistroManualDialog
        abierto={manualAbierto}
        horarioId={horarioId}
        onCerrar={() => setManualAbierto(false)}
      />
    </ProfesorShell>
  )
}
