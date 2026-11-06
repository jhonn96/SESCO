import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  HeartHandshake,
  RefreshCw,
  Search,
  ShieldAlert,
  Undo2,
  UserPlus,
  X,
} from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import { EstadoUsuarioDialog } from '@/components/EstadoUsuarioDialog'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { VincularEstudianteDialog } from '@/components/VincularEstudianteDialog'
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
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import type { Usuario } from '@/services/auth'
import { listarTutores, type Tutor } from '@/services/tutores'

const TAMANO = 10
const RETRASO_BUSQUEDA = 350

const FEATURES = tableFeatures({ rowPaginationFeature })
const helper = createColumnHelper<typeof FEATURES, Tutor>()
const TUTORES_VACIOS: Tutor[] = []

const columnas = (
  onVincular: (tutor: Tutor) => void,
  onGestionarEstado: (usuario: Usuario) => void,
) =>
  helper.columns([
    helper.display({
      id: 'tutor',
      header: 'Tutor',
      cell: ({ row }) => {
        const tutor = row.original
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {inicialesPersona(tutor.usuario)}
            </span>
            <p className="font-medium">
              {nombreCompleto(tutor.usuario) || `Tutor #${tutor.usuario_id}`}
            </p>
          </div>
        )
      },
    }),
    helper.accessor((tutor) => tutor.usuario?.ci ?? '—', {
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
          `Tutor #${row.original.usuario_id}`
        return (
          <div className="flex items-center gap-1">
            {row.original.usuario ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Gestionar estado de ${nombre}`}
                title="Gestionar cuenta"
                onClick={() => onGestionarEstado(row.original.usuario!)}
              >
                <ShieldAlert aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onVincular(row.original)}
            >
              <UserPlus aria-hidden="true" />
              Vincular
            </Button>
          </div>
        )
      },
    }),
  ])

export function Tutores() {
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(0)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [tutorAVincular, setTutorAVincular] = useState<Tutor | null>(null)
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
      'tutores',
      'lista',
      { q: busquedaAplicada, pagina, tamano: TAMANO },
    ],
    queryFn: ({ signal }) =>
      listarTutores(
        {
          q: busquedaAplicada || undefined,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const tutores = consulta.data?.data ?? TUTORES_VACIOS
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const hayFiltros = busquedaAplicada !== ''
  const sinDatos = tutores.length === 0 && !cargando && !consulta.isError

  const columnasTabla = useMemo(
    () =>
      columnas(
        (tutor) => {
          setTutorAVincular(tutor)
          setDialogoAbierto(true)
        },
        (usuario) => setUsuarioAEstado(usuario),
      ),
    [],
  )

  const tabla = useTable({
    features: FEATURES,
    columns: columnasTabla,
    data: tutores,
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
    <DashboardShell seccion="Tutores">
      <PageHeader
        titulo="Tutores"
        descripcion="Directorio de padres, madres y apoderados. Busca por nombre, CI o teléfono y vincula estudiantes a su tutor."
        icono={HeartHandshake}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'tutor' : 'tutores'}
              </Badge>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => {
                setTutorAVincular(null)
                setDialogoAbierto(true)
              }}
            >
              <UserPlus aria-hidden="true" />
              Vincular Estudiante
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
              htmlFor="buscar-tutor"
              className="text-sm font-medium text-muted-foreground"
            >
              Buscar tutor
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="buscar-tutor"
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Nombre, apellidos, CI o teléfono…"
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
        {consulta.isError && tutores.length > 0 ? (
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
                consulta.isError && tutores.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio={
                hayFiltros
                  ? 'No se encontraron tutores'
                  : 'Aún no hay tutores registrados'
              }
              descripcionVacio={
                hayFiltros
                  ? 'Prueba con otro nombre, CI o teléfono para ampliar la búsqueda.'
                  : 'Los tutores se crean al registrar sus cuentas de usuario.'
              }
              iconoVacio={HeartHandshake}
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
          etiqueta={total === 1 ? 'tutor' : 'tutores'}
          deshabilitado={consulta.isFetching}
        />
      </Card>

      <VincularEstudianteDialog
        abierto={dialogoAbierto}
        onOpenChange={(abierto) => {
          setDialogoAbierto(abierto)
          if (!abierto) setTutorAVincular(null)
        }}
        tutorInicial={tutorAVincular}
      />

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
