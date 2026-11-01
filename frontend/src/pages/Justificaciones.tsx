import { useMemo, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Check,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock3,
  ListFilter,
  LoaderCircle,
  RefreshCw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDirectorioEstudiantes } from '@/hooks/use-directorio-estudiantes'
import { useDirectorioTutores } from '@/hooks/use-directorio-tutores'
import { etiquetaCortaCurso } from '@/lib/cursos'
import { datosEstudiante } from '@/lib/directorio'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaCorta, formatearFechaHora } from '@/lib/fechas'
import { nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import {
  listarJustificaciones,
  resolverJustificacion,
  type EstadoAsistencia,
  type EstadoJustificacion,
  type Justificacion,
} from '@/services/justificaciones'

const TAMANO = 10
const MINIMO_COMENTARIO = 5

type FiltroEstado = EstadoJustificacion | 'todas'

const FILTROS: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobada', etiqueta: 'Aprobadas' },
  { valor: 'rechazada', etiqueta: 'Rechazadas' },
  { valor: 'todas', etiqueta: 'Todas' },
]

const ESTADO_JUSTIFICACION: Record<
  EstadoJustificacion,
  { etiqueta: string; variante: 'warning' | 'success' | 'destructive' }
> = {
  pendiente: { etiqueta: 'Pendiente', variante: 'warning' },
  aprobada: { etiqueta: 'Aprobada', variante: 'success' },
  rechazada: { etiqueta: 'Rechazada', variante: 'destructive' },
}

const ESTADO_ASISTENCIA: Record<
  EstadoAsistencia,
  { etiqueta: string; variante: 'destructive' | 'warning' | 'success' | 'info' }
> = {
  presente: { etiqueta: 'Presente', variante: 'success' },
  tardanza: { etiqueta: 'Tardanza', variante: 'warning' },
  falta: { etiqueta: 'Falta', variante: 'destructive' },
  justificada: { etiqueta: 'Justificada', variante: 'success' },
}

function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

