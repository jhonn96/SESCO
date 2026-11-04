import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaHora } from '@/lib/fechas'
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import {
  listarAccionesAuditoria,
  listarAuditoria,
  type RegistroAuditoria,
} from '@/services/auditoria'

const TAMANO = 12
const RETRASO_BUSQUEDA = 350

const FEATURES = tableFeatures({ rowPaginationFeature })
const helper = createColumnHelper<typeof FEATURES, RegistroAuditoria>()
const REGISTROS_VACIOS: RegistroAuditoria[] = []

type VarianteBadge =
  | 'success'
  | 'destructive'
  | 'warning'
  | 'info'
  | 'muted'

interface EstiloAccion {
  etiqueta: string
  variante: VarianteBadge
}

/** Etiquetas legibles de las acciones que ya escriben los servicios. */
const ACCIONES: Record<string, EstiloAccion> = {
  LOGIN: { etiqueta: 'Inicio de sesión', variante: 'success' },
  LOGIN_FALLIDO: { etiqueta: 'Login fallido', variante: 'destructive' },
  REGISTRAR_ASISTENCIA: {
    etiqueta: 'Registrar asistencia',
    variante: 'info',
  },
  CERRAR_BLOQUE: { etiqueta: 'Cerrar bloque', variante: 'info' },
  GENERAR_ALERTAS: { etiqueta: 'Generar alertas', variante: 'warning' },
  ATENDER_ALERTA: { etiqueta: 'Atender alerta', variante: 'success' },
  ENVIAR_JUSTIFICACION: {
    etiqueta: 'Enviar justificación',
    variante: 'info',
  },
  RESOLVER_JUSTIFICACION: {
    etiqueta: 'Resolver justificación',
    variante: 'success',
  },
  PUBLICAR_AVISO: { etiqueta: 'Publicar comunicado', variante: 'info' },
  ACTUALIZAR_AVISO: {
    etiqueta: 'Actualizar comunicado',
    variante: 'warning',
  },
  ELIMINAR_AVISO: {
    etiqueta: 'Eliminar comunicado',
    variante: 'destructive',
  },
  CONFIRMAR_AVISO: { etiqueta: 'Confirmar comunicado', variante: 'success' },
  ACTUALIZAR_PARAMETROS: {
    etiqueta: 'Actualizar parámetros',
    variante: 'warning',
  },
}

const ETIQUETAS_ROL: Record<string, string> = {
  director: 'Director',
  profesor: 'Profesor',
  estudiante: 'Estudiante',
  tutor: 'Tutor',
}

function estiloAccion(accion: string): EstiloAccion {
  const conocido = ACCIONES[accion]
  if (conocido) return conocido

  return {
    etiqueta: accion
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^./, (letra) => letra.toUpperCase()),
    variante: 'muted',
  }
}

function etiquetaRol(nombre: string | null | undefined): string {
  if (!nombre) return 'Sin rol'
  return ETIQUETAS_ROL[nombre.toLowerCase()] ?? nombre
}

const columnas = helper.columns([
  helper.display({
    id: 'momento',
    header: 'Fecha / hora',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm tabular-nums">
        {formatearFechaHora(row.original.momento)}
      </span>
    ),
  }),
  helper.display({
    id: 'usuario',
    header: 'Usuario',
    cell: ({ row }) => {
      const usuario = row.original.usuario

      if (!usuario) {
        return (
          <div className="min-w-0">
            <p className="font-medium text-muted-foreground">Sistema</p>
            <p className="text-xs text-muted-foreground">
              Usuario no disponible
            </p>
          </div>
        )
      }

      return (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {inicialesPersona(usuario)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{nombreCompleto(usuario)}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="muted">{etiquetaRol(usuario.rol?.nombre)}</Badge>
              <span className="tabular-nums">CI {usuario.ci}</span>
            </div>
          </div>
        </div>
      )
    },
  }),
  helper.display({
    id: 'accion',
    header: 'Acción',
    cell: ({ row }) => {
      const estilo = estiloAccion(row.original.accion)
      return (
        <div className="space-y-1">
          <Badge variant={estilo.variante}>{estilo.etiqueta}</Badge>
          <p className="font-mono text-[11px] text-muted-foreground">
            {row.original.accion}
          </p>
        </div>
      )
    },
  }),
  helper.display({
    id: 'entidad',
    header: 'Entidad afectada',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium capitalize">{row.original.entidad}</p>
        {row.original.entidad_id ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            ID #{row.original.entidad_id}
          </p>
        ) : null}
      </div>
    ),
  }),
  helper.display({
    id: 'ip',
    header: 'IP',
    cell: ({ row }) => (
      <span className="font-mono text-sm tabular-nums">
        {row.original.ip ?? '—'}
      </span>
    ),
  }),
])

