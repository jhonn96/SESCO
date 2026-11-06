import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  Clock3,
  FileCheck2,
  FileEdit,
  Inbox,
  LoaderCircle,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { JustificarModal } from '@/components/JustificarModal'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaHora, hoyIso } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  listarNotificaciones,
  marcarNotificacionLeida,
  type Notificacion,
} from '@/services/notificaciones'
import {
  listarHistorialHijo,
  obtenerMisHijos,
  type HijoDelTutor,
  type HistorialHijo,
} from '@/services/tutores'

const NOTIFICACIONES_VACIAS: Notificacion[] = []

type VarianteBadge = 'destructive' | 'warning' | 'success' | 'info' | 'muted'

const ESTILO_TIPO: Record<
  string,
  { etiqueta: string; variante: VarianteBadge; icono: LucideIcon }
> = {
  falta: { etiqueta: 'Falta', variante: 'destructive', icono: XCircle },
  tardanza: { etiqueta: 'Tardanza', variante: 'warning', icono: Clock3 },
  justificacion: {
    etiqueta: 'Justificación',
    variante: 'success',
    icono: FileCheck2,
  },
  alerta: { etiqueta: 'Alerta', variante: 'warning', icono: AlertTriangle },
  faltas: { etiqueta: 'Alerta', variante: 'warning', icono: AlertTriangle },
  tardanzas: { etiqueta: 'Alerta', variante: 'warning', icono: AlertTriangle },
  inasistencia: {
    etiqueta: 'Alerta',
    variante: 'warning',
    icono: AlertTriangle,
  },
}

const ETIQUETA_JUSTIFICACION: Record<
  NonNullable<HistorialHijo['justificacion']>['estado'],
  { texto: string; variante: VarianteBadge }
> = {
  pendiente: { texto: 'Justificación en revisión', variante: 'warning' },
  aprobada: { texto: 'Justificación aprobada', variante: 'success' },
  rechazada: { texto: 'Justificación rechazada', variante: 'destructive' },
}

function estiloDe(tipo: string) {
  return (
    ESTILO_TIPO[tipo] ?? {
      etiqueta: 'Notificación',
      variante: 'info' as VarianteBadge,
      icono: Bell,
    }
  )
}

function nombreCompleto(hijo: HijoDelTutor): string {
  return `${hijo.nombres} ${hijo.apellidos}`.trim()
}

