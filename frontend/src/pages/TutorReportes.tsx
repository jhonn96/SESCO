import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
import { ESTADOS_ASISTENCIA } from '@/lib/asistencia'
import { mensajeDeError } from '@/lib/errores'
import { formatearFecha, formatearFechaCorta, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
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

function rangoHorario(inicio: string | null, fin: string | null): string | null {
  if (!inicio || !fin) return null
  return `${inicio.slice(0, 5)}–${fin.slice(0, 5)}`
}

function horaRegistro(registro: HistorialHijo): string {
  return (
    rangoHorario(registro.hora_inicio, registro.hora_fin) ??
    (registro.hora_ingreso ? registro.hora_ingreso.slice(0, 5) : '—')
  )
}

function primerDiaDelMes(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`
}

function nombreArchivo(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `Reporte_Asistencia_${limpio || 'Estudiante'}.pdf`
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
  registros: HistorialHijo[]
  desde: string
  hasta: string
  tutor: string
}

async function generarReportePdf({
  hijo,
  registros,
  desde,
  hasta,
  tutor,
}: DatosPdf): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margen = 14
  const logo = await cargarLogo()

  if (logo) {
    doc.addImage(logo, 'PNG', margen, 10, 12, 11.5)
  }

  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('UNIDAD EDUCATIVA SESCO', 31, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(105, 105, 120)
  doc.text('Sistema de Control de Asistencia Escolar', 31, 21)

  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Reporte de Asistencia', pageWidth - margen, 16, {
    align: 'right',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(105, 105, 120)
  doc.text(`Generado: ${fechaDeGeneracion()}`, pageWidth - margen, 21, {
    align: 'right',
  })

  doc.setDrawColor(224, 218, 240)
  doc.setLineWidth(0.4)
  doc.line(margen, 27, pageWidth - margen, 27)

  doc.setFillColor(248, 247, 252)
  doc.roundedRect(margen, 33, pageWidth - margen * 2, 27, 3, 3, 'F')

  doc.setFontSize(8)
  doc.setTextColor(115, 110, 130)
  doc.text('ESTUDIANTE', 18, 39)
  doc.text('CURSO', 108, 39)
  doc.text('CI', 18, 50)
  doc.text('PERIODO', 108, 50)

  doc.setFontSize(10)
  doc.setTextColor(35, 35, 45)
  doc.setFont('helvetica', 'bold')
  doc.text(nombreCompleto(hijo), 18, 44)
  doc.text(cursoCompleto(hijo.curso), 108, 44)
  doc.text(hijo.ci, 18, 55)
  doc.text(`${formatearFecha(desde)} al ${formatearFecha(hasta)}`, 108, 55)

  const totales = registros.reduce(
    (conteo, registro) => {
      if (registro.estado === 'presente') conteo.presentes += 1
      else if (registro.estado === 'tardanza') conteo.tardanzas += 1
      else if (registro.estado === 'falta') conteo.faltas += 1
      else if (registro.estado === 'justificada') conteo.justificadas += 1
      return conteo
    },
    { presentes: 0, tardanzas: 0, faltas: 0, justificadas: 0 },
  )

  const filas = registros.map((registro) => [
    formatearFechaCorta(registro.fecha),
    registro.materia ?? 'Sin materia',
    horaRegistro(registro),
    ESTADOS_ASISTENCIA[registro.estado].etiqueta,
  ])

  autoTable(doc, {
    startY: 65,
    head: [['Fecha', 'Materia', 'Hora', 'Estado']],
    body: filas,
    theme: 'grid',
    margin: { top: 20, right: margen, bottom: 22, left: margen },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.5,
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
      0: { cellWidth: 34 },
      2: { cellWidth: 32 },
      3: { cellWidth: 32 },
    },
  })

  const finalY =
    (
      doc as jsPDF & {
        lastAutoTable?: { finalY: number }
      }
    ).lastAutoTable?.finalY ?? 70

  let y = finalY + 10
  if (y > pageHeight - 72) {
    doc.addPage()
    y = 24
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
    doc.roundedRect(x, y, anchoCaja, 19, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(105, 105, 120)
    doc.text(item.etiqueta, x + anchoCaja / 2, y + 6, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(
      item.color[0] as number,
      item.color[1] as number,
      item.color[2] as number,
    )
    doc.text(String(item.valor), x + anchoCaja / 2, y + 14, {
      align: 'center',
    })
  })

  const firmaY = Math.max(y + 42, pageHeight - 42)
  doc.setDrawColor(150, 145, 165)
  doc.setLineWidth(0.3)
  doc.line(pageWidth - 82, firmaY, pageWidth - margen, firmaY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(90, 90, 105)
  doc.text('Firma del tutor', pageWidth - 48, firmaY + 5, {
    align: 'center',
  })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(45, 45, 55)
  doc.text(tutor, pageWidth - 48, firmaY + 10, { align: 'center' })

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

  doc.save(nombreArchivo(nombreCompleto(hijo)))
}

export function TutorReportes() {
  const { usuario } = useAuth()
  const [hijoId, setHijoId] = useState<number | null>(null)
  const [desde, setDesde] = useState(primerDiaDelMes)
  const [hasta, setHasta] = useState(hoyIso)
  const [generando, setGenerando] = useState(false)

  const rangoInvalido = desde > hasta

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
    queryKey: ['tutor', 'reportes', { idHijo, desde, hasta }],
    queryFn: ({ signal }) =>
      obtenerTodoElHistorialHijo(
        idHijo as number,
        { desde, hasta },
        signal,
      ),
    enabled: idHijo !== null && !rangoInvalido,
    placeholderData: keepPreviousData,
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

  const totales = useMemo(
    () =>
      registros.reduce(
        (conteo, registro) => {
          if (registro.estado === 'presente') conteo.presentes += 1
          else if (registro.estado === 'tardanza') conteo.tardanzas += 1
          else if (registro.estado === 'falta') conteo.faltas += 1
          else if (registro.estado === 'justificada') conteo.justificadas += 1
          return conteo
        },
        { presentes: 0, tardanzas: 0, faltas: 0, justificadas: 0 },
      ),
    [registros],
  )

  const sinDatos =
    registros.length === 0 && !consulta.isLoading && !consulta.isError
  const totalColumnas = 4

  function cambiarHijo(valor: string) {
    setHijoId(Number(valor))
  }

  async function descargarPdf() {
    if (!hijoActivo || registros.length === 0) return
    setGenerando(true)
    try {
      await generarReportePdf({
        hijo: hijoActivo,
        registros,
        desde,
        hasta,
        tutor: usuario
          ? `${usuario.nombres} ${usuario.apellidos}`.trim()
          : 'Tutor',
      })
      toast.success('Reporte PDF generado', {
        description: `Se descargó ${nombreArchivo(nombreCompleto(hijoActivo))}.`,
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
        descripcion="Consulta el historial de tu hijo por rango de fechas y descarga un reporte PDF con el detalle y el resumen de asistencia."
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
              disabled={
                generando || registros.length === 0 || rangoInvalido
              }
            >
              {generando ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download aria-hidden="true" />
              )}
              Descargar Reporte PDF
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
                    htmlFor="reporte-desde"
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  >
                    <CalendarRange className="size-4" aria-hidden="true" />
                    Desde
                  </label>
                  <Input
                    id="reporte-desde"
                    type="date"
                    value={desde}
                    max={hasta}
                    onChange={(evento) => setDesde(evento.target.value)}
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
                    onChange={(evento) => setHasta(evento.target.value)}
                    className="h-10 text-base md:text-base"
                    aria-invalid={rangoInvalido}
                  />
                </div>
              </div>
            </div>

            <p className="mx-(--card-spacing) text-sm text-muted-foreground">
              {rangoInvalido
                ? 'La fecha inicial no puede ser posterior a la fecha final.'
                : `Registros del ${formatearFecha(desde)} al ${formatearFecha(hasta)}.`}
            </p>
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
            <CardTitle>Historial de asistencia</CardTitle>
            <CardDescription>
              Fecha, materia, hora y estado de cada registro del periodo
              seleccionado.
            </CardDescription>
          </CardHeader>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4">Fecha</TableHead>
                <TableHead className="px-4">Materia</TableHead>
                <TableHead className="px-4">Hora</TableHead>
                <TableHead className="px-4">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TablaEstado
                columnas={totalColumnas}
                cargando={consulta.isLoading}
                error={
                  consulta.isError && registros.length === 0
                    ? mensajeDeError(consulta.error)
                    : null
                }
                onReintentar={() => void consulta.refetch()}
                vacio={sinDatos}
                tituloVacio={
                  rangoInvalido
                    ? 'Rango de fechas inválido'
                    : 'Sin registros en el periodo'
                }
                descripcionVacio={
                  rangoInvalido
                    ? 'La fecha inicial no puede ser posterior a la fecha final.'
                    : 'Prueba con otro rango de fechas para generar el reporte.'
                }
                iconoVacio={Inbox}
              />

              {registros.map((registro) => {
                const meta = ESTADOS_ASISTENCIA[registro.estado]
                return (
                  <TableRow key={registro.id}>
                    <TableCell className="px-4">
                      {formatearFechaCorta(registro.fecha)}
                    </TableCell>
                    <TableCell className="px-4 font-medium">
                      {registro.materia ?? 'Sin materia'}
                    </TableCell>
                    <TableCell className="px-4 tabular-nums">
                      {horaRegistro(registro)}
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge variant={meta.variante}>{meta.etiqueta}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
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
