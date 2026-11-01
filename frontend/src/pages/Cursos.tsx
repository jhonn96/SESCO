import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Pencil, Plus, RefreshCw, School, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { AsignarProfesorDialog } from '@/components/AsignarProfesorDialog'
import { ConfirmarEliminacionDialog } from '@/components/ConfirmarEliminacionDialog'
import { DashboardShell } from '@/components/DashboardShell'
import { EditarCursoDialog } from '@/components/EditarCursoDialog'
import { NuevoCursoDialog } from '@/components/NuevoCursoDialog'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { compararCursos, etiquetaCurso, nombreNivel, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { etiquetaPeriodo } from '@/lib/periodos'
import { cn } from '@/lib/utils'
import { eliminarCurso, listarCursos, type Curso } from '@/services/cursos'
import { listarPeriodos, type Periodo } from '@/services/periodos'

const TAMANO = 10

const FEATURES = tableFeatures({})
const helper = createColumnHelper<typeof FEATURES, Curso>()

const VARIANTE_NIVEL: Record<string, 'info' | 'success' | 'warning'> = {
  inicial: 'info',
  primaria: 'success',
  secundaria: 'warning',
}

function etiquetaPeriodoDeCurso(curso: Curso, periodos: Periodo[]): string {
  const periodo = periodos.find((item) => item.id === curso.periodo_id)
  return periodo ? etiquetaPeriodo(periodo) : `Periodo #${curso.periodo_id}`
}

export function Cursos() {
  const queryClient = useQueryClient()
  const [pagina, setPagina] = useState(0)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [cursoAAsignar, setCursoAAsignar] = useState<Curso | null>(null)
  const [cursoAEditar, setCursoAEditar] = useState<Curso | null>(null)
  const [cursoAEliminar, setCursoAEliminar] = useState<Curso | null>(null)

  const consulta = useQuery({
    queryKey: ['cursos', 'lista'],
    queryFn: ({ signal }) => listarCursos(signal),
  })

  const periodos = useQuery({
    queryKey: ['periodos', 'lista'],
    queryFn: ({ signal }) => listarPeriodos(signal),
    staleTime: 30 * 60_000,
  })

  const eliminar = useMutation({
    mutationFn: (curso: Curso) => eliminarCurso(curso.id),
    onSuccess: (_datos, curso) => {
      toast.success('Curso eliminado', {
        description: etiquetaCurso(curso),
      })
      void queryClient.invalidateQueries({ queryKey: ['cursos'] })
      void queryClient.invalidateQueries({ queryKey: ['estudiantes'] })
      void queryClient.invalidateQueries({ queryKey: ['horarios'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      setCursoAEliminar(null)
    },
    onError: (error) => {
      toast.error('No se pudo eliminar el curso', {
        description: mensajeDeError(error),
      })
    },
  })

  const cursosOrdenados = useMemo(
    () =>
      [...(consulta.data ?? [])].sort(compararCursos),
    [consulta.data],
  )

  const columnas = useMemo(
    () =>
      helper.columns([
        helper.accessor('nivel', {
          header: 'Nivel',
          cell: ({ getValue }) => (
            <Badge variant={VARIANTE_NIVEL[getValue()] ?? 'outline'}>
              {nombreNivel(getValue())}
            </Badge>
          ),
        }),
        helper.accessor('grado', {
          header: 'Grado',
          cell: ({ getValue }) => (
            <span className="font-medium tabular-nums">{getValue()}°</span>
          ),
        }),
        helper.accessor('paralelo', {
          header: 'Paralelo',
          cell: ({ getValue }) => (
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-muted/50 font-semibold">
              {getValue().trim()}
            </span>
          ),
        }),
        helper.accessor('turno', {
          header: 'Turno',
          cell: ({ getValue }) => (
            <span className="text-muted-foreground">{nombreTurno(getValue())}</span>
          ),
        }),
        helper.display({
          id: 'periodo',
          header: 'Periodo',
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">
              {etiquetaPeriodoDeCurso(row.original, periodos.data ?? [])}
            </span>
          ),
        }),
        helper.display({
          id: 'acciones',
          header: 'Acciones',
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCursoAAsignar(row.original)}
              >
                <UserPlus aria-hidden="true" />
                Asignar Profesor
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Editar ${etiquetaCurso(row.original)}`}
                title="Editar curso"
                onClick={() => setCursoAEditar(row.original)}
              >
                <Pencil aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                aria-label={`Eliminar ${etiquetaCurso(row.original)}`}
                title="Eliminar curso"
                onClick={() => setCursoAEliminar(row.original)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ),
        }),
      ]),
    [periodos.data],
  )

  const total = cursosOrdenados.length
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const visibles = cursosOrdenados.slice(
    paginaActual * TAMANO,
    (paginaActual + 1) * TAMANO,
  )

  const tabla = useTable({
    features: FEATURES,
    columns: columnas,
    data: visibles,
  })

  const cargando = consulta.isLoading
  const sinDatos = total === 0 && !cargando && !consulta.isError

  return (
    <DashboardShell seccion="Cursos">
      <PageHeader
        titulo="Cursos"
        descripcion="Estructura escolar del colegio. Consulta los cursos registrados en cada periodo lectivo y crea los que falten."
        icono={School}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'curso' : 'cursos'}
              </Badge>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => setDialogoAbierto(true)}
            >
              <Plus aria-hidden="true" />
              Nuevo Curso
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

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && total > 0 ? (
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
              columnas={columnas.length}
              cargando={cargando}
              error={
                consulta.isError && total === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio="Aún no hay cursos registrados"
              descripcionVacio="Usa «Nuevo Curso» para crear el primero de este periodo lectivo."
              iconoVacio={School}
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
          pagina={paginaActual}
          tamano={TAMANO}
          total={total}
          onCambiarPagina={setPagina}
          etiqueta={total === 1 ? 'curso' : 'cursos'}
          deshabilitado={consulta.isFetching}
        />
      </Card>

      <NuevoCursoDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        periodos={periodos.data ?? []}
      />

      <AsignarProfesorDialog
        abierto={cursoAAsignar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setCursoAAsignar(null)
        }}
        curso={cursoAAsignar}
      />

      {cursoAEditar ? (
        <EditarCursoDialog
          key={cursoAEditar.id}
          abierto
          onOpenChange={(abierto) => {
            if (!abierto) setCursoAEditar(null)
          }}
          curso={cursoAEditar}
          periodos={periodos.data ?? []}
        />
      ) : null}

      <ConfirmarEliminacionDialog
        abierto={cursoAEliminar !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !eliminar.isPending) setCursoAEliminar(null)
        }}
        titulo="Eliminar curso"
        textoConfirmar="Eliminar curso"
        pendiente={eliminar.isPending}
        descripcion={
          cursoAEliminar ? (
            <>
              ¿Seguro que quieres eliminar{' '}
              <strong>{etiquetaCurso(cursoAEliminar)}</strong>? Esta acción no
              se puede deshacer. Si el curso tiene estudiantes, horarios o
              profesores asignados, el sistema impedirá la baja.
            </>
          ) : null
        }
        onConfirmar={() => {
          if (cursoAEliminar) eliminar.mutate(cursoAEliminar)
        }}
      />
    </DashboardShell>
  )
}