/** Bandeja personal de notificaciones del tutor. */
export function TutorNotificaciones() {
  const queryClient = useQueryClient()
  const hoy = hoyIso()
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const [justificando, setJustificando] = useState<{
    registro: HistorialHijo
    hijo: HijoDelTutor
  } | null>(null)

  const consulta = useQuery({
    queryKey: ['tutor', 'notificaciones', { soloNoLeidas }],
    queryFn: ({ signal }) =>
      listarNotificaciones({ soloNoLeidas, limit: 100 }, signal),
    refetchInterval: 30_000,
  })

  const hijosQuery = useQuery({
    queryKey: ['tutor', 'hijos'],
    queryFn: ({ signal }) => obtenerMisHijos(signal),
    staleTime: 60_000,
  })

  const hijos = hijosQuery.data ?? []
  const idsHijos = hijos.map((hijo) => hijo.usuario_id)

  const historialHoy = useQuery({
    queryKey: ['tutor', 'historial-hoy', hoy, idsHijos],
    queryFn: async ({ signal }) => {
      const paginas = await Promise.all(
        hijos.map((hijo) =>
          listarHistorialHijo(
            hijo.usuario_id,
            { desde: hoy, hasta: hoy, limit: 100 },
            signal,
          ),
        ),
      )
      const mapa = new Map<
        number,
        { registro: HistorialHijo; hijo: HijoDelTutor }
      >()
      paginas.forEach((pagina, indice) => {
        const hijo = hijos[indice]
        for (const registro of pagina.data) {
          mapa.set(registro.id, { registro, hijo })
        }
      })
      return mapa
    },
    enabled: hijos.length > 0,
  })

  const marcar = useMutation({
    mutationFn: marcarNotificacionLeida,
    onSuccess: () => {
      toast.success('Notificación marcada como leída')
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'notificaciones'],
      })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'hijos'] })
    },
    onError: (error) =>
      toast.error('No se pudo marcar como leída', {
        description: mensajeDeError(error),
      }),
  })

  const notificaciones = consulta.data?.data ?? NOTIFICACIONES_VACIAS
  const total = consulta.data?.total ?? 0
  const pendientes = soloNoLeidas
    ? total
    : notificaciones.filter((notificacion) => !notificacion.leida_en).length

  return (
    <DashboardShell seccion="Notificaciones">
      <PageHeader
        titulo="Notificaciones"
        descripcion="Consulta los avisos de asistencia y las respuestas a tus justificaciones. Se actualiza automáticamente cada 30 segundos."
        icono={BellRing}
        acciones={
          <>
            {pendientes > 0 ? (
              <Badge variant="destructive" className="h-8 px-3 text-sm">
                <Bell aria-hidden="true" />
                {pendientes} sin leer
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

      <section aria-labelledby="titulo-bandeja" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="titulo-bandeja"
              className="text-xl font-semibold tracking-tight"
            >
              Bandeja de notificaciones
            </h2>
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? 'No hay notificaciones para mostrar.'
                : `${total} ${total === 1 ? 'notificación' : 'notificaciones'}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={soloNoLeidas ? 'default' : 'outline'}
              onClick={() => setSoloNoLeidas(true)}
            >
              Sin leer
            </Button>
            <Button
              type="button"
              size="sm"
              variant={soloNoLeidas ? 'outline' : 'default'}
              onClick={() => setSoloNoLeidas(false)}
            >
              Todas
            </Button>
          </div>
        </div>

        {consulta.isLoading ? (
          <div className="space-y-3" role="status">
            {Array.from({ length: 4 }).map((_, indice) => (
              <Card key={indice} className="shadow-sm">
                <CardContent className="flex items-start gap-3">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
            <span className="sr-only">Cargando notificaciones…</span>
          </div>
        ) : consulta.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
            <CardContent className="flex flex-wrap items-center gap-3">
              <AlertTriangle
                className="size-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-sm text-destructive">
                {mensajeDeError(
                  consulta.error,
                  'No se pudieron cargar las notificaciones.',
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void consulta.refetch()}
                disabled={consulta.isFetching}
              >
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : notificaciones.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold">
                {soloNoLeidas
                  ? 'No tienes notificaciones sin leer'
                  : 'Aún no tienes notificaciones'}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {soloNoLeidas
                  ? 'Todas tus notificaciones están al día.'
                  : 'Aquí aparecerán las faltas, tardanzas y respuestas a tus justificaciones.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {notificaciones.map((notificacion) => {
              const estilo = estiloDe(notificacion.tipo)
              const Icono = estilo.icono
              const leida = notificacion.leida_en !== null
              const marcando =
                marcar.isPending && marcar.variables === notificacion.id
              const info =
                notificacion.asistencia_id !== null
                  ? historialHoy.data?.get(notificacion.asistencia_id)
                  : undefined
              const registro = info?.registro
              const esFaltaOTardanza =
                notificacion.tipo === 'falta' ||
                notificacion.tipo === 'tardanza'
              const justificacion = registro?.justificacion ?? null
              const puedeJustificar = Boolean(
                esFaltaOTardanza &&
                registro &&
                registro.fecha === hoy &&
                (registro.estado === 'falta' ||
                  registro.estado === 'tardanza') &&
                !justificacion,
              )
              const fueraDePlazo = Boolean(
                esFaltaOTardanza &&
                registro &&
                registro.fecha !== hoy &&
                !justificacion,
              )
              const metaJustificacion = justificacion
                ? ETIQUETA_JUSTIFICACION[justificacion.estado]
                : null

              return (
                <li key={notificacion.id}>
                  <Card
                    className={cn(
                      'shadow-sm transition-colors',
                      !leida
                        ? 'border-primary/40 bg-primary/5 ring-primary/20'
                        : 'border-border/70',
                    )}
                  >
                    <CardContent className="flex items-start gap-3">
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-xl',
                          !leida
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icono className="size-5" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={estilo.variante}>
                            {estilo.etiqueta}
                          </Badge>
                          {!leida ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <span className="size-2 rounded-full bg-primary" />
                              Nueva
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Leída
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatearFechaHora(notificacion.creada_en)}
                          </span>
                        </div>

                        <p
                          className={cn(
                            'text-sm text-foreground/90',
                            !leida && 'font-medium text-foreground',
                          )}
                        >
                          {notificacion.mensaje}
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                          {metaJustificacion ? (
                            <Badge variant={metaJustificacion.variante}>
                              {metaJustificacion.texto}
                            </Badge>
                          ) : puedeJustificar && info ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setJustificando({
                                  registro: info.registro,
                                  hijo: info.hijo,
                                })
                              }
                            >
                              <FileEdit aria-hidden="true" />
                              Justificar
                            </Button>
                          ) : fueraDePlazo ? (
                            <span className="text-xs text-muted-foreground">
                              Fuera de plazo
                            </span>
                          ) : null}

                          {leida ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                              <CheckCheck
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              Leída
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => marcar.mutate(notificacion.id)}
                              disabled={marcando}
                            >
                              {marcando ? (
                                <LoaderCircle
                                  className="size-4 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <CheckCheck aria-hidden="true" />
                              )}
                              Marcar como leída
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <JustificarModal
        key={justificando?.registro.id ?? 'sin-asistencia'}
        abierto={justificando !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setJustificando(null)
        }}
        asistencia={justificando?.registro ?? null}
        estudiante={
          justificando ? nombreCompleto(justificando.hijo) : null
        }
      />
    </DashboardShell>
  )
}
