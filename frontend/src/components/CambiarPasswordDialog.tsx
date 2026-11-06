import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, LoaderCircle } from 'lucide-react'
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
import { cambiarMiPassword } from '@/services/usuarios'

interface CambiarPasswordDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
}

const LARGO_MINIMO = 8

/** Cambio de contraseña del usuario autenticado. */
export function CambiarPasswordDialog({
  abierto,
  onOpenChange,
}: CambiarPasswordDialogProps) {
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null)

  const cambiar = useMutation({
    mutationFn: cambiarMiPassword,
    onSuccess: (respuesta) => {
      toast.success('Contraseña actualizada', {
        description: respuesta.mensaje,
      })
      cerrar()
    },
    onError: (error) => {
      toast.error('No se pudo cambiar la contraseña', {
        description: mensajeDeError(error),
      })
    },
  })

  function limpiar() {
    setPasswordActual('')
    setPasswordNueva('')
    setConfirmacion('')
    setErrorValidacion(null)
    cambiar.reset()
  }

  function cerrar() {
    if (cambiar.isPending) return
    limpiar()
    onOpenChange(false)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrorValidacion(null)

    if (!passwordActual) {
      setErrorValidacion('Ingresa tu contraseña actual.')
      return
    }
    if (passwordNueva.length < LARGO_MINIMO) {
      setErrorValidacion(
        `La contraseña nueva debe tener al menos ${LARGO_MINIMO} caracteres.`,
      )
      return
    }
    if (passwordNueva !== confirmacion) {
      setErrorValidacion('La confirmación no coincide con la contraseña nueva.')
      return
    }

    cambiar.mutate({
      password_actual: passwordActual,
      password_nueva: passwordNueva,
    })
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) cerrar()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Confirma tu contraseña actual y elige una nueva de al menos{' '}
            {LARGO_MINIMO} caracteres.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar}>
          <div className="grid gap-1.5">
            <Label htmlFor="password-actual">Contraseña actual</Label>
            <Input
              id="password-actual"
              name="password-actual"
              type="password"
              autoComplete="current-password"
              value={passwordActual}
              onChange={(evento) => setPasswordActual(evento.target.value)}
              maxLength={72}
              disabled={cambiar.isPending}
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password-nueva">Contraseña nueva</Label>
            <Input
              id="password-nueva"
              name="password-nueva"
              type="password"
              autoComplete="new-password"
              value={passwordNueva}
              onChange={(evento) => setPasswordNueva(evento.target.value)}
              minLength={LARGO_MINIMO}
              maxLength={72}
              disabled={cambiar.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password-confirmacion">Confirmar contraseña</Label>
            <Input
              id="password-confirmacion"
              name="password-confirmacion"
              type="password"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(evento) => setConfirmacion(evento.target.value)}
              minLength={LARGO_MINIMO}
              maxLength={72}
              disabled={cambiar.isPending}
            />
          </div>

          {errorValidacion ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {errorValidacion}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrar}
              disabled={cambiar.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={cambiar.isPending}>
              {cambiar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound aria-hidden="true" />
              )}
              Guardar contraseña
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
