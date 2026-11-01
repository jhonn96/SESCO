import { Fragment, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  columnGroupingFeature,
  createColumnHelper,
  createGroupedRowModel,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  BarChart3,
  CalendarRange,
  Download,
  GraduationCap,
  RefreshCw,
  Undo2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  compararCursos,
  etiquetaCurso,
  nombreTurno,
} from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaLarga, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { listarCursos } from '@/services/cursos'
import {
  obtenerReporteEstudiantes,
  type EstudianteReporte,
  type ResumenEstados,
} from '@/services/reportes'

const CURSOS_POR_PAGINA = 6
const FORMATO_PORCENTAJE = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const COLADOR_PERSONAS = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
})

const FEATURES = tableFeatures({
  columnGroupingFeature,
  groupedRowModel: createGroupedRowModel(),
})
const helper = createColumnHelper<typeof FEATURES, EstudianteReporte>()

function porcentaje(valor: number): string {
  return `${FORMATO_PORCENTAJE.format(valor)} %`
}

function variantePorcentaje(valor: number) {
  if (valor >= 90) return 'success' as const
  if (valor >= 75) return 'warning' as const
  return 'destructive' as const
}

const columnas = helper.columns([
  helper.accessor('apellido_paterno', {
    header: 'Apellido Paterno',
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue()}</span>
    ),
  }),
  helper.accessor('apellido_materno', {
    header: 'Apellido Materno',
    cell: ({ getValue }) =>
      getValue() ? (
        <span>{getValue()}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  helper.accessor('nombres', {
    header: 'Nombres',
    cell: ({ getValue }) => <span>{getValue()}</span>,
  }),
  helper.accessor('presentes', {
    header: 'Presentes',
    cell: ({ getValue }) => (
      <span className="font-medium text-success tabular-nums">
        {getValue()}
      </span>
    ),
  }),
  helper.accessor('tardanzas', {
    header: 'Tardanzas',
    cell: ({ getValue }) => (
      <span className="font-medium text-amber-700 tabular-nums dark:text-amber-300">
        {getValue()}
      </span>
    ),
  }),
  helper.accessor('faltas', {
    header: 'Faltas',
    cell: ({ getValue }) => (
      <span className="font-medium text-destructive tabular-nums">
        {getValue()}
      </span>
    ),
  }),
  helper.accessor('porcentaje_asistencia', {
    id: 'porcentaje',
    header: '% Asistencia',
    cell: ({ row }) => {
      const estudiante = row.original
      if (estudiante.registros === 0) {
        return <Badge variant="muted">Sin registros</Badge>
      }
      return (
        <Badge variant={variantePorcentaje(estudiante.porcentaje_asistencia)}>
          {porcentaje(estudiante.porcentaje_asistencia)}
        </Badge>
      )
    },
  }),
  // Columna oculta que agrupa el reporte por curso.
  helper.accessor((estudiante) => estudiante.curso_id, {
    id: 'curso',
    header: 'Curso',
    enableGrouping: true,
  }),
])

/** Orden escolar del reporte: curso y, dentro, apellidos y nombres. */
function compararFilas(a: EstudianteReporte, b: EstudianteReporte): number {
  if (a.curso && b.curso) {
    const porCurso = compararCursos(a.curso, b.curso)
    if (porCurso !== 0) return porCurso
  } else if (a.curso) {
    return -1
  } else if (b.curso) {
    return 1
  }

  return (
    COLADOR_PERSONAS.compare(a.apellido_paterno, b.apellido_paterno) ||
    COLADOR_PERSONAS.compare(a.apellido_materno, b.apellido_materno) ||
    COLADOR_PERSONAS.compare(a.nombres, b.nombres)
  )
}

interface ResumenGrupo {
  estudiantes: number
  presentes: number
  tardanzas: number
  faltas: number
  porcentaje: number
}

function resumirGrupo(filas: EstudianteReporte[]): ResumenGrupo {
  let presentes = 0
  let tardanzas = 0
  let faltas = 0
  let registros = 0
  for (const fila of filas) {
    presentes += fila.presentes
    tardanzas += fila.tardanzas
    faltas += fila.faltas
    registros += fila.registros
  }
  return {
    estudiantes: filas.length,
    presentes,
    tardanzas,
    faltas,
    porcentaje: registros === 0 ? 0 : ((registros - faltas) / registros) * 100,
  }
}

function mesActual(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
}

function primerDiaDelMes(): string {
  return `${mesActual()}-01`
}

function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, numeroMes] = mes.split('-').map(Number)
  const ultimoDia = new Date(anio, numeroMes, 0).getDate()
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimoDia).padStart(2, '0')}`,
  }
}

function nombreMes(mes: string): string {
  const [anio, numeroMes] = mes.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-BO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(anio, numeroMes - 1, 15))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function escaparCsv(valor: string | number): string {
  return `"${String(valor).replace(/"/g, '""')}"`
}

