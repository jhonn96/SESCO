import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Download,
  Inbox,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
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
import { useAuth } from '@/hooks/use-auth'
import { mensajeDeError } from '@/lib/errores'
import { hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import type { EstadoAsistencia } from '@/services/asistencia'
import {
  obtenerMisHijos,
  obtenerTodoElHistorialHijo,
  type CursoHijo,
  type HijoDelTutor,
  type HistorialHijo,
} from '@/services/tutores'

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

const LETRAS: Record<EstadoAsistencia, string> = {
  presente: 'P',
  tardanza: 'T',
  falta: 'F',
  justificada: 'J',
}

const ETIQUETAS: Record<EstadoAsistencia, string> = {
  presente: 'Presente',
  tardanza: 'Tardanza',
  falta: 'Falta',
  justificada: 'Justificada',
}

const ESTILOS: Record<EstadoAsistencia, string> = {
  presente:
    'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  tardanza:
    'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  falta:
    'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  justificada:
    'bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
}

const LEYENDA: { estado: EstadoAsistencia; color: string }[] = [
  { estado: 'presente', color: 'bg-emerald-500' },
  { estado: 'tardanza', color: 'bg-amber-500' },
  { estado: 'falta', color: 'bg-rose-500' },
  { estado: 'justificada', color: 'bg-sky-500' },
]

const PRIORIDAD_ESTADO: Record<EstadoAsistencia, number> = {
  presente: 1,
  tardanza: 2,
  falta: 3,
  justificada: 4,
}

const ABREVIATURAS_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

interface TotalesAsistencia {
  presentes: number
  tardanzas: number
  faltas: number
  justificadas: number
}

interface DiaMatriz {
  fecha: string
  dia: number
  abreviatura: string
}

interface FilaMatriz {
  materia: string
  estados: Record<string, EstadoAsistencia>
  totales: TotalesAsistencia
  registros: number
  porcentaje: number | null
}

function totalesVacios(): TotalesAsistencia {
  return { presentes: 0, tardanzas: 0, faltas: 0, justificadas: 0 }
}

function nombreCompleto(hijo: HijoDelTutor): string {
  return `${hijo.nombres} ${hijo.apellidos}`.trim()
}

function cursoCompleto(curso: CursoHijo | null): string {
  if (!curso) return 'Sin curso asignado'
  const nivel = ETIQUETA_NIVEL[curso.nivel] ?? curso.nivel
  const turno = ETIQUETA_TURNO[curso.turno] ?? curso.turno
  return `${curso.grado}° ${curso.paralelo} · ${nivel} (${turno})`
}

function cursoCorto(curso: CursoHijo | null): string {
  return curso ? `${curso.grado}° ${curso.paralelo}` : 'Sin curso'
}

function mesActual(): string {
  return hoyIso().slice(0, 7)
}

function etiquetaMes(mes: string): string {
  if (!/^\d{4}-\d{2}$/.test(mes)) return mes
  const [anio, numero] = mes.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-BO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(anio, numero - 1, 1, 12))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function diasHabilesDelMes(mes: string): DiaMatriz[] {
  if (!/^\d{4}-\d{2}$/.test(mes)) return []
  const [anio, numero] = mes.split('-').map(Number)
  const totalDias = new Date(anio, numero, 0).getDate()
  const dias: DiaMatriz[] = []

  for (let dia = 1; dia <= totalDias; dia += 1) {
    const fecha = new Date(anio, numero - 1, dia, 12)
    const indice = fecha.getDay()
    if (indice === 0 || indice === 6) continue
    dias.push({
      fecha: `${anio}-${String(numero).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      dia,
      abreviatura: ABREVIATURAS_DIA[indice],
    })
  }

  return dias
}

function contarTotales(registros: HistorialHijo[]): TotalesAsistencia {
  return registros.reduce((conteo, registro) => {
    if (registro.estado === 'presente') conteo.presentes += 1
    else if (registro.estado === 'tardanza') conteo.tardanzas += 1
    else if (registro.estado === 'falta') conteo.faltas += 1
    else if (registro.estado === 'justificada') conteo.justificadas += 1
    return conteo
  }, totalesVacios())
}

function construirFilas(registros: HistorialHijo[]): FilaMatriz[] {
  const mapa = new Map<
    string,
    {
      estados: Record<string, EstadoAsistencia>
      totales: TotalesAsistencia
      registros: number
    }
  >()

  for (const registro of registros) {
    const materia = registro.materia?.trim() || 'Sin materia'
    const fila = mapa.get(materia) ?? {
      estados: {},
      totales: totalesVacios(),
      registros: 0,
    }

    const actual = fila.estados[registro.fecha]
    if (
      !actual ||
      PRIORIDAD_ESTADO[registro.estado] > PRIORIDAD_ESTADO[actual]
    ) {
      fila.estados[registro.fecha] = registro.estado
    }

    fila.registros += 1
    if (registro.estado === 'presente') fila.totales.presentes += 1
    else if (registro.estado === 'tardanza') fila.totales.tardanzas += 1
    else if (registro.estado === 'falta') fila.totales.faltas += 1
    else if (registro.estado === 'justificada') fila.totales.justificadas += 1

    mapa.set(materia, fila)
  }

  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([materia, fila]) => ({
      materia,
      ...fila,
      porcentaje:
        fila.registros > 0
          ? Math.round(
              ((fila.registros - fila.totales.faltas) / fila.registros) * 100,
            )
          : null,
    }))
}

function varianteAsistencia(
  porcentaje: number,
): 'success' | 'warning' | 'destructive' {
  if (porcentaje >= 90) return 'success'
  if (porcentaje >= 75) return 'warning'
  return 'destructive'
}

function nombreArchivo(nombre: string, mes: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `Reporte_Asistencia_${limpio || 'Estudiante'}_${mes}.pdf`
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

interface DatosPdf {
  hijo: HijoDelTutor
  mes: string
  dias: DiaMatriz[]
  filas: FilaMatriz[]
  totales: TotalesAsistencia
  tutor: string
}

async function generarReportePdf({
  hijo,
  mes,
  dias,
  filas,
  totales,
  tutor,
}: DatosPdf): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margen = 12
  const logo = await cargarLogo()

  if (logo) {
    doc.addImage(logo, 'PNG', margen, 9, 11, 10.5)
  }

  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('UNIDAD EDUCATIVA SESCO', 27, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(105, 105, 120)
  doc.text('Sistema de Control de Asistencia Escolar', 27, 20)

  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Reporte Mensual de Asistencia', pageWidth - margen, 15, {
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
  doc.roundedRect(margen, 32, pageWidth - margen * 2, 25, 3, 3, 'F')

  doc.setFontSize(7.5)
  doc.setTextColor(115, 110, 130)
  doc.text('ESTUDIANTE', 16, 38)
  doc.text('CURSO', 115, 38)
  doc.text('PERIODO', 210, 38)
  doc.text('CI', 16, 49)
  doc.text('DÍAS HÁBILES', 115, 49)
  doc.text('MATERIAS', 210, 49)

  doc.setFontSize(9)
  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.text(nombreCompleto(hijo), 16, 44)
  doc.text(cursoCompleto(hijo.curso), 115, 44)
  doc.text(etiquetaMes(mes), 210, 44)
  doc.setFont('helvetica', 'normal')
  doc.text(hijo.ci, 16, 54)
  doc.text(String(dias.length), 115, 54)
  doc.text(String(filas.length), 210, 54)

  doc.setFontSize(7)
  doc.setTextColor(105, 105, 120)
  doc.text(
    'P = Presente   ·   T = Tardanza   ·   F = Falta   ·   J = Justificada',
    margen,
    63,
  )

  const head = [
    [
      'Materia',
      ...dias.map((dia) => `${dia.dia}\n${dia.abreviatura}`),
      'Asist.',
    ],
  ]
  const body = filas.map((fila) => [
    fila.materia,
    ...dias.map((dia) => {
      const estado = fila.estados[dia.fecha]
      return estado ? LETRAS[estado] : ''
    }),
    fila.porcentaje === null ? '—' : `${fila.porcentaje}%`,
  ])

  autoTable(doc, {
    startY: 66,
    head,
    body,
    theme: 'grid',
    margin: { top: 18, right: margen, bottom: 24, left: margen },
    styles: {
      font: 'helvetica',
      fontSize: 6,
      cellPadding: 1.1,
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
      textColor: [45, 45, 55],
      lineColor: [228, 224, 238],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [109, 40, 217],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 5.5,
      cellPadding: 1.2,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 246, 253],
    },
    columnStyles: {
      0: {
        cellWidth: 52,
        halign: 'left',
        fontStyle: 'bold',
        overflow: 'linebreak',
      },
      [dias.length + 1]: {
        cellWidth: 16,
        fontStyle: 'bold',
      },
    },
    didParseCell: (data) => {
      if (
        data.section !== 'body' ||
        data.column.index < 1 ||
        data.column.index > dias.length
      ) {
        return
      }

      const letra = String(data.cell.raw ?? '')
      const colores: Record<
        string,
        { fill: [number, number, number]; text: [number, number, number] }
      > = {
        P: { fill: [209, 250, 229], text: [6, 95, 70] },
        T: { fill: [254, 243, 199], text: [146, 64, 14] },
        F: { fill: [254, 226, 226], text: [153, 27, 27] },
        J: { fill: [224, 242, 254], text: [3, 105, 161] },
      }
      const color = colores[letra]
      if (color) {
        data.cell.styles.fillColor = color.fill
        data.cell.styles.textColor = color.text
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  const finalY =
    (
      doc as jsPDF & {
        lastAutoTable?: { finalY: number }
      }
    ).lastAutoTable?.finalY ?? 80

  let y = finalY + 10
  if (y > pageHeight - 55) {
    doc.addPage()
    y = 20
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(35, 35, 45)
  doc.text('Resumen de asistencia', margen, y)

  y += 6
  const resumen = [
    { etiqueta: 'Presentes', valor: totales.presentes, color: [22, 128, 57] },
    { etiqueta: 'Tardanzas', valor: totales.tardanzas, color: [180, 83, 9] },
    { etiqueta: 'Faltas', valor: totales.faltas, color: [185, 28, 28] },
    {
      etiqueta: 'Justificadas',
      valor: totales.justificadas,
      color: [109, 40, 217],
    },
  ]
  const separacion = 5
  const anchoCaja = (pageWidth - margen * 2 - separacion * 3) / 4

  resumen.forEach((item, indice) => {
    const x = margen + indice * (anchoCaja + separacion)
    doc.setFillColor(248, 247, 252)
    doc.roundedRect(x, y, anchoCaja, 17, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(105, 105, 120)
    doc.text(item.etiqueta, x + anchoCaja / 2, y + 5.5, { align: 'center' })
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

  const firmaY = Math.max(y + 34, pageHeight - 36)
  doc.setDrawColor(150, 145, 165)
  doc.setLineWidth(0.3)
  doc.line(pageWidth - 74, firmaY, pageWidth - margen, firmaY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 105)
  doc.text('Firma del tutor', pageWidth - 43, firmaY + 5, {
    align: 'center',
  })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(45, 45, 55)
  doc.text(tutor, pageWidth - 43, firmaY + 10, { align: 'center' })

  const totalPaginas = doc.getNumberOfPages()
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(140, 140, 155)
    doc.text('SESCO · Unidad Educativa', margen, pageHeight - 8)
    doc.text(
      `Página ${pagina} de ${totalPaginas}`,
      pageWidth - margen,
      pageHeight - 8,
      { align: 'right' },
    )
  }

  doc.save(nombreArchivo(nombreCompleto(hijo), mes))
}

export function TutorReportes() {
  const { usuario } = useAuth()
  const [hijoId, setHijoId] = useState<number | null>(null)
  const [mes, setMes] = useState(mesActual)
  const [generando, setGenerando] = useState(false)

  const hijosQuery = useQuery({
    queryKey: ['tutor', 'hijos'],
    queryFn: ({ signal }) => obtenerMisHijos(signal),
    staleTime: 60_000,
  })

  const hijos = hijosQuery.data ?? []
  const hijoActivo =
    hijos.find((hijo) => hijo.usuario_id === hijoId) ?? hijos[0] ?? null
  const idHijo = hijoActivo?.usuario_id ?? null

  const consulta = useQuery({
    queryKey: ['tutor', 'reportes', { idHijo, mes }],
    queryFn: ({ signal }) =>
      obtenerTodoElHistorialHijo(idHijo as number, { mes }, signal),
    enabled: idHijo !== null && /^\d{4}-\d{2}$/.test(mes),
  })

  const registros = useMemo(
    () =>
      [...(consulta.data ?? [])].sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? '') ||
          a.id - b.id,
      ),
    [consulta.data],
  )

  const dias = useMemo(() => diasHabilesDelMes(mes), [mes])
  const totales = useMemo(() => contarTotales(registros), [registros])
  const filas = useMemo(() => construirFilas(registros), [registros])
  const diasConRegistro = useMemo(
    () => new Set(registros.map((registro) => registro.fecha)).size,
    [registros],
  )

  const sinDatos =
    filas.length === 0 && !consulta.isLoading && !consulta.isError

  function cambiarHijo(valor: string) {
    setHijoId(Number(valor))
  }

  async function descargarPdf() {
    if (!hijoActivo || filas.length === 0) return
    setGenerando(true)
    try {
      await generarReportePdf({
        hijo: hijoActivo,
        mes,
        dias,
        filas,
        totales,
        tutor: usuario
          ? `${usuario.nombres} ${usuario.apellidos}`.trim()
          : 'Tutor',
      })
      toast.success('Reporte PDF generado', {
        description: `Se descargó ${nombreArchivo(nombreCompleto(hijoActivo), mes)}.`,
      })
    } catch (error) {
      toast.error('No se pudo generar el PDF', {
        description: mensajeDeError(error),
      })
    } finally {
      setGenerando(false)
    }
  }

  return (
    <DashboardShell seccion="Reportes">
      <PageHeader
        titulo="Reportes de asistencia"
        descripcion="Consulta la planilla mensual de tu hijo por materia y descarga un reporte PDF horizontal con la matriz de asistencia y el porcentaje por materia."
        icono={BarChart3}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {registros.length}{' '}
                {registros.length === 1 ? 'registro' : 'registros'}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void consulta.refetch()}
              disabled={consulta.isFetching || idHijo === null}
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  consulta.isFetching && 'animate-spin',
                )}
                aria-hidden="true"
              />
              Actualizar
            </Button>
            <Button
              type="button"
              className="h-10"
              onClick={() => void descargarPdf()}
              disabled={generando || filas.length === 0}
            >
              {generando ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download aria-hidden="true" />
              )}
              Descargar PDF
            </Button>
          </>
        }
      />

      <section aria-labelledby="titulo-filtros" className="space-y-3">
        <h2 id="titulo-filtros" className="sr-only">
          Filtros del reporte
        </h2>

        {hijosQuery.isLoading ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </CardContent>
          </Card>
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
        ) : !hijoActivo ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold">
                Aún no tienes estudiantes vinculados
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                El director del colegio debe confirmar tu vínculo de tutoría.
                Cuando lo haga, aquí podrás generar los reportes de asistencia.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="[--card-spacing:--spacing(4)] shadow-sm">
            <div className="flex flex-col gap-4 px-(--card-spacing) lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                >
                  {`${hijoActivo.nombres[0] ?? ''}${hijoActivo.apellidos[0] ?? ''}`.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {hijoActivo.parentesco}
                    {hijoActivo.es_principal ? ' · Apoderado principal' : ''}
                  </p>
                  <p className="truncate text-lg font-semibold tracking-tight">
                    {nombreCompleto(hijoActivo)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {cursoCompleto(hijoActivo.curso)} · CI {hijoActivo.ci}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                {hijos.length > 1 ? (
                  <div className="grid w-full gap-1.5 sm:w-64">
                    <label
                      htmlFor="reporte-hijo"
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Estudiante
                    </label>
                    <Select
                      id="reporte-hijo"
                      value={String(hijoActivo.usuario_id)}
                      onChange={(evento) => cambiarHijo(evento.target.value)}
                    >
                      {hijos.map((hijo) => (
                        <option key={hijo.usuario_id} value={hijo.usuario_id}>
                          {nombreCompleto(hijo)} — {cursoCorto(hijo.curso)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="grid w-full gap-1.5 sm:w-44">
                  <label
                    htmlFor="reporte-mes"
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  >
                    <CalendarRange className="size-4" aria-hidden="true" />
                    Mes
                  </label>
                  <Input
                    id="reporte-mes"
                    type="month"
                    value={mes}
                    onChange={(evento) =>
                      setMes(evento.target.value || mesActual())
                    }
                    className="h-10 text-base md:text-base"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-(--card-spacing)">
              <p className="text-sm text-muted-foreground">
                Planilla de {etiquetaMes(mes)} · {filas.length}{' '}
                {filas.length === 1 ? 'materia' : 'materias'} ·{' '}
                {diasConRegistro}{' '}
                {diasConRegistro === 1
                  ? 'día con registros'
                  : 'días con registros'}
                .
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {LEYENDA.map((item) => (
                  <span
                    key={item.estado}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      className={cn('size-2.5 rounded-full', item.color)}
                      aria-hidden="true"
                    />
                    {LETRAS[item.estado]} = {ETIQUETAS[item.estado]}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        )}
      </section>

      {hijoActivo ? (
        <section aria-labelledby="titulo-resumen" className="space-y-3">
          <h2 id="titulo-resumen" className="sr-only">
            Resumen de asistencia
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ResumenKpi
              etiqueta="Presentes"
              valor={totales.presentes}
              className="text-success"
            />
            <ResumenKpi
              etiqueta="Tardanzas"
              valor={totales.tardanzas}
              className="text-amber-700 dark:text-amber-300"
            />
            <ResumenKpi
              etiqueta="Faltas"
              valor={totales.faltas}
              className="text-destructive"
            />
            <ResumenKpi
              etiqueta="Justificadas"
              valor={totales.justificadas}
              className="text-primary"
            />
          </div>
        </section>
      ) : null}

      {hijoActivo ? (
        <Card
          className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
          aria-busy={consulta.isFetching}
        >
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle>Planilla mensual de asistencia</CardTitle>
            <CardDescription>
              Cada fila es una materia y cada columna un día hábil. La última
              columna muestra el porcentaje de asistencia de la materia.
            </CardDescription>
          </CardHeader>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3 text-sm">
            <span className="font-medium">{etiquetaMes(mes)}</span>
            <span className="text-muted-foreground">
              {filas.length} {filas.length === 1 ? 'materia' : 'materias'} ·{' '}
              {dias.length} {dias.length === 1 ? 'día hábil' : 'días hábiles'}
            </span>
          </div>

          <Table className="min-w-max">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky left-0 z-20 min-w-56 border-r border-border/70 bg-muted/40 px-4">
                  Materia
                </TableHead>
                {dias.map((dia) => (
                  <TableHead
                    key={dia.fecha}
                    scope="col"
                    title={dia.fecha}
                    className="min-w-9 border-r border-border/70 bg-muted/40 px-1 text-center text-xs"
                  >
                    <span className="block">{dia.dia}</span>
                    <span className="block text-[10px] uppercase opacity-70">
                      {dia.abreviatura}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="sticky right-0 z-20 min-w-24 border-l border-border/70 bg-muted/40 px-3 text-center">
                  Asistencia
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TablaEstado
                columnas={dias.length + 2}
                cargando={consulta.isLoading}
                error={
                  consulta.isError && registros.length === 0
                    ? mensajeDeError(consulta.error)
                    : null
                }
                onReintentar={() => void consulta.refetch()}
                vacio={sinDatos}
                tituloVacio="Sin registros en este mes"
                descripcionVacio="Prueba con otro mes para consultar la planilla de asistencia."
                iconoVacio={Inbox}
              />

              {filas.map((fila) => (
                <TableRow key={fila.materia} className="group">
                  <TableCell className="sticky left-0 z-10 min-w-56 border-r border-border/70 bg-card px-4 py-2 font-medium group-hover:bg-muted/50">
                    {fila.materia}
                  </TableCell>
                  {dias.map((dia) => {
                    const estado = fila.estados[dia.fecha]
                    return (
                      <TableCell
                        key={dia.fecha}
                        className="border-r border-border/70 p-1 text-center"
                      >
                        {estado ? (
                          <span
                            title={`${dia.fecha}: ${ETIQUETAS[estado]}`}
                            className={cn(
                              'inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold',
                              ESTILOS[estado],
                            )}
                          >
                            {LETRAS[estado]}
                          </span>
                        ) : (
                          <span className="sr-only">Sin registro</span>
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell className="sticky right-0 z-10 min-w-24 border-l border-border/70 bg-card px-3 text-center group-hover:bg-muted/50">
                    {fila.porcentaje === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant={varianteAsistencia(fila.porcentaje)}>
                        {fila.porcentaje}%
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </DashboardShell>
  )
}

interface ResumenKpiProps {
  etiqueta: string
  valor: number
  className?: string
}

function ResumenKpi({ etiqueta, valor, className }: ResumenKpiProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {etiqueta}
        </p>
        <p className={cn('text-3xl font-semibold tabular-nums', className)}>
          {valor}
        </p>
      </CardContent>
    </Card>
  )
}
