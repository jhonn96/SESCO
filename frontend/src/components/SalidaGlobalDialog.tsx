import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, LoaderCircle, LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { compararCursos, etiquetaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { horaActualEnColegio, minutosDeHora } from '@/lib/fechas'
import {
  programarSalida,
  type ProgramarSalidaParams,
} from '@/services/asistencia'
import { listarCursos } from '@/services/cursos'

interface SalidaGlobalDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
}

const MOTIVOS = [
  'Simulacro',
  'Actividad Extracurricular',
  'Feriado',
  'Paro',
  'Otro',
] as const

type MotivoTipo = (typeof MOTIVOS)[number] | ''

/**
 * Salida especial masiva: registra la salida de los estudiantes presentes hoy
 * en todos los cursos del colegio o en una selección múltiple.
 */
export function SalidaGlobalDialog({
  abierto,
  onOpenChange,
}: SalidaGlobalDialogProps) {
  const queryClient = useQueryClient()
  const [hora, setHora] = useState(horaActualEnColegio)
  const [motivoTipo, setMotivoTipo] = useState<MotivoTipo>('')
  const [motivoDetalle, setMotivoDetalle] = useState('')
  const [todos, setTodos] = useState(true)
  const [cursosSeleccionados, setCursosSeleccionados] = useState<number[]>([])
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const cursosQuery = useQuery({
    queryKey: ['cursos', 'lista'],
    queryFn: ({ signal }) => listarCursos(signal),
    staleTime: 10 * 60_000,
    enabled: abierto,
  })

  const cursos = useMemo(
    () => [...(cursosQuery.data ?? [])].sort(compararCursos),
    [cursosQuery.data],
  )

  const registrar = useMutation({
    mutationFn: (datos: ProgramarSalidaParams) => programarSalida(datos),
    onSuccess: (resultado) => {
      if (resultado.estudiantes === 0) {
        toast.info('No había estudiantes con salida pendiente', {
          description: 'La salida programada no actualizó registros.',
        })
      } else {
        toast.success(
          `Salida programada para ${resultado.estudiantes} ${
            resultado.estudiantes === 1 ? 'estudiante' : 'estudiantes'
          } de ${resultado.cursos} ${
            resultado.cursos === 1 ? 'curso' : 'cursos'
          }`,
          {
            description:
              `${resultado.salidas_registradas} ${
                resultado.salidas_registradas === 1
                  ? 'registro actualizado'
                  : 'registros actualizados'
              } · ${resultado.notificaciones_encoladas} aviso(s) a tutores`,
          },
        )
      }
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['alertas'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo programar la salida', {
        description: mensaje,
      })
    },
  })

  useEffect(() => {
    if (!abierto) return
    setHora(horaActualEnColegio())
    setMotivoTipo('')
    setMotivoDetalle('')
    setTodos(true)
    setCursosSeleccionados([])
    setErrorEnvio(null)
    registrar.reset()
    // Solo se reinicia al abrir el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  function cerrar() {
    registrar.reset()
    onOpenChange(false)
  }

  function alternarCurso(cursoId: number) {
    setCursosSeleccionados((actuales) =>
      actuales.includes(cursoId)
        ? actuales.filter((id) => id !== cursoId)
        : [...actuales, cursoId],
    )
    setErrorEnvio(null)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrorEnvio(null)

    const motivo =
      motivoTipo === 'Otro' ? motivoDetalle.trim() : motivoTipo.trim()

    if (!hora) {
      setErrorEnvio('Indica la hora de salida.')
      return
    }
    if (minutosDeHora(hora) > minutosDeHora(horaActualEnColegio())) {
      setErrorEnvio('La hora de salida no puede ser posterior a la actual.')
      return
    }
    if (motivo.length < 3) {
      setErrorEnvio(
        motivoTipo === 'Otro'
          ? 'Describe el motivo de la salida.'
          : 'Selecciona un motivo.',
      )
      return
    }
    if (!todos && cursosSeleccionados.length === 0) {
      setErrorEnvio('Selecciona al menos un curso.')
      return
    }

    registrar.mutate({
      todos,
      cursoIds: todos ? undefined : cursosSeleccionados,
      horaSalida: hora,
      motivo,
    })
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor && !registrar.isPending) cerrar()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <DialogHeader>
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarClock className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle>Programar salida</DialogTitle>
            <DialogDescription>
              Se registrará la salida de los estudiantes presentes hoy y se
              notificará a sus tutores con el motivo indicado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="salida-global-hora">Hora de salida</Label>
            <Input
              id="salida-global-hora"
              type="time"
              value={hora}
              onChange={(evento) => {
                setHora(evento.target.value)
                setErrorEnvio(null)
              }}
              disabled={registrar.isPending}
              className="h-10 text-base md:text-base"
            />
            <p className="text-xs text-muted-foreground">
              Por defecto se usa la hora actual y no puede ser posterior a ella.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="salida-global-motivo">Motivo</Label>
            <Select
              id="salida-global-motivo"
              value={motivoTipo}
              onChange={(evento) => {
                setMotivoTipo(evento.target.value as MotivoTipo)
                setErrorEnvio(null)
              }}
              disabled={registrar.isPending}
            >
              <option value="">Selecciona un motivo</option>
              {MOTIVOS.map((motivo) => (
                <option key={motivo} value={motivo}>
                  {motivo}
                </option>
              ))}
            </Select>
          </div>

          {motivoTipo === 'Otro' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="salida-global-motivo-detalle">
                Describe el motivo
              </Label>
              <Input
                id="salida-global-motivo-detalle"
                value={motivoDetalle}
                maxLength={200}
                placeholder="Ej. Corte de agua en el colegio"
                onChange={(evento) => {
                  setMotivoDetalle(evento.target.value)
                  setErrorEnvio(null)
                }}
                disabled={registrar.isPending}
                className="h-10 text-base md:text-base"
              />
              <p className="text-xs text-muted-foreground">
                {motivoDetalle.trim().length}/200 caracteres
              </p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="salida-global-todos"
                checked={todos}
                onChange={(evento) => {
                  setTodos(evento.target.checked)
                  setErrorEnvio(null)
                }}
                disabled={registrar.isPending}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="salida-global-todos">
                  Aplicar a todos los cursos del colegio
                </Label>
                <p className="text-xs text-muted-foreground">
                  Si lo desmarcas, podrás elegir cursos específicos.
                </p>
              </div>
            </div>

            {!todos ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">Cursos</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCursosSeleccionados(cursos.map((curso) => curso.id))
                      }
                      disabled={registrar.isPending || cursos.length === 0}
                    >
                      Todos
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCursosSeleccionados([])}
                      disabled={registrar.isPending || cursosSeleccionados.length === 0}
                    >
                      Limpiar
                    </Button>
                  </div>
                </div>

                {cursosQuery.isLoading ? (
                  <div className="space-y-2" role="status" aria-label="Cargando cursos">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : null}

                {cursosQuery.isError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    No se pudieron cargar los cursos:{' '}
                    {mensajeDeError(cursosQuery.error)}
                  </p>
                ) : null}

                {!cursosQuery.isLoading &&
                !cursosQuery.isError &&
                cursos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay cursos registrados.
                  </p>
                ) : null}

                {cursos.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-1.5">
                    {cursos.map((curso) => (
                      <label
                        key={curso.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={cursosSeleccionados.includes(curso.id)}
                          onChange={() => alternarCurso(curso.id)}
                          disabled={registrar.isPending}
                        />
                        <span className="text-sm">{etiquetaCurso(curso)}</span>
                      </label>
                    ))}
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  {cursosSeleccionados.length}{' '}
                  {cursosSeleccionados.length === 1
                    ? 'curso seleccionado'
                    : 'cursos seleccionados'}
                  .
                </p>
              </div>
            ) : null}
          </div>

          {errorEnvio ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorEnvio}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrar}
              disabled={registrar.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={registrar.isPending}>
              {registrar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {registrar.isPending ? 'Programando…' : 'Programar salida'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
