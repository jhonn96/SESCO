import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, LoaderCircle, LogOut } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { etiquetaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { horaActualEnColegio, minutosDeHora } from '@/lib/fechas'
import { programarSalida } from '@/services/asistencia'
import type { Curso } from '@/services/cursos'

interface SalidaEspecialDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  curso: Curso | null
}

/**
 * Registra una salida especial para todo el curso. El motivo se envía a los
 * tutores y la hora debe ser igual o anterior a la actual.
 */
export function SalidaEspecialDialog({
  abierto,
  onOpenChange,
  curso,
}: SalidaEspecialDialogProps) {
  const queryClient = useQueryClient()
  const [hora, setHora] = useState(horaActualEnColegio)
  const [motivo, setMotivo] = useState('')
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const registrar = useMutation({
    mutationFn: (datos: { hora: string; motivo: string }) => {
      if (!curso) throw new Error('Selecciona un curso antes de continuar.')
      return programarSalida({
        cursoId: curso.id,
        horaSalida: datos.hora,
        motivo: datos.motivo,
      })
    },
    onSuccess: (resultado) => {
      if (resultado.estudiantes === 0) {
        toast.info('No había estudiantes con salida pendiente en el curso', {
          description: 'La salida especial no actualizó registros.',
        })
      } else {
        toast.success(
          `Salida especial registrada para ${resultado.estudiantes} ${
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
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo registrar la salida especial', {
        description: mensaje,
      })
    },
  })

  useEffect(() => {
    if (!abierto) return
    setHora(horaActualEnColegio())
    setMotivo('')
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

    const texto = motivo.trim()
    if (!hora) {
      setErrorEnvio('Indica la hora de salida.')
      return
    }
    if (minutosDeHora(hora) > minutosDeHora(horaActualEnColegio())) {
      setErrorEnvio('La hora de salida no puede ser posterior a la actual.')
      return
    }
    if (texto.length < 3) {
      setErrorEnvio('Describe el motivo de la salida especial.')
      return
    }

    registrar.mutate({ hora, motivo: texto })
  }

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
              <CalendarClock className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle>Registrar salida especial</DialogTitle>
            <DialogDescription>
              Se registrará la salida de los estudiantes presentes en{' '}
              <span className="font-medium text-foreground">{nombreCurso}</span>{' '}
              y se notificará a sus tutores con el motivo indicado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="salida-especial-hora">Hora de salida</Label>
            <Input
              id="salida-especial-hora"
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
              No puede ser posterior a la hora actual del colegio.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="salida-especial-motivo">Motivo</Label>
            <Textarea
              id="salida-especial-motivo"
              value={motivo}
              maxLength={200}
              placeholder="Ej. Salida anticipada por actividad extracurricular"
              onChange={(evento) => {
                setMotivo(evento.target.value)
                setErrorEnvio(null)
              }}
              disabled={registrar.isPending}
            />
            <p className="text-xs text-muted-foreground">
              {motivo.trim().length}/200 caracteres
            </p>
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
            <Button type="submit" disabled={registrar.isPending || !curso}>
              {registrar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {registrar.isPending ? 'Registrando…' : 'Registrar salida'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
