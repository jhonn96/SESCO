import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  ClipboardList,
  FileCheck2,
  Inbox,
  ListFilter,
  PencilLine,
  QrCode,
  RefreshCw,
  Undo2,
} from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import { JustificarModal } from '@/components/JustificarModal'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { ESTADOS_ASISTENCIA, ORIGENES_ASISTENCIA } from '@/lib/asistencia'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaCorta, formatearHora, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { type EstadoJustificacion } from '@/services/justificaciones'
import {
  listarHistorialHijo,
  obtenerMisHijos,
  type CursoHijo,
  type HijoDelTutor,
  type HistorialHijo,
} from '@/services/tutores'

/** Registros por página en la tabla de historial. */
const TAMANO = 15
/** Meses que se ofrecen en el filtro (incluye el actual). */
const MESES_FILTRO = 12

const FEATURES = tableFeatures({ rowPaginationFeature })
const helper = createColumnHelper<typeof FEATURES, HistorialHijo>()
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

function iniciales(hijo: HijoDelTutor): string {
  return `${hijo.nombres[0] ?? ''}${hijo.apellidos[0] ?? ''}`.toUpperCase()
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

/** Rango horario legible, por ejemplo "08:00–08:45". */
function rangoHorario(inicio: string | null, fin: string | null): string | null {
  if (!inicio || !fin) return null
  return `${inicio.slice(0, 5)}–${fin.slice(0, 5)}`
}

/** Solo las faltas y tardanzas pueden justificarse. */
function esJustificable(registro: HistorialHijo): boolean {
  return registro.estado === 'falta' || registro.estado === 'tardanza'
}

/** Opciones del filtro de mes, de la más reciente a la más antigua. */
function opcionesDeMeses(cantidad = MESES_FILTRO) {
  const ahora = new Date()
  const formato = new Intl.DateTimeFormat('es-BO', {
    month: 'long',
    year: 'numeric',
  })

  return Array.from({ length: cantidad }, (_, indice) => {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - indice, 1)
    const valor = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    const texto = formato.format(fecha)
    return {
      valor,
      etiqueta: texto.charAt(0).toUpperCase() + texto.slice(1),
    }
  })
}

const columnas = (hoy: string, onJustificar: (registro: HistorialHijo) => void) =>
  helper.columns([
    helper.accessor('fecha', {
      header: 'Fecha',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{formatearFechaCorta(row.original.fecha)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {row.original.fecha.slice(0, 4)}
          </p>
        </div>
      ),
    }),
    helper.display({
      id: 'materia',
      header: 'Materia',
      cell: ({ row }) => {
        const registro = row.original
        const rango = rangoHorario(registro.hora_inicio, registro.hora_fin)
        return (
          <div className="min-w-0">
            <p className="max-w-56 truncate font-medium">
              {registro.materia ?? 'Sin materia'}
            </p>
            {rango ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {rango}
              </p>
            ) : null}
          </div>
        )
      },
    }),
    helper.display({
      id: 'ingreso',
      header: 'Hora de ingreso',
      cell: ({ row }) => {
        const registro = row.original
        if (!registro.hora_ingreso) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <div>
            <p className="font-medium tabular-nums">
              {formatearHora(registro.hora_ingreso)}
            </p>
            {registro.minutos_retraso > 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {registro.minutos_retraso} min de retraso
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">A tiempo</p>
            )}
          </div>
        )
      },
    }),
    helper.display({
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const meta = ESTADOS_ASISTENCIA[row.original.estado]
        return <Badge variant={meta.variante}>{meta.etiqueta}</Badge>
      },
    }),
    helper.display({
      id: 'origen',
      header: 'Origen',
      cell: ({ row }) => {
        const origen = ORIGENES_ASISTENCIA[row.original.origen]
        return (
          <Badge variant={origen.variante}>
            {row.original.origen === 'qr' ? (
              <QrCode aria-hidden="true" />
            ) : (
              <PencilLine aria-hidden="true" />
            )}
            {origen.etiqueta}
          </Badge>
        )
      },
    }),
    helper.display({
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const registro = row.original
        const justificacion = registro.justificacion

        if (justificacion) {
          const meta = ETIQUETA_JUSTIFICACION[justificacion.estado]
          return <Badge variant={meta.variante}>{meta.texto}</Badge>
        }

        if (!esJustificable(registro)) {
          return <span className="text-xs text-muted-foreground">—</span>
        }

        if (registro.fecha !== hoy) {
          return (
            <span className="text-xs text-muted-foreground">Fuera de plazo</span>
          )
        }

        return (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onJustificar(registro)}
            aria-label={`Justificar ${registro.materia ?? 'la inasistencia'} del ${formatearFechaCorta(registro.fecha)}`}
          >
            <FileCheck2 aria-hidden="true" />
            Justificar
          </Button>
        )
      },
    }),
  ])

