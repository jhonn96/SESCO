import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { RefreshCw, Search, Users, X, Undo2, Plus, Pencil } from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import { EditarEstudianteDialog } from '@/components/EditarEstudianteDialog'
import { NuevoEstudianteDialog } from '@/components/NuevoEstudianteDialog'
import { PageHeader } from '@/components/PageHeader'
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
import {
  compararCursos,
  etiquetaCortaCurso,
  etiquetaCurso,
  nombreNivel,
  nombreTurno,
} from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import { listarCursos } from '@/services/cursos'
import { listarEstudiantes, type Estudiante } from '@/services/estudiantes'

const TAMANO = 10
const RETRASO_BUSQUEDA = 350

const FEATURES = tableFeatures({ rowPaginationFeature })
const helper = createColumnHelper<typeof FEATURES, Estudiante>()
const ESTUDIANTES_VACIOS: Estudiante[] = []

function estadoEstudiante(estudiante: Estudiante) {
  if (!estudiante.usuario) {
    return { etiqueta: 'Sin usuario', variante: 'muted' as const }
  }
  if (!estudiante.usuario.activo) {
    return { etiqueta: 'Inactivo', variante: 'destructive' as const }
  }
  const bloqueo = estudiante.usuario.bloqueado_hasta
  if (bloqueo && new Date(bloqueo).getTime() > Date.now()) {
    return { etiqueta: 'Bloqueado', variante: 'warning' as const }
  }
  return { etiqueta: 'Activo', variante: 'success' as const }
}

const columnas = (onEditar: (estudiante: Estudiante) => void) =>
  helper.columns([
    helper.display({
      id: 'nombre',
      header: 'Nombre',
      cell: ({ row }) => {
        const estudiante = row.original
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {inicialesPersona(estudiante.usuario)}
            </span>
            <p className="font-medium">
              {nombreCompleto(estudiante.usuario) ||
                `Estudiante #${estudiante.usuario_id}`}
            </p>
          </div>
        )
      },
    }),
    helper.accessor((estudiante) => estudiante.usuario?.ci ?? '—', {
      id: 'ci',
      header: 'CI',
      cell: ({ getValue }) => (
        <span className="tabular-nums">{getValue()}</span>
      ),
    }),
    helper.display({
      id: 'curso',
      header: 'Curso',
      cell: ({ row }) => {
        const curso = row.original.curso
        if (!curso) return <span className="text-muted-foreground">—</span>
        return (
          <div>
            <p className="font-medium">{etiquetaCortaCurso(curso)}</p>
            <p className="text-xs text-muted-foreground">
              {nombreNivel(curso.nivel)} · {nombreTurno(curso.turno)}
            </p>
          </div>
        )
      },
    }),
    helper.display({
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const estado = estadoEstudiante(row.original)
        return <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
      },
    }),
    helper.display({
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const nombre =
          nombreCompleto(row.original.usuario) ||
          `Estudiante #${row.original.usuario_id}`
        return (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Editar a ${nombre}`}
            title="Editar estudiante"
            onClick={() => onEditar(row.original)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        )
      },
    }),
  ])

export function Estudiantes() {
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [cursoId, setCursoId] = useState<number | undefined>()
  const [pagina, setPagina] = useState(0)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [estudianteAEditar, setEstudianteAEditar] = useState<Estudiante | null>(
    null,
  )

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(busqueda.trim())
      setPagina(0)
    }, RETRASO_BUSQUEDA)

    return () => window.clearTimeout(temporizador)
  }, [busqueda])

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
      'estudiantes',
      'lista',
      { cursoId, q: busquedaAplicada, pagina, tamano: TAMANO },
    ],
    queryFn: ({ signal }) =>
      listarEstudiantes(
        {
          curso_id: cursoId,
          q: busquedaAplicada || undefined,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const estudiantes = consulta.data?.data ?? ESTUDIANTES_VACIOS
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const hayFiltros = busquedaAplicada !== '' || cursoId !== undefined
  const sinDatos = estudiantes.length === 0 && !cargando && !consulta.isError

  const columnasTabla = useMemo(
    () => columnas((estudiante) => setEstudianteAEditar(estudiante)),
    [],
  )

  const tabla = useTable({
    features: FEATURES,
    columns: columnasTabla,
    data: estudiantes,
    rowCount: total,
    manualPagination: true,
    state: { pagination: { pageIndex: pagina, pageSize: TAMANO } },
    onPaginationChange: (actualizador) => {
      const anterior = { pageIndex: pagina, pageSize: TAMANO }
      const siguiente =
        typeof actualizador === 'function' ? actualizador(anterior) : actualizador
      setPagina(Math.max(0, siguiente.pageIndex))
    },
  })

  function cambiarCurso(valor: string) {
    setCursoId(valor ? Number(valor) : undefined)
    setPagina(0)
  }

  function limpiarFiltros() {
    setBusqueda('')
    setBusquedaAplicada('')
    setCursoId(undefined)
    setPagina(0)
  }

  return (
    <DashboardShell seccion="Estudiantes">
      <PageHeader
        titulo="Estudiantes"
        descripcion="Directorio de estudiantes matriculados en el periodo activo. Busca por nombre o CI y filtra por curso."
        icono={Users}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'estudiante' : 'estudiantes'}
              </Badge>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => setDialogoAbierto(true)}
            >
              <Plus aria-hidden="true" />
              Nuevo Estudiante
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
        <div className="flex flex-col gap-3 px-(--card-spacing) lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-1.5 lg:max-w-md">
            <label htmlFor="buscar-estudiante" className="text-sm font-medium text-muted-foreground">
              Buscar estudiante
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="buscar-estudiante"
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Nombre, apellidos o CI…"
                className="h-10 pr-10 pl-9 text-base md:text-base"
              />
              {busqueda ? (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid w-full gap-1.5 sm:w-64">
              <label htmlFor="filtro-curso" className="text-sm font-medium text-muted-foreground">
                Curso
              </label>
              <Select
                id="filtro-curso"
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
              disabled={!hayFiltros && busqueda === ''}
            >
              <Undo2 aria-hidden="true" />
              Limpiar
            </Button>
          </div>
        </div>
      </Card>

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && estudiantes.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar el listado. Se muestran los últimos datos
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
              columnas={columnasTabla.length}
              cargando={cargando}
              error={
                consulta.isError && estudiantes.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio={
                hayFiltros
                  ? 'No se encontraron estudiantes'
                  : 'Aún no hay estudiantes registrados'
              }
              descripcionVacio={
                hayFiltros
                  ? 'Prueba con otro nombre, CI o curso para ampliar la búsqueda.'
                  : 'Los estudiantes aparecerán aquí cuando se registren en el sistema.'
              }
              iconoVacio={Users}
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
          etiqueta="estudiantes"
          deshabilitado={consulta.isFetching}
        />
      </Card>

      <NuevoEstudianteDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        cursos={cursosOrdenados}
      />

      {estudianteAEditar ? (
        <EditarEstudianteDialog
          key={estudianteAEditar.usuario_id}
          abierto
          onOpenChange={(abierto) => {
            if (!abierto) setEstudianteAEditar(null)
          }}
          estudiante={estudianteAEditar}
          cursos={cursosOrdenados}
        />
      ) : null}
    </DashboardShell>
  )
}
