import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  Check,
  Clock3,
  RefreshCw,
  Send,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { ProfesorShell } from '@/components/ProfesorShell'
import { TablaEstado } from '@/components/TablaEstado'
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
import { etiquetaCortaCurso, nombreNivel, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { cn } from '@/lib/utils'
import {
  notificarTutor,
  obtenerRiesgoProfesor,
  type EstudianteRiesgo,
} from '@/services/alertas'

export function ProfesorAlertas() {
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: ['alertas', 'profesor'],
    queryFn: ({ signal }) => obtenerRiesgoProfesor(undefined, signal),
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  })

  const notificar = useMutation({
    mutationFn: notificarTutor,
    onSuccess: (resultado) => {
      toast.success('Tutor notificado', {
        description: `${resultado.tutor_nombre} recibió el aviso en su cola de notificaciones.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['alertas', 'profesor'] })
    },
    onError: (error) =>
      toast.error('No se pudo notificar al tutor', {
        description: mensajeDeError(error),
      }),
  })

  const estudiantes = consulta.data?.estudiantes ?? []
  const cargando = consulta.isLoading
  const sinDatos =
    estudiantes.length === 0 && !cargando && !consulta.isError

  async function actualizar() {
    await queryClient.invalidateQueries({ queryKey: ['alertas', 'profesor'] })
    await consulta.refetch()
  }

  return (
    <ProfesorShell seccion="Alertas de mis cursos">
      <PageHeader
        titulo="Alertas de asistencia"
        descripcion="Estudiantes de tus cursos que alcanzaron 3 días consecutivos con faltas o 5 tardanzas en el mes. Puedes notificar al tutor principal para que se ponga en contacto con el colegio."
        icono={BellRing}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {consulta.data.total_estudiantes}{' '}
                {consulta.data.total_estudiantes === 1
                  ? 'estudiante en riesgo'
                  : 'estudiantes en riesgo'}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void actualizar()}
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

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && estudiantes.length > 0 ? (
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
              <TableHead>Faltas seguidas</TableHead>
              <TableHead>Tardanzas del mes</TableHead>
              <TableHead className="min-w-64">Motivo</TableHead>
              <TableHead>Tutor</TableHead>
              <TableHead className="px-4 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={7}
              cargando={cargando}
              error={
                consulta.isError && estudiantes.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio="No hay estudiantes en riesgo"
              descripcionVacio="Ningún estudiante de tus cursos alcanzó los umbrales de alerta de faltas o tardanzas."
              iconoVacio={BellRing}
            />

            {estudiantes.map((estudiante) => {
              const notificando =
                notificar.isPending &&
                notificar.variables === estudiante.estudiante_id
              return (
                <FilaRiesgo
                  key={estudiante.estudiante_id}
                  estudiante={estudiante}
                  notificando={notificando}
                  onNotificar={() =>
                    notificar.mutate(estudiante.estudiante_id)
                  }
                />
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </ProfesorShell>
  )
}

function FilaRiesgo({
  estudiante,
  notificando,
  onNotificar,
}: {
  estudiante: EstudianteRiesgo
  notificando: boolean
  onNotificar: () => void
}) {
  const iniciales = `${estudiante.nombres[0] ?? ''}${estudiante.apellidos[0] ?? ''}`.toUpperCase()

  return (
    <TableRow>
      <TableCell className="px-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {iniciales || '#'}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {estudiante.nombres} {estudiante.apellidos}
            </p>
            <p className="text-xs text-muted-foreground">
              {estudiante.ci ? `CI ${estudiante.ci}` : 'Sin CI registrado'}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <p className="font-medium">
          {etiquetaCortaCurso(estudiante.curso)}
        </p>
        <p className="text-xs text-muted-foreground">
          {nombreNivel(estudiante.curso.nivel)} ·{' '}
          {nombreTurno(estudiante.curso.turno)}
        </p>
      </TableCell>

      <TableCell>
        <Badge
          variant={
            estudiante.faltas_consecutivas >= estudiante.umbral_faltas
              ? 'destructive'
              : 'muted'
          }
        >
          <UserX aria-hidden="true" />
          {estudiante.faltas_consecutivas}
          <span className="font-normal opacity-70">
            / {estudiante.umbral_faltas}
          </span>
        </Badge>
      </TableCell>

      <TableCell>
        <Badge
          variant={
            estudiante.tardanzas_mes >= estudiante.umbral_tardanzas
              ? 'warning'
              : 'muted'
          }
        >
          <Clock3 aria-hidden="true" />
          {estudiante.tardanzas_mes}
          <span className="font-normal opacity-70">
            / {estudiante.umbral_tardanzas}
          </span>
        </Badge>
      </TableCell>

      <TableCell className="min-w-64 max-w-sm whitespace-normal">
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
          {estudiante.motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      </TableCell>

      <TableCell>
        {estudiante.tutor ? (
          <>
            <p className="font-medium">
              {estudiante.tutor.nombres} {estudiante.tutor.apellidos}
            </p>
            <p className="text-xs text-muted-foreground">
              {estudiante.tutor.parentesco}
              {estudiante.tutor.telefono
                ? ` · ${estudiante.tutor.telefono}`
                : ''}
            </p>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Sin tutor</span>
        )}
      </TableCell>

      <TableCell className="px-4 text-right">
        {estudiante.notificado_hoy ? (
          <Badge variant="success" className="h-8 px-3">
            <Check aria-hidden="true" />
            Notificado
          </Badge>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onNotificar}
            disabled={!estudiante.tutor || notificando}
            title={
              estudiante.tutor
                ? undefined
                : 'El estudiante no tiene un tutor confirmado'
            }
          >
            <Send
              className={cn('size-4', notificando && 'animate-pulse')}
              aria-hidden="true"
            />
            Notificar al Tutor
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