/**
 * Historial completo de asistencia del hijo, con filtros por mes/estado y la
 * justificación de faltas o tardanzas del día actual.
 */
export function TutorAsistencia() {
  const hoy = hoyIso()

  const [hijoId, setHijoId] = useState<number | null>(null)
  const [mes, setMes] = useState('')
  const [estado, setEstado] = useState<'' | HistorialHijo['estado']>('')
  const [pagina, setPagina] = useState(0)
  const [justificando, setJustificando] = useState<HistorialHijo | null>(null)

  const meses = useMemo(() => opcionesDeMeses(), [])

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
    queryKey: [
      'tutor',
      'historial-completo',
      idHijo,
      { mes, estado, pagina },
    ],
    queryFn: ({ signal }) =>
      listarHistorialHijo(
        idHijo as number,
        {
          mes: mes || undefined,
          estado: estado || undefined,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    enabled: idHijo !== null,
    placeholderData: keepPreviousData,
  })

  const registros = consulta.data?.data ?? HISTORIAL_VACIO
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const sinDatos = registros.length === 0 && !cargando && !consulta.isError
  const hayFiltros = mes !== '' || estado !== ''

  const columnasTabla = useMemo(
    () =>
      columnas(hoy, (registro) => {
        setJustificando(registro)
      }),
    [hoy],
  )

  const tabla = useTable({
    features: FEATURES,
    columns: columnasTabla,
    data: registros,
    rowCount: total,
    manualPagination: true,
    state: { pagination: { pageIndex: pagina, pageSize: TAMANO } },
    onPaginationChange: (actualizador) => {
      const anterior = { pageIndex: pagina, pageSize: TAMANO }
      const siguiente =
        typeof actualizador === 'function'
          ? actualizador(anterior)
          : actualizador
      setPagina(Math.max(0, siguiente.pageIndex))
    },
  })

  const totalColumnas = columnasTabla.length

  function cambiarHijo(valor: string) {
    setHijoId(Number(valor))
    setPagina(0)
  }

  function cambiarMes(valor: string) {
    setMes(valor)
    setPagina(0)
  }

  function cambiarEstado(valor: string) {
    setEstado(valor as '' | HistorialHijo['estado'])
    setPagina(0)
  }

  function limpiarFiltros() {
    setMes('')
    setEstado('')
    setPagina(0)
  }

  return (
    <DashboardShell seccion="Asistencia del estudiante">
      <PageHeader
        titulo="Asistencia del estudiante"
        descripcion="Consulta el historial completo de tu hijo, filtra por mes o estado y justifica las faltas o tardanzas del día de hoy."
        icono={ClipboardList}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'registro' : 'registros'}
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
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Estudiante seleccionado                                           */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="titulo-hijo" className="space-y-3">
        <h2 id="titulo-hijo" className="sr-only">
          Estudiante seleccionado
        </h2>

        {hijosQuery.isLoading ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
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
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold">
                Aún no tienes estudiantes vinculados
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                El director del colegio debe confirmar tu vínculo de tutoría.
                Cuando lo haga, aquí verás el historial de asistencia.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                >
                  {iniciales(hijoActivo)}
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
                    {cursoCompleto(hijoActivo.curso)}
                  </p>
                </div>
              </div>

              {hijos.length > 1 ? (
                <div className="grid w-full gap-1.5 sm:max-w-xs">
                  <Label htmlFor="selector-hijo" className="text-sm">
                    Hijo seleccionado
                  </Label>
                  <Select
                    id="selector-hijo"
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
              ) : (
                <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {hijos.length === 1
                    ? 'Tienes un estudiante vinculado'
                    : ''}
                </span>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Filtros                                                           */}
      {/* ---------------------------------------------------------------- */}
      {hijoActivo ? (
        <Card className="[--card-spacing:--spacing(4)] shadow-sm">
          <div className="flex flex-col gap-4 px-(--card-spacing) lg:flex-row lg:items-end lg:justify-between">
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl">
              <div className="grid gap-1.5">
                <label
                  htmlFor="filtro-mes"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
                >
                  <ListFilter className="size-4" aria-hidden="true" />
                  Mes
                </label>
                <Select
                  id="filtro-mes"
                  value={mes}
                  onChange={(evento) => cambiarMes(evento.target.value)}
                >
                  <option value="">Todos los meses</option>
                  {meses.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor="filtro-estado"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Estado
                </label>
                <Select
                  id="filtro-estado"
                  value={estado}
                  onChange={(evento) => cambiarEstado(evento.target.value)}
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(ESTADOS_ASISTENCIA).map(
                    ([valor, meta]) => (
                      <option key={valor} value={valor}>
                        {meta.etiqueta}
                      </option>
                    ),
                  )}
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={limpiarFiltros}
                disabled={!hayFiltros}
              >
                <Undo2 aria-hidden="true" />
                Limpiar filtros
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Tabla de historial                                                */}
      {/* ---------------------------------------------------------------- */}
      {hijoActivo ? (
        <Card
          className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
          aria-busy={consulta.isFetching}
        >
          {consulta.isError && registros.length > 0 ? (
            <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              No se pudo actualizar el historial. Se muestran los últimos datos
              disponibles.
            </p>
          ) : null}

          <Table>
            <TableHeader>
              {tabla.getHeaderGroups().map((grupo) => (
                <TableRow
                  key={grupo.id}
                  className="bg-muted/40 hover:bg-muted/40"
                >
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
                  consulta.isError && registros.length === 0
                    ? mensajeDeError(consulta.error)
                    : null
                }
                onReintentar={() => void consulta.refetch()}
                vacio={sinDatos}
                tituloVacio={
                  hayFiltros
                    ? 'No hay registros con estos filtros'
                    : 'Sin registros de asistencia todavía'
                }
                descripcionVacio={
                  hayFiltros
                    ? 'Prueba con otro mes o estado para ampliar la búsqueda.'
                    : 'La asistencia aparecerá cuando el profesor registre el primer ingreso.'
                }
                iconoVacio={Inbox}
              />

              {tabla.getRowModel().rows.map((fila) => (
                <TableRow key={fila.id}>
                  {fila.getAllCells().map((celda) => (
                    <TableCell key={celda.id} className="px-4">
                      <tabla.FlexRender cell={celda} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablaPaginacion
            pagina={pagina}
            tamano={TAMANO}
            total={total}
            onCambiarPagina={(nueva) => tabla.setPageIndex(nueva)}
            etiqueta={total === 1 ? 'registro' : 'registros'}
            deshabilitado={consulta.isFetching}
          />
        </Card>
      ) : null}

      <JustificarModal
        key={justificando?.id ?? 'sin-asistencia'}
        abierto={justificando !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setJustificando(null)
        }}
        asistencia={justificando}
        estudiante={hijoActivo ? nombreCompleto(hijoActivo) : null}
      />
    </DashboardShell>
  )
}
