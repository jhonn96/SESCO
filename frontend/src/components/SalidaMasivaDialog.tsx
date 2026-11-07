import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import { etiquetaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { horaActualEnColegio } from '@/lib/fechas'
import type { Curso } from '@/services/cursos'
import { registrarSalidaMasiva } from '@/services/asistencia'

interface SalidaMasivaDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  curso: Curso | null
  /** Estudiantes con ingreso y sin salida en este momento. */
  presentes: number
}

/**
 * Confirma la salida de todo el curso a una misma hora. El backend solo
 * actualiza a los estudiantes con ingreso registrado y salida pendiente.
 */
export function SalidaMasivaDialog({
  abierto,
  onOpenChange,
  curso,
  presentes,
}: SalidaMasivaDialogProps) {
  const queryClient = useQueryClient()
  const [hora, setHora] = useState(horaActualEnColegio)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const registrar = useMutation({
    mutationFn: () => {
      if (!curso) throw new Error('Selecciona un curso antes de continuar.')
      return registrarSalidaMasiva(curso.id, hora || undefined)
    },
    onSuccess: (resultado) => {
      if (resultado.estudiantes === 0) {
        toast.info('No había estudiantes con salida pendiente en el curso')
      } else {
        toast.success(
          `Salida masiva registrada para ${resultado.estudiantes} ${
            resultado.estudiantes === 1 ? 'estudiante' : 'estudiantes'
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
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['profesor'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo registrar la salida masiva', {
        description: mensaje,
      })
    },
  })

  useEffect(() => {
    if (!abierto) return
    setHora(horaActualEnColegio())
    setErrorEnvio(null)
    registrar.reset()
    // Solo se reinicia al abrir el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  function cerrar() {
    registrar.reset()
    onOpenChange(false)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrorEnvio(null)
    registrar.mutate()
  }

  const horaMostrada = hora || horaActualEnColegio()
  const nombreCurso = curso ? etiquetaCurso(curso) : 'el curso seleccionado'

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor && !registrar.isPending) cerrar()
      }}
    >
      <DialogContent className="max-w-md">
        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <DialogHeader>
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle>Salida de curso completo</DialogTitle>
            <DialogDescription>
              ¿Registrar la salida de todos los presentes en el curso{' '}
              <span className="font-medium text-foreground">
                {nombreCurso}
              </span>{' '}
              a las{' '}
              <span className="font-medium text-foreground tabular-nums">
                {horaMostrada}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {presentes === 0
              ? 'Ahora mismo no hay estudiantes con ingreso y sin salida.'
              : `${presentes} ${
                  presentes === 1 ? 'estudiante' : 'estudiantes'
                } con ingreso y sin salida.`}{' '}
            Se notificará a sus tutores.
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="salida-masiva-hora">Hora de salida</Label>
            <Input
              id="salida-masiva-hora"
              type="time"
              value={hora}
              onChange={(evento) => {
                setHora(evento.target.value)
                setErrorEnvio(null)
              }}
              disabled={registrar.isPending}
              className="h-10 text-base md:text-base"
            />
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
            <Button
              type="submit"
              disabled={registrar.isPending || !curso}
            >
              {registrar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Users aria-hidden="true" />
              )}
              {registrar.isPending
                ? 'Registrando…'
                : 'Registrar salida del curso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
