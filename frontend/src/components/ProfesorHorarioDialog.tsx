import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Clock3,
  GraduationCap,
  Inbox,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmarEliminacionDialog } from '@/components/ConfirmarEliminacionDialog'
import { EditarHorarioDialog } from '@/components/EditarHorarioDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { etiquetaCortaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import {
  DIAS_SEMANA,
  etiquetaDia,
  type DiaSemana,
} from '@/lib/horarios'
import { nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import { eliminarHorario, type Horario } from '@/services/horarios'
import {
  obtenerHorarioProfesor,
  type Profesor,
} from '@/services/profesores'

interface ProfesorHorarioDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  profesor: Profesor
}

function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

/**
 * Horario semanal de un profesor para el panel del director. Muestra los
 * bloques de lunes a viernes y permite editarlos con el mismo formulario de
 * la vista de Horarios.
 */
export function ProfesorHorarioDialog({
  abierto,
  onOpenChange,
  profesor,
}: ProfesorHorarioDialogProps) {
  const queryClient = useQueryClient()
  const [horarioAEditar, setHorarioAEditar] = useState<Horario | null>(null)
  const [horarioAEliminar, setHorarioAEliminar] = useState<Horario | null>(
    null,
  )

  const nombre =
    nombreCompleto(profesor.usuario) || `Profesor #${profesor.usuario_id}`

  const consulta = useQuery({
    queryKey: ['horarios', 'profesor', profesor.usuario_id],
    queryFn: ({ signal }) => obtenerHorarioProfesor(profesor.usuario_id, signal),
    enabled: abierto,
    staleTime: 60_000,
  })

  const bloques = useMemo(() => consulta.data ?? [], [consulta.data])

  const bloquesPorDia = useMemo(() => {
    const grupos = new Map<DiaSemana, Horario[]>()
    for (const dia of DIAS_SEMANA) grupos.set(dia.valor, [])
    for (const bloque of bloques) {
      grupos.get(bloque.dia_semana)?.push(bloque)
    }
    return grupos
  }, [bloques])

  // Cierres de jornada del curso del bloque que se está editando.
  const diasConCierre = useMemo<DiaSemana[]>(() => {
    if (!horarioAEditar) return []
    return [
      ...new Set(
        bloques
          .filter(
            (bloque) =>
              bloque.curso_id === horarioAEditar.curso_id &&
              bloque.es_ultimo_bloque,
          )
          .map((bloque) => bloque.dia_semana),
      ),
    ]
  }, [bloques, horarioAEditar])

  const eliminar = useMutation({
    mutationFn: (horario: Horario) => eliminarHorario(horario.id),
    onSuccess: (_datos, horario) => {
      toast.success('Bloque eliminado correctamente', {
        description: `${horario.materia?.nombre ?? 'Bloque'} · ${etiquetaDia(
          horario.dia_semana,
        )} ${horaCorta(horario.hora_inicio)}–${horaCorta(horario.hora_fin)}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['horarios'] })
      setHorarioAEliminar(null)
    },
    onError: (error) => {
      toast.error('No se pudo eliminar el bloque de horario', {
        description: mensajeDeError(
          error,
          'El bloque tiene asistencias registradas y no puede eliminarse.',
        ),
      })
    },
  })

  function cerrar() {
    setHorarioAEditar(null)
    setHorarioAEliminar(null)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) cerrar()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Horario de {nombre}</DialogTitle>
          <DialogDescription>
            Bloques semanales de los cursos asignados. Puedes editar o eliminar
            cada bloque sin salir del panel.
          </DialogDescription>
        </DialogHeader>

        {consulta.isLoading ? (
          <div
            className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
          >
            {Array.from({ length: 5 }).map((_, indice) => (
              <div
                key={indice}
                className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ))}
            <span className="sr-only" role="status">
              Cargando horario…
            </span>
          </div>
        ) : consulta.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {mensajeDeError(
                consulta.error,
                'No se pudo cargar el horario del profesor.',
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
              Reintentar
            </Button>
          </div>
        ) : bloques.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">
              Este profesor aún no tiene horario asignado
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Cuando se asignen cursos al docente y se registren sus bloques,
              aparecerán aquí con sus materias y horas.
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DIAS_SEMANA.map((dia) => {
              const bloquesDia = bloquesPorDia.get(dia.valor) ?? []

              return (
                <section
                  key={dia.valor}
                  aria-label={dia.etiqueta}
                  className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">
                      {dia.etiqueta}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {bloquesDia.length}{' '}
                      {bloquesDia.length === 1 ? 'bloque' : 'bloques'}
                    </span>
                  </header>

                  {bloquesDia.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                      Sin clases programadas
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {bloquesDia.map((bloque) => {
                        const curso = bloque.curso
                          ? etiquetaCortaCurso(bloque.curso)
                          : `Curso #${bloque.curso_id}`
                        const materia =
                          bloque.materia?.nombre ??
                          `Materia #${bloque.materia_id}`

                        return (
                          <li
                            key={bloque.id}
                            className="rounded-xl border border-border/60 bg-background/40 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 space-y-1">
                                <p className="text-sm leading-snug font-semibold break-words">
                                  {materia}
                                </p>
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <GraduationCap
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{curso}</span>
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  aria-label={`Editar ${materia} (${dia.etiqueta} ${horaCorta(bloque.hora_inicio)}–${horaCorta(bloque.hora_fin)})`}
                                  title="Editar bloque"
                                  onClick={() => setHorarioAEditar(bloque)}
                                >
                                  <Pencil aria-hidden="true" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Eliminar ${materia} (${dia.etiqueta} ${horaCorta(bloque.hora_inicio)}–${horaCorta(bloque.hora_fin)})`}
                                  title="Eliminar bloque"
                                  onClick={() => setHorarioAEliminar(bloque)}
                                >
                                  <Trash2 aria-hidden="true" />
                                  Eliminar
                                </Button>
                              </div>
                            </div>

                            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                              <Clock3
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              {horaCorta(bloque.hora_inicio)} -{' '}
                              {horaCorta(bloque.hora_fin)}
                              {bloque.es_ultimo_bloque ? (
                                <span className="text-[11px] font-normal">
                                  · Último bloque
                                </span>
                              ) : null}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}

        {horarioAEditar ? (
          <EditarHorarioDialog
            key={horarioAEditar.id}
            abierto
            onOpenChange={(valor) => {
              if (!valor) setHorarioAEditar(null)
            }}
            horario={horarioAEditar}
            curso={horarioAEditar.curso}
            diasConCierre={diasConCierre}
          />
        ) : null}

        <ConfirmarEliminacionDialog
          abierto={horarioAEliminar !== null}
          onOpenChange={(valor) => {
            if (!valor && !eliminar.isPending) setHorarioAEliminar(null)
          }}
          titulo="Eliminar bloque de horario"
          textoConfirmar="Eliminar bloque"
          pendiente={eliminar.isPending}
          descripcion={
            horarioAEliminar ? (
              <>
                ¿Estás seguro de que deseas eliminar este bloque de horario?
                <br />
                <strong>
                  {horarioAEliminar.materia?.nombre ?? 'Bloque de clase'}
                </strong>{' '}
                · {etiquetaDia(horarioAEliminar.dia_semana)}{' '}
                {horaCorta(horarioAEliminar.hora_inicio)}–
                {horaCorta(horarioAEliminar.hora_fin)}.
                <br />
                Si ya tiene asistencias registradas, el sistema no permitirá
                eliminarlo.
              </>
            ) : null
          }
          onConfirmar={() => {
            if (horarioAEliminar) eliminar.mutate(horarioAEliminar)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
