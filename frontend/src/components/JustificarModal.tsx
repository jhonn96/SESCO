import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, LoaderCircle, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaCorta, hoyIso } from '@/lib/fechas'
import { crearJustificacion } from '@/services/justificaciones'

/** Mínimo del backend para el motivo de una justificación. */
const MOTIVO_MIN = 10

/** Registro de asistencia que puede justificarse. */
export interface AsistenciaJustificable {
  id: number
  fecha: string
  materia?: string | null
  hora_inicio?: string | null
  hora_fin?: string | null
}

interface JustificarModalProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  asistencia: AsistenciaJustificable | null
  /** Nombre del estudiante, para contextualizar el descargo. */
  estudiante?: string | null
  onEnviada?: () => void
}

/** Rango horario legible, por ejemplo "08:00–08:45". */
function rangoHorario(inicio?: string | null, fin?: string | null): string | null {
  if (!inicio || !fin) return null
  return `${inicio.slice(0, 5)}–${fin.slice(0, 5)}`
}

/**
 * Diálogo reutilizable para justificar una falta o tardanza del día actual.
 * Envía el descargo y refresca las consultas del panel del tutor.
 */
export function JustificarModal({
  abierto,
  onOpenChange,
  asistencia,
  estudiante,
  onEnviada,
}: JustificarModalProps) {
  const queryClient = useQueryClient()
  const hoy = hoyIso()

  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null)

  function cambiarApertura(abierto: boolean) {
    if (!abierto) {
      setMotivo('')
      setErrorMotivo(null)
    }
    onOpenChange(abierto)
  }

  const justificar = useMutation({
    mutationFn: crearJustificacion,
    onSuccess: () => {
      toast.success('Justificación enviada', {
        description:
          'El colegio revisará tu descargo y te notificará la respuesta.',
      })
      setMotivo('')
      setErrorMotivo(null)
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'historial-completo'],
      })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'historial'] })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'resumen'] })
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'notificaciones'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'historial-hoy'],
      })
      onEnviada?.()
      onOpenChange(false)
    },
    onError: (error) => {
      const mensaje = mensajeDeError(
        error,
        'No se pudo enviar la justificación.',
      )
      setErrorMotivo(mensaje)
      toast.error('No se pudo enviar la justificación', {
        description: mensaje,
      })
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!asistencia) return

    if (asistencia.fecha !== hoy) {
      const mensaje =
        'Solo puedes enviar la justificación el mismo día de la falta o tardanza.'
      setErrorMotivo(mensaje)
      toast.error('No se pudo enviar la justificación', {
        description: mensaje,
      })
      return
    }

    const texto = motivo.trim()
    if (texto.length < MOTIVO_MIN) {
      setErrorMotivo(
        `Describe el motivo con al menos ${MOTIVO_MIN} caracteres.`,
      )
      return
    }

    setErrorMotivo(null)
    justificar.mutate({ asistencia_id: asistencia.id, motivo: texto })
  }

  const detalle = asistencia
    ? [
        estudiante,
        asistencia.materia ?? 'Sin materia',
        formatearFechaCorta(asistencia.fecha),
        rangoHorario(asistencia.hora_inicio, asistencia.hora_fin),
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <Dialog open={abierto} onOpenChange={cambiarApertura}>
      <DialogContent>
        <form className="space-y-4" onSubmit={enviar} noValidate>
          <DialogHeader>
            <DialogTitle>Justificar inasistencia</DialogTitle>
            <DialogDescription>{detalle}</DialogDescription>
          </DialogHeader>

          {asistencia && asistencia.fecha !== hoy ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Solo puedes justificar el mismo día de la falta o tardanza. Este
                registro es del {formatearFechaCorta(asistencia.fecha)}.
              </span>
            </p>
          ) : null}

          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="motivo-justificacion">Motivo</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {motivo.length}/500
              </span>
            </div>
            <Textarea
              id="motivo-justificacion"
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                setErrorMotivo(null)
              }}
              rows={4}
              maxLength={500}
              placeholder="Ej.: Cita médica programada en el Hospital del Niño."
              aria-invalid={Boolean(errorMotivo)}
              aria-describedby={errorMotivo ? 'error-motivo' : 'ayuda-motivo'}
              className="min-h-28"
            />
            {errorMotivo ? (
              <p
                id="error-motivo"
                role="alert"
                className="flex items-start gap-1.5 text-sm text-destructive"
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {errorMotivo}
              </p>
            ) : (
              <p id="ayuda-motivo" className="text-xs text-muted-foreground">
                Mínimo {MOTIVO_MIN} caracteres. Solo puedes justificar el mismo
                día de la falta o tardanza.
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                justificar.isPending ||
                (asistencia !== null && asistencia.fecha !== hoy)
              }
            >
              {justificar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send aria-hidden="true" />
              )}
              Enviar justificación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