/**
 * Bitácora de auditoría del Director (RNF-02 / RD-02): quién hizo qué, sobre
 * qué entidad, cuándo y desde qué IP. Solo lectura.
 */
export function Auditoria() {
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [accion, setAccion] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(busqueda.trim())
      setPagina(0)
    }, RETRASO_BUSQUEDA)

    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  const consulta = useQuery({
    queryKey: [
      'auditoria',
      'lista',
      { q: busquedaAplicada, accion, desde, hasta, pagina, tamano: TAMANO },
    ],
    queryFn: ({ signal }) =>
      listarAuditoria(
        {
          usuario: busquedaAplicada || undefined,
          accion: accion || undefined,
          desde: desde || undefined,
          hasta: hasta || undefined,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const acciones = useQuery({
    queryKey: ['auditoria', 'acciones'],
    queryFn: ({ signal }) => listarAccionesAuditoria(signal),
    staleTime: 5 * 60_000,
  })

  const registros = consulta.data?.data ?? REGISTROS_VACIOS
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const hayFiltros =
    busquedaAplicada !== '' ||
    accion !== '' ||
    desde !== '' ||
    hasta !== ''
  const sinDatos = registros.length === 0 && !cargando && !consulta.isError

  const tabla = useTable({
    features: FEATURES,
    columns: columnas,
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

  const totalColumnas = columnas.length

  const opcionesAccion = useMemo(
    () => [...new Set(acciones.data ?? [])].sort(),
    [acciones.data],
  )

  function cambiarDesde(valor: string) {
    setDesde(valor)
    if (valor && hasta && valor > hasta) setHasta(valor)
    setPagina(0)
  }

  function cambiarHasta(valor: string) {
    setHasta(valor)
    if (valor && desde && valor < desde) setDesde(valor)
    setPagina(0)
  }

  function limpiarFiltros() {
    setBusqueda('')
    setBusquedaAplicada('')
    setAccion('')
    setDesde('')
    setHasta('')
    setPagina(0)
  }

  return (
    <DashboardShell seccion="Auditoría">
      <PageHeader
        titulo="Seguridad y auditoría"
        descripcion="Bitácora de acciones del sistema: quién las realizó, sobre qué entidad, cuándo y desde qué IP. Los registros son de solo lectura."
        icono={ShieldCheck}
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
              onClick={() => {
                void consulta.refetch()
                void acciones.refetch()
              }}
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
        <div className="grid w-full gap-3 px-(--card-spacing) sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="auditoria-usuario">Buscar usuario</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="auditoria-usuario"
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

          <div className="grid gap-1.5">
            <Label htmlFor="auditoria-accion">Tipo de acción</Label>
            <Select
              id="auditoria-accion"
              value={accion}
              onChange={(evento) => {
                setAccion(evento.target.value)
                setPagina(0)
              }}
              disabled={acciones.isLoading}
            >
              <option value="">
                {acciones.isLoading
                  ? 'Cargando acciones…'
                  : 'Todas las acciones'}
              </option>
              {opcionesAccion.map((valor) => (
                <option key={valor} value={valor}>
                  {estiloAccion(valor).etiqueta} · {valor}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="auditoria-desde">Desde</Label>
            <Input
              id="auditoria-desde"
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(evento) => cambiarDesde(evento.target.value)}
              className="h-10 text-base md:text-base"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="auditoria-hasta">Hasta</Label>
            <Input
              id="auditoria-hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(evento) => cambiarHasta(evento.target.value)}
              className="h-10 text-base md:text-base"
            />
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
        {consulta.isError && registros.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar la bitácora. Se muestran los últimos datos
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
                  ? 'No se encontraron registros'
                  : 'Aún no hay registros de auditoría'
              }
              descripcionVacio={
                hayFiltros
                  ? 'Prueba con otro usuario, acción o rango de fechas.'
                  : 'Las acciones de los usuarios aparecerán aquí a medida que el sistema las registre.'
              }
              iconoVacio={ShieldCheck}
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
    </DashboardShell>
  )
}
