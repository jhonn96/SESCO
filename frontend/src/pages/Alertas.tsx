import { useMemo, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  BellRing,
  CheckCheck,
  Clock3,
  GraduationCap,
  ListFilter,
  RefreshCw,
  TrendingDown,
  Trophy,
  UserRound,
  UserX,
} from 'lucide-react'
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDirectorioEstudiantes } from '@/hooks/use-directorio-estudiantes'
import { etiquetaCortaCurso, nombreNivel, nombreTurno } from '@/lib/cursos'
import { datosEstudiante } from '@/lib/directorio'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaCorta, formatearFechaHora } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  atenderAlerta,
  listarAlertas,
  type TipoAlerta,
} from '@/services/alertas'
import {
  obtenerRankingInasistencias,
  type RankingInasistencia,
} from '@/services/reportes'

const TAMANO = 10

type FiltroTipo = 'todas' | TipoAlerta
type FiltroEstado = 'pendientes' | 'todas' | 'atendidas'
type VistaAlertas = 'alertas' | 'ranking'

interface EstiloTipo {
  etiqueta: string
  icono: LucideIcon
  variante: 'destructive' | 'warning' | 'info'
}

const ESTILOS_TIPO: Record<TipoAlerta, EstiloTipo> = {
  faltas: {
    etiqueta: 'Faltas',
    icono: UserX,
    variante: 'destructive',
  },
  tardanzas: {
    etiqueta: 'Tardanzas',
    icono: Clock3,
    variante: 'warning',
  },
  inasistencia: {
    etiqueta: 'Inasistencia',
    icono: TrendingDown,
    variante: 'info',
  },
}

const TIPOS: { valor: FiltroTipo; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todos los tipos' },
  { valor: 'faltas', etiqueta: 'Faltas' },
  { valor: 'tardanzas', etiqueta: 'Tardanzas' },
  { valor: 'inasistencia', etiqueta: 'Inasistencia' },
]

const ESTADOS: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: 'pendientes', etiqueta: 'Pendientes' },
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'atendidas', etiqueta: 'Atendidas' },
]

