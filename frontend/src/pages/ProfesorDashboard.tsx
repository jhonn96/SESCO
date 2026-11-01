import { lazy, Suspense, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  LoaderCircle,
  QrCode,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { ProfesorShell } from '@/components/ProfesorShell'
import { RegistroManualDialog } from '@/components/RegistroManualDialog'
import { TablaEstado } from '@/components/TablaEstado'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { etiquetaCortaCurso } from '@/lib/cursos'
import { datosEstudiante } from '@/lib/directorio'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaLarga, formatearHora, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { listarAsistencias } from '@/services/asistencia'

const LIMITE_REGISTROS = 8

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
  const hoy = hoyIso()

  const [scannerAbierto, setScannerAbierto] = useState(false)
  const [manualAbierto, setManualAbierto] = useState(false)

  const directorio = useDirectorioEstudiantes()

  const registros = useQuery({
    queryKey: ['asistencia', 'profesor', 'hoy', hoy],
    queryFn: ({ signal }) =>
      listarAsistencias(
        { fecha: hoy, skip: 0, limit: LIMITE_REGISTROS },
        signal,
      ),
    refetchInterval: 60_000,
  })

  const filas = registros.data?.data ?? []
  const total = registros.data?.total ?? 0
  const cargando = registros.isLoading
  const sinDatos = filas.length === 0 && !cargando && !registros.isError

  useEffect(() => {
    if (hash !== '#registros') return
    document
      .getElementById('registros')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const nombre = usuario?.nombres ?? 'profesor'

  return (
    <ProfesorShell
      seccion="Panel del profesor"
      onEscanear={() => setScannerAbierto(true)}
      onRegistroManual={() => setManualAbierto(true)}
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

      <section
        aria-label="Formas de registrar asistencia"
        className="grid gap-4 md:grid-cols-2 lg:gap-5"
      >
        <button
          type="button"
          onClick={() => setScannerAbierto(true)}
          className="group relative min-h-48 overflow-hidden rounded-2xl bg-primary p-6 text-left text-primary-foreground shadow-sm outline-none transition-all hover:bg-primary/90 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
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
            Abrir cámara
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setManualAbierto(true)}
          className="group relative min-h-48 overflow-hidden rounded-2xl border border-border bg-card p-6 text-left shadow-sm outline-none transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
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
            Buscar estudiante
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
            Últimos movimientos del día, incluidos los registros de portería.
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            {registros.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'registro' : 'registros'}
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
              <TableHead>Hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="px-4">Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={5}
              cargando={cargando}
              error={
                registros.isError && filas.length === 0
                  ? mensajeDeError(registros.error)
                  : null
              }
              onReintentar={() => void registros.refetch()}
              vacio={sinDatos}
              tituloVacio="Todavía no hay registros hoy"
              descripcionVacio="Escanea el QR de un estudiante o usa el registro manual para comenzar la jornada."
              iconoVacio={CalendarCheck2}
            />

            {filas.map((registro) => {
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
                      <>
                        <p className="font-medium">
                          {etiquetaCortaCurso(curso)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {registro.horario?.materia?.nombre ?? 'Sin materia'}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="tabular-nums">
                    {registro.hora_ingreso
                      ? formatearHora(registro.hora_ingreso)
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
            onCerrar={() => setScannerAbierto(false)}
          />
        </Suspense>
      ) : null}
      <RegistroManualDialog
        abierto={manualAbierto}
        onCerrar={() => setManualAbierto(false)}
      />
    </ProfesorShell>
  )
}
