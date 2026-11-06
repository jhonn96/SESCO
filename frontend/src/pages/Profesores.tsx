import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  CalendarClock,
  GraduationCap,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Undo2,
  X,
} from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import { EditarProfesorDialog } from '@/components/EditarProfesorDialog'
import { EstadoUsuarioDialog } from '@/components/EstadoUsuarioDialog'
import { NuevoProfesorDialog } from '@/components/NuevoProfesorDialog'
import { PageHeader } from '@/components/PageHeader'
import { ProfesorHorarioDialog } from '@/components/ProfesorHorarioDialog'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { mensajeDeError } from '@/lib/errores'
import { estadoDeUsuario } from '@/lib/estado-usuario'
import { formatearFecha } from '@/lib/fechas'
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import type { Usuario } from '@/services/auth'
import { listarProfesores, type Profesor } from '@/services/profesores'

const TAMANO = 10
const RETRASO_BUSQUEDA = 350

const FEATURES = tableFeatures({ rowPaginationFeature })
const helper = createColumnHelper<typeof FEATURES, Profesor>()
const PROFESORES_VACIOS: Profesor[] = []

const columnas = (
  onEditar: (profesor: Profesor) => void,
  onVerHorario: (profesor: Profesor) => void,
  onGestionarEstado: (usuario: Usuario) => void,
) =>
  helper.columns([
    helper.display({
      id: 'profesor',
      header: 'Profesor',
      cell: ({ row }) => {
        const profesor = row.original
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {inicialesPersona(profesor.usuario)}
            </span>
            <p className="font-medium">
              {nombreCompleto(profesor.usuario) ||
                `Profesor #${profesor.usuario_id}`}
            </p>
          </div>
        )
      },
    }),
    helper.accessor((profesor) => profesor.usuario?.ci ?? '—', {
      id: 'ci',
      header: 'CI',
      cell: ({ getValue }) => (
        <span className="tabular-nums">{getValue()}</span>
      ),
    }),
    helper.accessor('telefono', {
      header: 'Teléfono',
      cell: ({ getValue }) => (
        <a
          href={`tel:${getValue().replace(/\s+/g, '')}`}
          className="tabular-nums hover:underline"
        >
          {getValue()}
        </a>
      ),
    }),
    helper.accessor('direccion', {
      header: 'Dirección',
      cell: ({ getValue }) => (
        <span
          className="block max-w-[18rem] truncate text-muted-foreground"
          title={getValue()}
        >
          {getValue()}
        </span>
      ),
    }),
    helper.accessor('fecha_ingreso', {
      header: 'Ingreso',
      cell: ({ getValue }) => (
        <span className="tabular-nums">{formatearFecha(getValue())}</span>
      ),
    }),
    helper.display({
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const estado = estadoDeUsuario(row.original.usuario)
        return <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
      },
    }),
    helper.display({
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const nombre =
          nombreCompleto(row.original.usuario) ||
          `Profesor #${row.original.usuario_id}`
        return (
          <div className="flex items-center gap-1">
            {row.original.usuario ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Gestionar estado de ${nombre}`}
                title="Gestionar estado"
                onClick={() => onGestionarEstado(row.original.usuario!)}
              >
                <ShieldAlert aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Ver horario de ${nombre}`}
              title="Ver horario"
              onClick={() => onVerHorario(row.original)}
            >
              <CalendarClock aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Editar a ${nombre}`}
              title="Editar profesor"
              onClick={() => onEditar(row.original)}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </div>
        )
      },
    }),
  ])

export function Profesores() {
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(0)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [profesorAEditar, setProfesorAEditar] = useState<Profesor | null>(null)
  const [profesorConHorario, setProfesorConHorario] =
    useState<Profesor | null>(null)
  const [usuarioAEstado, setUsuarioAEstado] = useState<Usuario | null>(null)

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(busqueda.trim())
      setPagina(0)
    }, RETRASO_BUSQUEDA)

    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  const consulta = useQuery({
    queryKey: [
      'profesores',
      'lista',
      { q: busquedaAplicada, pagina, tamano: TAMANO },
    ],
    queryFn: ({ signal }) =>
      listarProfesores(
        {
          q: busquedaAplicada || undefined,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const profesores = consulta.data?.data ?? PROFESORES_VACIOS
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const hayFiltros = busquedaAplicada !== ''
  const sinDatos = profesores.length === 0 && !cargando && !consulta.isError

  const columnasTabla = useMemo(
    () =>
      columnas(
        (profesor) => setProfesorAEditar(profesor),
        (profesor) => setProfesorConHorario(profesor),
        (usuario) => setUsuarioAEstado(usuario),
      ),
    [],
  )

  const tabla = useTable({
    features: FEATURES,
    columns: columnasTabla,
    data: profesores,
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

  function limpiarFiltros() {
    setBusqueda('')
    setBusquedaAplicada('')
    setPagina(0)
  }

  return (
    <DashboardShell seccion="Profesores">
      <PageHeader
        titulo="Profesores"
        descripcion="Directorio del personal docente. Busca por nombre, CI, teléfono o dirección y registra nuevas cuentas."
        icono={GraduationCap}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'profesor' : 'profesores'}
              </Badge>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => setDialogoAbierto(true)}
            >
              <Plus aria-hidden="true" />
              Nuevo Profesor
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
            <label
              htmlFor="buscar-profesor"
              className="text-sm font-medium text-muted-foreground"
            >
              Buscar profesor
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="buscar-profesor"
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Nombre, apellidos, CI, teléfono…"
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
      </Card>

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && profesores.length > 0 ? (
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
              columnas={totalColumnas}
              cargando={cargando}
              error={
                consulta.isError && profesores.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio={
                hayFiltros
                  ? 'No se encontraron profesores'
                  : 'Aún no hay profesores registrados'
              }
              descripcionVacio={
                hayFiltros
                  ? 'Prueba con otro nombre, CI o teléfono para ampliar la búsqueda.'
                  : 'Usa "Nuevo Profesor" para registrar la primera cuenta docente.'
              }
              iconoVacio={GraduationCap}
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
          etiqueta={total === 1 ? 'profesor' : 'profesores'}
          deshabilitado={consulta.isFetching}
        />
      </Card>

      <NuevoProfesorDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
      />

      {profesorAEditar ? (
        <EditarProfesorDialog
          key={profesorAEditar.usuario_id}
          abierto
          onOpenChange={(abierto) => {
            if (!abierto) setProfesorAEditar(null)
          }}
          profesor={profesorAEditar}
        />
      ) : null}

      {profesorConHorario ? (
        <ProfesorHorarioDialog
          key={profesorConHorario.usuario_id}
          abierto
          onOpenChange={(abierto) => {
            if (!abierto) setProfesorConHorario(null)
          }}
          profesor={profesorConHorario}
        />
      ) : null}

      {usuarioAEstado ? (
        <EstadoUsuarioDialog
          key={usuarioAEstado.id}
          abierto
          onOpenChange={(abierto) => {
            if (!abierto) setUsuarioAEstado(null)
          }}
          usuario={usuarioAEstado}
        />
      ) : null}
    </DashboardShell>
  )
}
