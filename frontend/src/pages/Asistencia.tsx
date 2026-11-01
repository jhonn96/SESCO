import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck2,
  ListFilter,
  LoaderCircle,
  PencilLine,
  QrCode,
  RefreshCw,
  ScanLine,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { QrScannerDialog } from '@/components/QrScannerDialog'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDirectorioEstudiantes } from '@/hooks/use-directorio-estudiantes'
import {
  ESTADOS_ASISTENCIA as ESTADO_ASISTENCIA,
  ORIGENES_ASISTENCIA as ORIGEN_ASISTENCIA,
} from '@/lib/asistencia'
import {
  compararCursos,
  etiquetaCortaCurso,
  etiquetaCurso,
  nombreTurno,
} from '@/lib/cursos'
import { datosEstudiante } from '@/lib/directorio'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaLarga, formatearHora, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  escanearAsistencia,
  listarAsistencias,
  type RegistroAsistencia,
} from '@/services/asistencia'
import { listarCursos } from '@/services/cursos'

const TAMANO = 15

function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

export function Asistencia() {
  const [fecha, setFecha] = useState(hoyIso)
  const [cursoId, setCursoId] = useState<number | undefined>()
  const [pagina, setPagina] = useState(0)
  const [scannerAbierto, setScannerAbierto] = useState(false)

  const queryClient = useQueryClient()
  const estudiantes = useDirectorioEstudiantes()

  const cursos = useQuery({
    queryKey: ['cursos', 'lista'],
    queryFn: ({ signal }) => listarCursos(signal),
    staleTime: 10 * 60_000,
  })

  const cursosOrdenados = useMemo(
    () => [...(cursos.data ?? [])].sort(compararCursos),
    [cursos.data],
  )

  const consulta = useQuery({
    queryKey: ['asistencia', 'dia', { fecha, cursoId, pagina }],
    queryFn: ({ signal }) =>
      listarAsistencias(
        {
          fecha,
          cursoId,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const registros = consulta.data?.data ?? []
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const sinDatos = registros.length === 0 && !cargando && !consulta.isError

  const escanear = useMutation({
    mutationFn: (contenido: string) => escanearAsistencia(contenido),
    onSuccess: (registro) => {
      const estudiante = datosEstudiante(
        estudiantes.data,
        registro.estudiante_id,
      )
      const estado = ESTADO_ASISTENCIA[registro.estado]
      const retraso =
        registro.minutos_retraso > 0
          ? ` · ${registro.minutos_retraso} min de retraso`
          : ''

      toast.success('Asistencia registrada', {
        description: `${estudiante.nombre} · ${estado.etiqueta}${retraso}`,
      })
      setScannerAbierto(false)
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
    },
  })

  function abrirScanner() {
    escanear.reset()
    setScannerAbierto(true)
  }

  function cambiarCurso(valor: string) {
    setCursoId(valor ? Number(valor) : undefined)
    setPagina(0)
  }

  function limpiarFiltros() {
    setFecha(hoyIso())
    setCursoId(undefined)
    setPagina(0)
  }

  return (
    <DashboardShell seccion="Asistencia">
      <PageHeader
        titulo="Asistencia del día"
        descripcion="Consulta los registros del día seleccionado y registra el ingreso desde portería escaneando el QR dinámico del estudiante."
        icono={CalendarCheck2}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'registro' : 'registros'}
              </Badge>
            ) : null}
            <Button type="button" className="h-10" onClick={abrirScanner}>
              <ScanLine aria-hidden="true" />
              Escanear QR
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void consulta.refetch()}
              disabled={consulta.isFetching}
            >
              <RefreshCw
                className={cn('size-4', consulta.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </>
        }
      />

      <Card className="[--card-spacing:--spacing(4)] shadow-sm">
        <div className="flex flex-col gap-4 px-(--card-spacing) lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid gap-1.5">
              <label
                htmlFor="asistencia-fecha"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <ListFilter className="size-4" aria-hidden="true" />
                Fecha
              </label>
              <Input
                id="asistencia-fecha"
                type="date"
                value={fecha}
                max={hoyIso()}
                onChange={(evento) => {
                  if (evento.target.value) {
                    setFecha(evento.target.value)
                    setPagina(0)
                  }
                }}
                className="h-10 w-48 text-base md:text-base"
              />
            </div>

            <div className="grid w-full gap-1.5 sm:w-72">
              <label
                htmlFor="asistencia-curso"
                className="text-sm font-medium text-muted-foreground"
              >
                Curso
              </label>
              <Select
                id="asistencia-curso"
                value={cursoId === undefined ? '' : String(cursoId)}
                onChange={(evento) => cambiarCurso(evento.target.value)}
                disabled={cursos.isLoading}
              >
                <option value="">Todos los cursos</option>
                {cursosOrdenados.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {etiquetaCurso(curso)} · {nombreTurno(curso.turno)}
                  </option>
                ))}
              </Select>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={limpiarFiltros}
              disabled={fecha === hoyIso() && cursoId === undefined}
            >
              <Undo2 aria-hidden="true" />
              Hoy
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {formatearFechaLarga(fecha)}
          </p>
        </div>
      </Card>

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && registros.length > 0 ? (
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
              <TableHead>Hora de ingreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="px-4">Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={5}
              cargando={cargando}
              error={
                consulta.isError && registros.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio="No hay asistencia registrada para esta fecha"
              descripcionVacio="Puedes registrar el ingreso con el botón Escanear QR o elegir otra fecha y curso."
              iconoVacio={CalendarCheck2}
            />

            {registros.map((registro: RegistroAsistencia) => {
              const estudiante = datosEstudiante(
                estudiantes.data,
                registro.estudiante_id,
              )
              const curso = estudiante.curso ?? registro.horario?.curso ?? null
              const estado = ESTADO_ASISTENCIA[registro.estado]
              const origen = ORIGEN_ASISTENCIA[registro.origen]

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
                          {registro.horario
                            ? ` · ${horaCorta(registro.horario.hora_inicio)}–${horaCorta(registro.horario.hora_fin)}`
                            : ''}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {registro.hora_ingreso ? (
                      <>
                        <p className="font-medium tabular-nums">
                          {formatearHora(registro.hora_ingreso)}
                        </p>
                        {registro.minutos_retraso > 0 ? (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            {registro.minutos_retraso} min de retraso
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            A tiempo
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                  </TableCell>

                  <TableCell className="px-4">
                    <Badge variant={origen.variante}>
                      {registro.origen === 'qr' ? (
                        <QrCode aria-hidden="true" />
                      ) : (
                        <PencilLine aria-hidden="true" />
                      )}
                      {origen.etiqueta}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <TablaPaginacion
          pagina={pagina}
          tamano={TAMANO}
          total={total}
          onCambiarPagina={setPagina}
          etiqueta="registros"
          deshabilitado={consulta.isFetching}
        />
      </Card>

      <QrScannerDialog
        abierto={scannerAbierto}
        onCambiarAbierto={setScannerAbierto}
        onDetectar={(contenido) => escanear.mutate(contenido)}
        procesando={escanear.isPending}
        error={
          escanear.isError ? mensajeDeError(escanear.error) : null
        }
      />

      {escanear.isPending ? (
        <p className="sr-only" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Registrando asistencia…
        </p>
      ) : null}
    </DashboardShell>
  )
}