export function Justificaciones() {
  const [estado, setEstado] = useState<FiltroEstado>('pendiente')
  const [pagina, setPagina] = useState(0)
  const [justificacionARechazar, setJustificacionARechazar] =
    useState<Justificacion | null>(null)
  const [comentario, setComentario] = useState('')
  const [errorComentario, setErrorComentario] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const estudiantes = useDirectorioEstudiantes()
  const tutores = useDirectorioTutores()

  const consulta = useQuery({
    queryKey: ['justificaciones', { estado, pagina, tamano: TAMANO }],
    queryFn: ({ signal }) =>
      listarJustificaciones(
        {
          estado: estado === 'todas' ? undefined : estado,
          skip: pagina * TAMANO,
          limit: TAMANO,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  })

  const justificaciones = consulta.data?.data ?? []
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const sinDatos = justificaciones.length === 0 && !cargando && !consulta.isError

  function refrescarDatos() {
    void queryClient.invalidateQueries({ queryKey: ['justificaciones'] })
    void queryClient.invalidateQueries({ queryKey: ['alertas'] })
    void queryClient.invalidateQueries({ queryKey: ['reportes'] })
  }

  const aprobar = useMutation({
    mutationFn: (justificacionId: number) =>
      resolverJustificacion(justificacionId, { estado: 'aprobada' }),
    onSuccess: () => {
      toast.success('Justificación aprobada', {
        description:
          'La falta o tardanza quedó justificada y el tutor será notificado.',
      })
      refrescarDatos()
      if (justificaciones.length === 1 && pagina > 0) setPagina(pagina - 1)
    },
    onError: (error) =>
      toast.error('No se pudo aprobar la justificación', {
        description: mensajeDeError(error),
      }),
  })

  const rechazar = useMutation({
    mutationFn: ({
      id,
      motivo,
    }: {
      id: number
      motivo: string
    }) =>
      resolverJustificacion(id, {
        estado: 'rechazada',
        comentario_resolucion: motivo,
      }),
    onSuccess: () => {
      toast.success('Justificación rechazada', {
        description: 'El tutor recibirá el motivo del rechazo.',
      })
      cerrarDialogo()
      refrescarDatos()
      if (justificaciones.length === 1 && pagina > 0) setPagina(pagina - 1)
    },
    onError: (error) =>
      toast.error('No se pudo rechazar la justificación', {
        description: mensajeDeError(error),
      }),
  })

  const tituloVacio = useMemo(() => {
    if (estado === 'pendiente') return 'No hay justificaciones pendientes'
    if (estado === 'aprobada') return 'No hay justificaciones aprobadas'
    if (estado === 'rechazada') return 'No hay justificaciones rechazadas'
    return 'Aún no hay justificaciones registradas'
  }, [estado])

  const etiquetaTotal =
    estado === 'todas'
      ? 'justificaciones'
      : estado === 'pendiente'
        ? 'pendientes'
        : estado === 'aprobada'
          ? 'aprobadas'
          : 'rechazadas'

  function cambiarEstado(valor: FiltroEstado) {
    setEstado(valor)
    setPagina(0)
  }

  function abrirRechazo(justificacion: Justificacion) {
    setJustificacionARechazar(justificacion)
    setComentario('')
    setErrorComentario(null)
  }

  function cerrarDialogo() {
    setJustificacionARechazar(null)
    setComentario('')
    setErrorComentario(null)
  }

  function confirmarRechazo() {
    if (!justificacionARechazar) return
    const limpio = comentario.trim()
    if (limpio.length < MINIMO_COMENTARIO) {
      setErrorComentario(
        `Describe el motivo del rechazo (mínimo ${MINIMO_COMENTARIO} caracteres).`,
      )
      return
    }
    setErrorComentario(null)
    rechazar.mutate({ id: justificacionARechazar.id, motivo: limpio })
  }

  return (
    <DashboardShell seccion="Justificaciones">
      <PageHeader
        titulo="Justificaciones"
        descripcion="Revisa los descargos enviados por los tutores. Al aprobar, la falta o tardanza del día pasa a justificada; al rechazar debes indicar el motivo."
        icono={ClipboardCheck}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {etiquetaTotal}
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

      <Card className="[--card-spacing:--spacing(4)] shadow-sm">
        <div className="flex flex-col gap-3 px-(--card-spacing) lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ListFilter className="size-4" aria-hidden="true" />
              Estado de la justificación
            </span>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filtrar por estado"
            >
              {FILTROS.map((opcion) => (
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

          <p className="max-w-md text-sm text-muted-foreground">
            Las justificaciones se ordenan de la más reciente a la más antigua.
            Aprobar afecta a todas las faltas y tardanzas del estudiante en esa
            fecha.
          </p>
        </div>
      </Card>

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && justificaciones.length > 0 ? (
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
              <TableHead>Clase</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="px-4 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={6}
              cargando={cargando}
              error={
                consulta.isError && justificaciones.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio={tituloVacio}
              descripcionVacio={
                estado === 'pendiente'
                  ? 'Los tutores envían los descargos el mismo día de la falta o tardanza; aparecerán aquí para su revisión.'
                  : 'Cambia el filtro para consultar justificaciones en otro estado.'
              }
              iconoVacio={ClipboardCheck}
            />

            {justificaciones.map((justificacion) => {
              const asistencia = justificacion.asistencia
              const estudiante = datosEstudiante(
                estudiantes.data,
                asistencia?.estudiante_id ?? 0,
              )
              const horario = asistencia?.horario ?? null
              const tutor = tutores.data?.get(justificacion.tutor_id)
              const estiloJustificacion = ESTADO_JUSTIFICACION[justificacion.estado]
              const estiloAsistencia = asistencia
                ? ESTADO_ASISTENCIA[asistencia.estado]
                : null
              const aprobando =
                aprobar.isPending && aprobar.variables === justificacion.id
              const pendiente = justificacion.estado === 'pendiente'

              return (
                <TableRow key={justificacion.id}>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {estudiante.iniciales}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {estudiante.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {estudiante.ci
                            ? `CI ${estudiante.ci}`
                            : 'Sin datos del usuario'}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {horario?.curso ? (
                      <>
                        <p className="font-medium">
                          {etiquetaCortaCurso(horario.curso)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {horario.materia?.nombre ?? 'Sin materia'}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {asistencia ? (
                      <>
                        <p className="text-sm font-medium">
                          {formatearFechaCorta(asistencia.fecha)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {horario
                            ? `${horaCorta(horario.hora_inicio)}–${horaCorta(horario.hora_fin)}`
                            : 'Horario no disponible'}
                        </p>
                        {estiloAsistencia ? (
                          <Badge
                            variant={estiloAsistencia.variante}
                            className="mt-1"
                          >
                            {estiloAsistencia.etiqueta}
                          </Badge>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="max-w-md whitespace-normal">
                    <p className="text-sm">{justificacion.motivo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enviada por{' '}
                      {nombreCompleto(tutor) ||
                        `tutor #${justificacion.tutor_id}`}{' '}
                      · {formatearFechaHora(justificacion.creado_en)}
                    </p>
                  </TableCell>

                  <TableCell>
                    <Badge variant={estiloJustificacion.variante}>
                      {justificacion.estado === 'pendiente' ? (
                        <Clock3 aria-hidden="true" />
                      ) : justificacion.estado === 'aprobada' ? (
                        <CircleCheck aria-hidden="true" />
                      ) : (
                        <CircleX aria-hidden="true" />
                      )}
                      {estiloJustificacion.etiqueta}
                    </Badge>
                    {justificacion.estado !== 'pendiente' &&
                    justificacion.revisado_en ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatearFechaHora(justificacion.revisado_en)}
                      </p>
                    ) : null}
                    {justificacion.comentario_resolucion ? (
                      <p className="mt-1 max-w-56 text-xs whitespace-normal text-muted-foreground">
                        «{justificacion.comentario_resolucion}»
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell className="px-4 text-right">
                    {pendiente ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => aprobar.mutate(justificacion.id)}
                          disabled={aprobar.isPending || rechazar.isPending}
                        >
                          {aprobando ? (
                            <LoaderCircle
                              className="size-4 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Check aria-hidden="true" />
                          )}
                          Aprobar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40"
                          onClick={() => abrirRechazo(justificacion)}
                          disabled={aprobar.isPending || rechazar.isPending}
                        >
                          <X aria-hidden="true" />
                          Rechazar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Resuelta
                      </span>
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
          etiqueta="justificaciones"
          deshabilitado={consulta.isFetching}
        />
      </Card>

      <Dialog
        open={justificacionARechazar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarDialogo()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar justificación</DialogTitle>
            <DialogDescription>
              Indica al tutor por qué no se acepta el descargo. El comentario
              quedará registrado en la resolución.
            </DialogDescription>
          </DialogHeader>

          {justificacionARechazar ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                {datosEstudiante(
                  estudiantes.data,
                  justificacionARechazar.asistencia?.estudiante_id ?? 0,
                ).nombre}
              </p>
              <p className="mt-1 text-muted-foreground">
                {justificacionARechazar.motivo}
              </p>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="comentario-rechazo">Motivo del rechazo</Label>
            <Textarea
              id="comentario-rechazo"
              value={comentario}
              maxLength={1000}
              rows={4}
              onChange={(evento) => {
                setComentario(evento.target.value)
                setErrorComentario(null)
              }}
              placeholder="Ej.: La documentación presentada no respalda el motivo indicado."
              aria-invalid={Boolean(errorComentario)}
              aria-describedby={
                errorComentario ? 'error-comentario-rechazo' : undefined
              }
              className="min-h-24 text-base"
            />
            {errorComentario ? (
              <p
                id="error-comentario-rechazo"
                className="text-sm text-destructive"
                role="alert"
              >
                {errorComentario}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Mínimo {MINIMO_COMENTARIO} caracteres. {comentario.length}/1000
              </p>
            )}
          </div>

          {rechazar.isError ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {mensajeDeError(rechazar.error)}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrarDialogo}
              disabled={rechazar.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmarRechazo}
              disabled={rechazar.isPending}
            >
              {rechazar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <X aria-hidden="true" />
              )}
              Rechazar justificación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