function exportarCsv(
  estudiantes: EstudianteReporte[],
  desde: string,
  hasta: string,
) {
  const encabezados = [
    'Curso',
    'Apellido Paterno',
    'Apellido Materno',
    'Nombres',
    'CI',
    'Presentes',
    'Tardanzas',
    'Faltas',
    'Justificados',
    'Porcentaje de asistencia',
  ]

  const filas = estudiantes.map((estudiante) => [
    estudiante.curso ? etiquetaCurso(estudiante.curso) : '—',
    estudiante.apellido_paterno,
    estudiante.apellido_materno,
    estudiante.nombres,
    estudiante.ci,
    estudiante.presentes,
    estudiante.tardanzas,
    estudiante.faltas,
    estudiante.justificadas,
    `${estudiante.porcentaje_asistencia.toFixed(1).replace('.', ',')} %`,
  ])

  const contenido = [encabezados, ...filas]
    .map((fila) => fila.map(escaparCsv).join(';'))
    .join('\r\n')

  const blob = new Blob([`\uFEFF${contenido}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `reporte-asistencia_${desde}_${hasta}.csv`
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)

  toast.success('Reporte exportado', {
    description: `${estudiantes.length} estudiantes incluidos en el archivo CSV.`,
  })
}

interface ResumenKpiProps {
  etiqueta: string
  valor: number | string
  detalle?: string
  className?: string
}

function ResumenKpi({ etiqueta, valor, detalle, className }: ResumenKpiProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </p>
      <p className={cn('text-2xl font-semibold tabular-nums', className)}>
        {valor}
      </p>
      {detalle ? (
        <p className="text-xs text-muted-foreground">{detalle}</p>
      ) : null}
    </div>
  )
}

function resumenAsistencia(totales: ResumenEstados): number {
  if (totales.registros === 0) return 0
  return ((totales.registros - totales.faltas) / totales.registros) * 100
}

export function Reportes() {
  const [modo, setModo] = useState<'mes' | 'rango'>('mes')
  const [mes, setMes] = useState(mesActual)
  const [desde, setDesde] = useState(primerDiaDelMes)
  const [hasta, setHasta] = useState(hoyIso)
  const [cursoId, setCursoId] = useState<number | undefined>()
  const [pagina, setPagina] = useState(0)

  const rango = modo === 'mes' ? rangoDelMes(mes) : { desde, hasta }
  const rangoInvalido = modo === 'rango' && desde > hasta

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
    queryKey: [
      'reportes',
      'estudiantes',
      { desde: rango.desde, hasta: rango.hasta, cursoId },
    ],
    queryFn: ({ signal }) =>
      obtenerReporteEstudiantes(
        { desde: rango.desde, hasta: rango.hasta, cursoId },
        signal,
      ),
    placeholderData: keepPreviousData,
    enabled: !rangoInvalido,
  })

  const reporte = consulta.data
  const estudiantes = useMemo(
    () => [...(reporte?.estudiantes ?? [])].sort(compararFilas),
    [reporte?.estudiantes],
  )
  const cargando = consulta.isLoading
  const sinDatos = estudiantes.length === 0 && !cargando && !consulta.isError

  const tabla = useTable({
    features: FEATURES,
    columns: columnas,
    data: estudiantes,
    // El curso no se repite en cada fila: agrupa el reporte como un cuaderno.
    groupedColumnMode: 'remove',
    initialState: { grouping: ['curso'] },
  })

  const grupos = tabla.getRowModel().rows
  const totalGrupos = grupos.length
  const totalColumnas =
    tabla.getHeaderGroups()[0]?.headers.length ?? columnas.length
  const totalPaginas = Math.max(1, Math.ceil(totalGrupos / CURSOS_POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const gruposPagina = grupos.slice(
    paginaActual * CURSOS_POR_PAGINA,
    (paginaActual + 1) * CURSOS_POR_PAGINA,
  )

  function cambiarModo(valor: 'mes' | 'rango') {
    setModo(valor)
    setPagina(0)
  }

  function cambiarCurso(valor: string) {
    setCursoId(valor ? Number(valor) : undefined)
    setPagina(0)
  }

  function limpiarFiltros() {
    setModo('mes')
    setMes(mesActual())
    setDesde(primerDiaDelMes())
    setHasta(hoyIso())
    setCursoId(undefined)
    setPagina(0)
  }

  const porcentajeGeneral = reporte
    ? resumenAsistencia(reporte.totales)
    : 0

  return (
    <DashboardShell seccion="Reportes">
      <PageHeader
        titulo="Reportes de asistencia"
        descripcion="Totales por estudiante en un mes o en un rango de fechas, agrupados por curso y ordenados por apellidos. El porcentaje de asistencia descuenta las faltas de los registros del periodo."
        icono={BarChart3}
        acciones={
          <>
            {reporte ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {reporte.total_estudiantes}{' '}
                {reporte.total_estudiantes === 1 ? 'estudiante' : 'estudiantes'}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() =>
                exportarCsv(estudiantes, rango.desde, rango.hasta)
              }
              disabled={estudiantes.length === 0 || consulta.isFetching}
            >
              <Download aria-hidden="true" />
              Exportar a CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void consulta.refetch()}
              disabled={consulta.isFetching || rangoInvalido}
              aria-label="Actualizar reporte"
              title="Actualizar reporte"
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
        <div className="flex flex-col gap-4 px-(--card-spacing) xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CalendarRange className="size-4" aria-hidden="true" />
              Periodo del reporte
            </span>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Tipo de periodo"
            >
              <Button
                type="button"
                size="sm"
                variant={modo === 'mes' ? 'default' : 'outline'}
                aria-pressed={modo === 'mes'}
                onClick={() => cambiarModo('mes')}
              >
                Por mes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={modo === 'rango' ? 'default' : 'outline'}
                aria-pressed={modo === 'rango'}
                onClick={() => cambiarModo('rango')}
              >
                Rango de fechas
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {modo === 'mes' ? (
              <div className="grid w-full gap-1.5 sm:w-52">
                <label
                  htmlFor="reporte-mes"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Mes
                </label>
                <Input
                  id="reporte-mes"
                  type="month"
                  value={mes}
                  max={mesActual()}
                  onChange={(evento) => {
                    setMes(evento.target.value)
                    setPagina(0)
                  }}
                  className="h-10 text-base md:text-base"
                />
              </div>
            ) : (
              <>
                <div className="grid w-full gap-1.5 sm:w-44">
                  <label
                    htmlFor="reporte-desde"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Desde
                  </label>
                  <Input
                    id="reporte-desde"
                    type="date"
                    value={desde}
                    max={hasta}
                    onChange={(evento) => {
                      setDesde(evento.target.value)
                      setPagina(0)
                    }}
                    className="h-10 text-base md:text-base"
                    aria-invalid={rangoInvalido}
                  />
                </div>
                <div className="grid w-full gap-1.5 sm:w-44">
                  <label
                    htmlFor="reporte-hasta"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Hasta
                  </label>
                  <Input
                    id="reporte-hasta"
                    type="date"
                    value={hasta}
                    min={desde}
                    max={hoyIso()}
                    onChange={(evento) => {
                      setHasta(evento.target.value)
                      setPagina(0)
                    }}
                    className="h-10 text-base md:text-base"
                    aria-invalid={rangoInvalido}
                  />
                </div>
              </>
            )}

            <div className="grid w-full gap-1.5 sm:w-72">
              <label
                htmlFor="reporte-curso"
                className="text-sm font-medium text-muted-foreground"
              >
                Curso
              </label>
              <Select
                id="reporte-curso"
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
            >
              <Undo2 aria-hidden="true" />
              Limpiar
            </Button>
          </div>
        </div>

        {rangoInvalido ? (
          <p
            className="mx-(--card-spacing) rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            La fecha inicial no puede ser posterior a la fecha final.
          </p>
        ) : (
          <p className="mx-(--card-spacing) text-sm text-muted-foreground">
            {modo === 'mes'
              ? `${nombreMes(mes)} · ${formatearFechaLarga(rango.desde)} al ${formatearFechaLarga(rango.hasta)}`
              : `Del ${formatearFechaLarga(rango.desde)} al ${formatearFechaLarga(rango.hasta)}`}
          </p>
        )}
      </Card>

      {reporte ? (
        <Card className="[--card-spacing:--spacing(5)] shadow-sm">
          <CardContent className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            <ResumenKpi
              etiqueta="Estudiantes"
              valor={reporte.total_estudiantes}
              detalle="En el reporte"
            />
            <ResumenKpi
              etiqueta="Presentes"
              valor={reporte.totales.presentes}
              className="text-success"
            />
            <ResumenKpi
              etiqueta="Tardanzas"
              valor={reporte.totales.tardanzas}
              className="text-amber-700 dark:text-amber-300"
            />
            <ResumenKpi
              etiqueta="Faltas"
              valor={reporte.totales.faltas}
              className="text-destructive"
            />
            <ResumenKpi
              etiqueta="Justificados"
              valor={reporte.totales.justificadas}
              className="text-primary"
            />
            <ResumenKpi
              etiqueta="Asistencia"
              valor={porcentaje(porcentajeGeneral)}
              detalle={`${reporte.totales.registros} registros`}
              className={
                porcentajeGeneral >= 90
                  ? 'text-success'
                  : porcentajeGeneral >= 75
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-destructive'
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && estudiantes.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar el reporte. Se muestran los últimos datos
            disponibles.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            {tabla.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id} className="bg-muted/40 hover:bg-muted/40">
                {grupo.headers.map((encabezado) => (
                  <TableHead key={encabezado.id} className="px-4">
                    {encabezado.isPlaceholder ? null : (
                      <tabla.FlexRender header={encabezado} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={totalColumnas}
              cargando={cargando}
              error={
                consulta.isError && estudiantes.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio={
                cursoId === undefined
                  ? 'No hay asistencias en el periodo'
                  : 'No hay asistencias para el curso seleccionado'
              }
              descripcionVacio="Prueba con otro mes, un rango de fechas más amplio o cambia el curso."
              iconoVacio={Users}
            />

            {gruposPagina.map((grupo) => {
              const filas = grupo.subRows.map((fila) => fila.original)
              const resumen = resumirGrupo(filas)
              const curso = filas[0]?.curso
              return (
                <Fragment key={grupo.id}>
                  <TableRow className="border-y border-primary/25 bg-primary/10 hover:bg-primary/10">
                    <TableCell
                      colSpan={totalColumnas}
                      className="px-4 py-2.5"
                      aria-label={`Curso ${curso ? etiquetaCurso(curso) : 'sin asignar'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
                        <div className="flex items-center gap-2">
                          <GraduationCap
                            className="size-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <span className="text-sm font-semibold text-foreground">
                            {curso ? etiquetaCurso(curso) : 'Sin curso asignado'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {resumen.estudiantes}{' '}
                            {resumen.estudiantes === 1
                              ? 'estudiante'
                              : 'estudiantes'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                          <span>
                            Presentes{' '}
                            <strong className="font-semibold text-success">
                              {resumen.presentes}
                            </strong>
                          </span>
                          <span>
                            Tardanzas{' '}
                            <strong className="font-semibold text-amber-700 dark:text-amber-300">
                              {resumen.tardanzas}
                            </strong>
                          </span>
                          <span>
                            Faltas{' '}
                            <strong className="font-semibold text-destructive">
                              {resumen.faltas}
                            </strong>
                          </span>
                          <Badge
                            variant={variantePorcentaje(resumen.porcentaje)}
                          >
                            {porcentaje(resumen.porcentaje)}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>

                  {grupo.subRows.map((fila) => (
                    <TableRow key={fila.id} className="hover:bg-muted/40">
                      {fila.getAllCells().map((celda) => (
                        <TableCell key={celda.id} className="px-4">
                          <tabla.FlexRender cell={celda} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>

        <TablaPaginacion
          pagina={paginaActual}
          tamano={CURSOS_POR_PAGINA}
          total={totalGrupos}
          onCambiarPagina={setPagina}
          etiqueta={totalGrupos === 1 ? 'curso' : 'cursos'}
          deshabilitado={consulta.isFetching}
        />
      </Card>
    </DashboardShell>
  )
}
