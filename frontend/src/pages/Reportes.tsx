import { Fragment, lazy, Suspense, useMemo, useState } from 'react'
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
  FileText,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  Undo2,
  Users,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
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
import { Input } from '@/components/ui/input'
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
import {
  compararCursos,
  etiquetaCurso,
  nombreTurno,
} from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import {
  formatearFecha,
  formatearFechaLarga,
  hoyIso,
} from '@/lib/fechas'
import { etiquetaPeriodo, periodoVigente } from '@/lib/periodos'
import { cn } from '@/lib/utils'
import { listarCursos } from '@/services/cursos'
import { listarPeriodos } from '@/services/periodos'
import {
  obtenerComparacionMensual,
  obtenerReporteEstudiantes,
  type EstudianteReporte,
  type ResumenEstados,
} from '@/services/reportes'

const ComparacionMensualChart = lazy(() =>
  import('@/components/ComparacionMensualChart').then((modulo) => ({
    default: modulo.ComparacionMensualChart,
  })),
)

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

function nombreMesCorto(iso: string): string {
  const [anio, numeroMes] = iso.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-BO', { month: 'short' })
    .format(new Date(anio, numeroMes - 1, 15))
    .replace(/\./g, '')
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

async function cargarLogo(): Promise<string | null> {
  try {
    const imagen = new Image()
    imagen.src = '/favicon.svg'
    await imagen.decode()

    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 92
    const contexto = canvas.getContext('2d')
    if (!contexto) return null
    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function fechaDeGeneracion(): string {
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date())
}

function nombreArchivoReporte(desde: string, hasta: string): string {
  return `Reporte_General_Asistencia_${desde}_${hasta}.pdf`
}

interface DatosPdfReporte {
  estudiantes: EstudianteReporte[]
  desde: string
  hasta: string
  periodo: string
  curso: string
  resumen: ResumenEstados
  porcentaje: number
}

async function generarReportePdf({
  estudiantes,
  desde,
  hasta,
  periodo,
  curso,
  resumen,
  porcentaje,
}: DatosPdfReporte): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margen = 12
  const logo = await cargarLogo()

  if (logo) {
    doc.addImage(logo, 'PNG', margen, 9, 13, 12.5)
  }

  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('UNIDAD EDUCATIVA SESCO', 29, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(105, 105, 120)
  doc.text('Sistema de Control de Asistencia Escolar', 29, 20)

  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Reporte General de Asistencia', pageWidth - margen, 15, {
    align: 'right',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(105, 105, 120)
  doc.text(`Generado: ${fechaDeGeneracion()}`, pageWidth - margen, 20, {
    align: 'right',
  })

  doc.setDrawColor(224, 218, 240)
  doc.setLineWidth(0.4)
  doc.line(margen, 26, pageWidth - margen, 26)

  doc.setFillColor(248, 247, 252)
  doc.roundedRect(margen, 31, pageWidth - margen * 2, 18, 3, 3, 'F')

  doc.setFontSize(8)
  doc.setTextColor(115, 110, 130)
  doc.text('PERIODO', 16, 37)
  doc.text('RANGO DE FECHAS', 96, 37)
  doc.text('CURSO', 196, 37)

  doc.setFontSize(10)
  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.text(periodo, 16, 43)
  doc.text(`${formatearFecha(desde)} al ${formatearFecha(hasta)}`, 96, 43)
  doc.text(curso, 196, 43)

  const filas = estudiantes.map((estudiante) => [
    estudiante.curso ? etiquetaCurso(estudiante.curso) : 'Sin curso',
    `${estudiante.apellido_paterno} ${estudiante.apellido_materno} ${estudiante.nombres}`
      .replace(/\s+/g, ' ')
      .trim(),
    estudiante.ci,
    String(estudiante.presentes),
    String(estudiante.tardanzas),
    String(estudiante.faltas),
    String(estudiante.justificadas),
    `${estudiante.porcentaje_asistencia.toFixed(1).replace('.', ',')} %`,
  ])

  autoTable(doc, {
    startY: 54,
    head: [
      [
        'Curso',
        'Apellidos y nombres',
        'CI',
        'Presentes',
        'Tardanzas',
        'Faltas',
        'Justificados',
        '% Asistencia',
      ],
    ],
    body: filas,
    theme: 'grid',
    margin: { top: 20, right: margen, bottom: 20, left: margen },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [45, 45, 55],
      lineColor: [228, 224, 238],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [109, 40, 217],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 246, 253],
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 82 },
      2: { cellWidth: 24 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 24 },
      7: { halign: 'right', cellWidth: 24 },
    },
  })

  const finalY =
    (
      doc as jsPDF & {
        lastAutoTable?: { finalY: number }
      }
    ).lastAutoTable?.finalY ?? 60

  let y = finalY + 10
  if (y > pageHeight - 34) {
    doc.addPage()
    y = 22
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(35, 35, 45)
  doc.text('Resumen general', margen, y)

  y += 6
  const resumenItems = [
    { etiqueta: 'Estudiantes', valor: estudiantes.length, color: [45, 45, 55] },
    { etiqueta: 'Presentes', valor: resumen.presentes, color: [22, 128, 57] },
    { etiqueta: 'Tardanzas', valor: resumen.tardanzas, color: [180, 83, 9] },
    { etiqueta: 'Faltas', valor: resumen.faltas, color: [185, 28, 28] },
    {
      etiqueta: 'Justificados',
      valor: resumen.justificadas,
      color: [109, 40, 217],
    },
    {
      etiqueta: 'Asistencia',
      valor: `${porcentaje.toFixed(1).replace('.', ',')} %`,
      color: [45, 45, 55],
    },
  ] as const

  const separacion = 4
  const anchoCaja =
    (pageWidth - margen * 2 - separacion * (resumenItems.length - 1)) /
    resumenItems.length

  resumenItems.forEach((item, indice) => {
    const x = margen + indice * (anchoCaja + separacion)
    doc.setFillColor(248, 247, 252)
    doc.roundedRect(x, y, anchoCaja, 17, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(105, 105, 120)
    doc.text(item.etiqueta, x + anchoCaja / 2, y + 6, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(
      item.color[0] as number,
      item.color[1] as number,
      item.color[2] as number,
    )
    doc.text(String(item.valor), x + anchoCaja / 2, y + 13, {
      align: 'center',
    })
  })

  const totalPaginas = doc.getNumberOfPages()
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(140, 140, 155)
    doc.text('SESCO · Unidad Educativa', margen, pageHeight - 7)
    doc.text(
      `Página ${pagina} de ${totalPaginas}`,
      pageWidth - margen,
      pageHeight - 7,
      { align: 'right' },
    )
  }

  doc.save(nombreArchivoReporte(desde, hasta))
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
  const [periodoId, setPeriodoId] = useState<number | undefined>()
  const [pagina, setPagina] = useState(0)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const rango = modo === 'mes' ? rangoDelMes(mes) : { desde, hasta }
  const rangoInvalido = modo === 'rango' && desde > hasta

  const cursos = useQuery({
    queryKey: ['cursos', 'lista'],
    queryFn: ({ signal }) => listarCursos(signal),
    staleTime: 10 * 60_000,
  })

  const periodos = useQuery({
    queryKey: ['periodos', 'lista'],
    queryFn: ({ signal }) => listarPeriodos(signal),
    staleTime: 30 * 60_000,
  })

  const cursosOrdenados = useMemo(
    () => [...(cursos.data ?? [])].sort(compararCursos),
    [cursos.data],
  )

  const periodosOrdenados = useMemo(
    () =>
      [...(periodos.data ?? [])].sort(
        (a, b) => b.gestion - a.gestion || b.trimestre - a.trimestre,
      ),
    [periodos.data],
  )

  const periodoPredeterminado = useMemo(
    () => periodoVigente(periodos.data ?? [], hoyIso()),
    [periodos.data],
  )

  const periodoSeleccionado = periodoId ?? periodoPredeterminado?.id
  const periodoActivo = periodosOrdenados.find(
    (periodo) => periodo.id === periodoSeleccionado,
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

  const comparacion = useQuery({
    queryKey: ['reportes', 'comparacion-mensual', periodoSeleccionado],
    queryFn: ({ signal }) =>
      obtenerComparacionMensual(periodoSeleccionado!, signal),
    enabled: periodoSeleccionado !== undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

  const serieMensual = useMemo(
    () =>
      (comparacion.data?.meses ?? []).map((item) => ({
        mes: nombreMesCorto(item.mes),
        etiqueta: nombreMes(item.mes.slice(0, 7)),
        presentes:
          item.registros === 0 ? null : (item.presentes / item.registros) * 100,
        tardanzas:
          item.registros === 0 ? null : (item.tardanzas / item.registros) * 100,
        faltas:
          item.registros === 0 ? null : (item.faltas / item.registros) * 100,
        registros: item.registros,
      })),
    [comparacion.data],
  )

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
    setPeriodoId(undefined)
    setPagina(0)
  }

  const porcentajeGeneral = reporte
    ? resumenAsistencia(reporte.totales)
    : 0

  const cursoSeleccionado = cursosOrdenados.find(
    (curso) => curso.id === cursoId,
  )
  const cursoTxt = cursoSeleccionado
    ? etiquetaCurso(cursoSeleccionado)
    : 'Todos los cursos'
  const periodoTxt = modo === 'mes' ? nombreMes(mes) : 'Rango de fechas'

  async function descargarPdf() {
    if (!reporte || estudiantes.length === 0) return
    setGenerandoPdf(true)
    try {
      await generarReportePdf({
        estudiantes,
        desde: rango.desde,
        hasta: rango.hasta,
        periodo: periodoTxt,
        curso: cursoTxt,
        resumen: reporte.totales,
        porcentaje: porcentajeGeneral,
      })
      toast.success('Reporte PDF generado', {
        description: `${estudiantes.length} estudiantes incluidos en el archivo PDF.`,
      })
    } catch (error) {
      toast.error('No se pudo generar el PDF', {
        description: mensajeDeError(error),
      })
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <DashboardShell seccion="Reportes">
      <PageHeader
        titulo="Reportes de asistencia"
        descripcion="Totales por estudiante en un mes o en un rango de fechas, agrupados por curso y ordenados por apellidos, más la comparación mensual por trimestre. El porcentaje de asistencia descuenta las faltas de los registros del periodo."
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
              onClick={() => void descargarPdf()}
              disabled={
                generandoPdf ||
                estudiantes.length === 0 ||
                consulta.isFetching ||
                rangoInvalido
              }
            >
              {generandoPdf ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FileText aria-hidden="true" />
              )}
              Exportar PDF
            </Button>
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

      <Card
        className="[--card-spacing:--spacing(6)] shadow-sm"
        aria-busy={comparacion.isFetching}
      >
        <CardHeader>
          <CardTitle className="text-2xl">Comparación mensual</CardTitle>
          <CardDescription className="text-base">
            {comparacion.data && periodoActivo
              ? `${etiquetaPeriodo(periodoActivo)} · ${porcentaje(comparacion.data.porcentaje_asistencia)} de asistencia general · ${comparacion.data.totales.registros} registros`
              : 'Evolución mensual de presentes, tardanzas y faltas dentro del trimestre seleccionado.'}
          </CardDescription>
          <CardAction>
            <div className="grid w-60 gap-1.5">
              <label
                htmlFor="comparacion-periodo"
                className="text-sm font-medium text-muted-foreground"
              >
                Trimestre
              </label>
              <Select
                id="comparacion-periodo"
                value={
                  periodoSeleccionado === undefined
                    ? ''
                    : String(periodoSeleccionado)
                }
                onChange={(evento) =>
                  setPeriodoId(
                    evento.target.value
                      ? Number(evento.target.value)
                      : undefined,
                  )
                }
                disabled={periodos.isLoading}
              >
                {periodoSeleccionado === undefined ? (
                  <option value="">
                    {periodos.isLoading
                      ? 'Cargando trimestres…'
                      : 'Sin trimestres registrados'}
                  </option>
                ) : null}
                {periodosOrdenados.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {etiquetaPeriodo(periodo)}
                  </option>
                ))}
              </Select>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {periodoSeleccionado === undefined ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-base text-muted-foreground">
              No hay trimestres registrados para comparar la asistencia
              mensual.
            </p>
          ) : comparacion.isLoading ? (
            <Skeleton className="h-[340px] w-full rounded-lg sm:h-[380px] lg:h-[420px]" />
          ) : comparacion.isError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              <span>
                No se pudo cargar la comparación mensual.{' '}
                {mensajeDeError(comparacion.error)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void comparacion.refetch()}
                disabled={comparacion.isFetching}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <Suspense
              fallback={
                <Skeleton className="h-[340px] w-full rounded-lg sm:h-[380px] lg:h-[420px]" />
              }
            >
              <ComparacionMensualChart datos={serieMensual} />
            </Suspense>
          )}
        </CardContent>
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
