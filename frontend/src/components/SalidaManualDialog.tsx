import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, LogOut } from 'lucide-react'
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
import { mensajeDeError } from '@/lib/errores'
import {
  formatearHoraEnColegio,
  horaActualEnColegio,
} from '@/lib/fechas'
import { registrarSalidaManual } from '@/services/asistencia'

interface SalidaManualDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  asistenciaId: number | null
  nombreEstudiante: string
}

/**
 * Confirma la hora de salida de un estudiante que ya ingresó y aún no tiene
 * salida registrada. Si se deja la hora vacía, el backend usa la actual.
 */
export function SalidaManualDialog({
  abierto,
  onOpenChange,
  asistenciaId,
  nombreEstudiante,
}: SalidaManualDialogProps) {
  const queryClient = useQueryClient()
  const [hora, setHora] = useState(horaActualEnColegio)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const registrar = useMutation({
    mutationFn: () => {
      if (asistenciaId === null) {
        throw new Error('No hay una asistencia seleccionada.')
      }
      return registrarSalidaManual(asistenciaId, hora || undefined)
    },
    onSuccess: (registro) => {
      const salida = registro.hora_salida
        ? formatearHoraEnColegio(registro.hora_salida)
        : hora
      toast.success('Salida registrada correctamente', {
        description: `${nombreEstudiante} · ${salida}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['profesor'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo registrar la salida', {
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
              <LogOut className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle>Registrar salida</DialogTitle>
            <DialogDescription>
              Confirma la hora con la que se registrará la salida de{' '}
              <span className="font-medium text-foreground">
                {nombreEstudiante}
              </span>
              . Si la dejas vacía, se usará la hora actual del colegio.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="salida-manual-hora">Hora de salida</Label>
            <Input
              id="salida-manual-hora"
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
            <Button type="submit" disabled={registrar.isPending}>
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