export function Alertas() {
  const [vista, setVista] = useState<VistaAlertas>('alertas')
  const [tipo, setTipo] = useState<FiltroTipo>('todas')
  const [estado, setEstado] = useState<FiltroEstado>('pendientes')
  const [pagina, setPagina] = useState(0)

  const queryClient = useQueryClient()
  const directorio = useDirectorioEstudiantes()

  const consulta = useQuery({
    queryKey: ['alertas', { tipo, estado, pagina, tamano: TAMANO }],
    queryFn: ({ signal }) =>
      listarAlertas(
        {
          tipo: tipo === 'todas' ? undefined : tipo,
          atendida:
            estado === 'todas' ? undefined : estado === 'atendidas',
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const alertas = consulta.data?.data ?? []
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const sinDatos = alertas.length === 0 && !cargando && !consulta.isError

  const atender = useMutation({
    mutationFn: atenderAlerta,
    onSuccess: (alerta) => {
      toast.success('Alerta marcada como atendida', {
        description: `${ESTILOS_TIPO[alerta.tipo].etiqueta} · Estudiante #${alerta.estudiante_id}`,
      })
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
      if (alertas.length === 1 && pagina > 0) setPagina(pagina - 1)
    },
    onError: (error) =>
      toast.error('No se pudo atender la alerta', {
        description: mensajeDeError(error),
      }),
  })

  const tituloVacio = useMemo(() => {
    if (estado === 'pendientes') return 'No hay alertas pendientes'
    if (estado === 'atendidas') return 'No hay alertas atendidas'
    return 'No hay alertas registradas'
  }, [estado])

  function cambiarTipo(valor: string) {
    setTipo(valor as FiltroTipo)
    setPagina(0)
  }

  function cambiarEstado(valor: FiltroEstado) {
    setEstado(valor)
    setPagina(0)
  }

  return (
    <DashboardShell seccion="Alertas">
      <PageHeader
        titulo="Alertas de asistencia"
        descripcion="Faltas consecutivas, tardanzas reiteradas e inasistencia por curso detectadas automáticamente. Marca cada alerta cuando ya hayas tomado acción."
        icono={BellRing}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {estado === 'pendientes' ? 'pendientes' : 'en total'}
              </Badge>
            ) : null}
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

      <Tabs
        value={vista}
        onValueChange={(valor) => setVista(valor as VistaAlertas)}
      >
        <TabsList>
          <TabsTrigger value="alertas">
            <BellRing aria-hidden="true" />
            Alertas
          </TabsTrigger>
          <TabsTrigger value="ranking">
            <Trophy aria-hidden="true" />
            Ranking de inasistencias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alertas" className="space-y-6">
      <Card className="[--card-spacing:--spacing(4)] shadow-sm">
        <div className="flex flex-col gap-4 px-(--card-spacing) lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ListFilter className="size-4" aria-hidden="true" />
              Estado de la alerta
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
              {ESTADOS.map((opcion) => (
                <Button
                  key={opcion.valor}
                  type="button"
                  size="sm"
                  variant={estado === opcion.valor ? 'default' : 'outline'}
                  aria-pressed={estado === opcion.valor}
                  onClick={() => cambiarEstado(opcion.valor)}
                >
                  {opcion.etiqueta}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid w-full gap-1.5 sm:max-w-56">
            <label
              htmlFor="filtro-tipo-alerta"
              className="text-sm font-medium text-muted-foreground"
            >
              Tipo de alerta
            </label>
            <Select
              id="filtro-tipo-alerta"
              value={tipo}
              onChange={(evento) => cambiarTipo(evento.target.value)}
            >
              {TIPOS.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && alertas.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar la lista. Se muestran los últimos datos
            disponibles.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4">Estudiante</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="min-w-56">Detalle</TableHead>
              <TableHead>Generada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="px-4 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={7}
              cargando={cargando}
              error={consulta.isError && alertas.length === 0 ? mensajeDeError(consulta.error) : null}
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio={tituloVacio}
              descripcionVacio="Las alertas se generan automáticamente a partir de las faltas, tardanzas e inasistencias registradas."
              iconoVacio={BellRing}
            />

            {alertas.map((alerta) => {
              const estilo = ESTILOS_TIPO[alerta.tipo]
              const IconoTipo = estilo.icono
              const estudiante = datosEstudiante(
                directorio.data,
                alerta.estudiante_id,
              )
              const atendiendo =
                atender.isPending && atender.variables === alerta.id

              return (
                <TableRow key={alerta.id}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {estudiante.iniciales}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{estudiante.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {estudiante.ci ? `CI ${estudiante.ci}` : 'Sin datos del usuario'}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {estudiante.curso ? (
                      <>
                        <p className="font-medium">
                          {etiquetaCortaCurso(estudiante.curso)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {nombreNivel(estudiante.curso.nivel)} ·{' '}
                          {nombreTurno(estudiante.curso.turno)}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={estilo.variante}>
                      <IconoTipo aria-hidden="true" />
                      {estilo.etiqueta}
                    </Badge>
                  </TableCell>

                  <TableCell className="min-w-56 max-w-sm whitespace-normal">
                    <p className="text-sm text-muted-foreground">
                      {alerta.detalle ?? 'Sin detalle adicional.'}
                    </p>
                  </TableCell>

                  <TableCell>
                    <p className="text-sm">{formatearFechaHora(alerta.generada_en)}</p>
                    {alerta.dia ? (
                      <p className="text-xs text-muted-foreground">
                        Día escolar · {formatearFechaCorta(alerta.dia)}
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    {alerta.atendida ? (
                      <>
                        <Badge variant="success">
                          <CheckCheck aria-hidden="true" />
                          Atendida
                        </Badge>
                        {alerta.atendida_en ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatearFechaHora(alerta.atendida_en)}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <Badge variant="warning">
                        <Clock3 aria-hidden="true" />
                        Pendiente
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="px-4 text-right">
                    {alerta.atendida ? (
                      <span className="text-sm text-muted-foreground">Sin acciones</span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => atender.mutate(alerta.id)}
                        disabled={atendiendo}
                      >
                        <CheckCheck
                          className={cn('size-4', atendiendo && 'animate-pulse')}
                          aria-hidden="true"
                        />
                        Marcar como atendida
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <TablaPaginacion
          pagina={pagina}
          tamano={TAMANO}
          total={total}
          onCambiarPagina={setPagina}
          etiqueta="alertas"
          deshabilitado={consulta.isFetching}
        />
      </Card>
        </TabsContent>

        <TabsContent value="ranking" className="space-y-6">
          <RankingInasistenciasPanel />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}

function RankingInasistenciasPanel() {
  const consulta = useQuery({
    queryKey: ['reportes', 'ranking-inasistencias'],
    queryFn: ({ signal }) => obtenerRankingInasistencias({}, signal),
    placeholderData: keepPreviousData,
  })

  const filas = consulta.data?.estudiantes ?? []
  const cargando = consulta.isLoading
  const sinDatos = filas.length === 0 && !cargando && !consulta.isError

  return (
    <Card
      className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
      aria-busy={consulta.isFetching}
    >
      <CardHeader className="border-b border-border/70 px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="size-5 text-primary" aria-hidden="true" />
          Ranking de inasistencias
        </CardTitle>
        <CardDescription>
          Estudiantes ordenados de mayor a menor cantidad de faltas en el mes.
          {consulta.data
            ? ` Del ${formatearFechaCorta(consulta.data.desde)} al ${formatearFechaCorta(consulta.data.hasta)}.`
            : ''}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {consulta.data ? (
            <Badge variant="info" className="h-8 px-3 text-sm">
              {consulta.data.total_estudiantes}{' '}
              {consulta.data.total_estudiantes === 1
                ? 'estudiante'
                : 'estudiantes'}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void consulta.refetch()}
            disabled={consulta.isFetching}
          >
            <RefreshCw
              className={cn('size-4', consulta.isFetching && 'animate-spin')}
              aria-hidden="true"
            />
            Actualizar
          </Button>
        </CardAction>
      </CardHeader>

      {consulta.isError && filas.length > 0 ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudo actualizar el ranking. Se muestran los últimos datos
          disponibles.
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-14 px-4">#</TableHead>
            <TableHead>Estudiante</TableHead>
            <TableHead>Curso</TableHead>
            <TableHead>Total de faltas</TableHead>
            <TableHead>Total de tardanzas</TableHead>
            <TableHead className="px-4">Tutor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TablaEstado
            columnas={6}
            cargando={cargando}
            error={
              consulta.isError && filas.length === 0
                ? mensajeDeError(consulta.error)
                : null
            }
            onReintentar={() => void consulta.refetch()}
            vacio={sinDatos}
            tituloVacio="No hay inasistencias en el mes"
            descripcionVacio="Cuando se registren faltas o tardanzas, los estudiantes aparecerán en este ranking."
            iconoVacio={Trophy}
          />

          {filas.map((fila, indice) => (
            <FilaRanking key={fila.usuario_id} fila={fila} posicion={indice + 1} />
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function FilaRanking({
  fila,
  posicion,
}: {
  fila: RankingInasistencia
  posicion: number
}) {
  const iniciales = `${fila.nombres[0] ?? ''}${fila.apellidos[0] ?? ''}`.toUpperCase()

  return (
    <TableRow>
      <TableCell className="px-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
          {posicion}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {iniciales || <UserRound className="size-4" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {fila.nombres} {fila.apellidos}
            </p>
            <p className="text-xs text-muted-foreground">
              {fila.ci ? `CI ${fila.ci}` : 'Sin CI registrado'}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {fila.curso ? (
          <>
            <p className="flex items-center gap-1.5 font-medium">
              <GraduationCap className="size-4 text-primary" aria-hidden="true" />
              {etiquetaCortaCurso(fila.curso)}
            </p>
            <p className="text-xs text-muted-foreground">
              {nombreNivel(fila.curso.nivel)} · {nombreTurno(fila.curso.turno)}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={fila.faltas > 0 ? 'destructive' : 'muted'}>
          <UserX aria-hidden="true" />
          {fila.faltas} {fila.faltas === 1 ? 'falta' : 'faltas'}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={fila.tardanzas > 0 ? 'warning' : 'muted'}>
          <Clock3 aria-hidden="true" />
          {fila.tardanzas} {fila.tardanzas === 1 ? 'tardanza' : 'tardanzas'}
        </Badge>
      </TableCell>
      <TableCell className="px-4">
        {fila.tutor_nombre ? (
          <>
            <p className="font-medium">{fila.tutor_nombre}</p>
            {fila.tutor ? (
              <p className="text-xs text-muted-foreground">
                {fila.tutor.parentesco}
                {fila.tutor.telefono ? ` · ${fila.tutor.telefono}` : ''}
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Sin tutor</span>
        )}
      </TableCell>
    </TableRow>
  )
}
