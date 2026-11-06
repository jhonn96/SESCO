import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  LoaderCircle,
  LockOpen,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { estaBloqueado, estadoDeUsuario } from '@/lib/estado-usuario'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaHora } from '@/lib/fechas'
import { nombreCompleto } from '@/lib/personas'
import type { Usuario } from '@/services/auth'
import {
  cambiarEstadoUsuario,
  desbloquearUsuario,
  PASSWORD_TEMPORAL,
  restablecerPasswordUsuario,
} from '@/services/usuarios'

interface EstadoUsuarioDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  usuario: Usuario
}

type AccionEstado =
  | { tipo: 'activar'; activo: boolean }
  | { tipo: 'desbloquear' }

/**
 * Gestión del estado de una cuenta: activar/desactivar y desbloquear.
 * El backend impide desactivar la propia cuenta o al último director activo;
 * esos mensajes se muestran aquí tal cual.
 */
export function EstadoUsuarioDialog({
  abierto,
  onOpenChange,
  usuario,
}: EstadoUsuarioDialogProps) {
  const queryClient = useQueryClient()
  const { usuario: usuarioActual } = useAuth()
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [confirmandoReset, setConfirmandoReset] = useState(false)

  const nombre = nombreCompleto(usuario) || `Usuario #${usuario.id}`
  const estado = estadoDeUsuario(usuario)
  const bloqueado = estaBloqueado(usuario)
  const esPropia = usuarioActual?.id === usuario.id
  const noPuedeDesactivarse = esPropia && usuario.activo

  const cambiar = useMutation({
    mutationFn: (accion: AccionEstado) =>
      accion.tipo === 'desbloquear'
        ? desbloquearUsuario(usuario.id)
        : cambiarEstadoUsuario(usuario.id, { activo: accion.activo }),
    onSuccess: (actualizado, accion) => {
      const desbloqueada = accion.tipo === 'desbloquear'
      const titulo = desbloqueada
        ? 'Cuenta desbloqueada'
        : actualizado.activo
          ? 'Cuenta activada'
          : 'Cuenta desactivada'

      toast.success(titulo, {
        description: desbloqueada
          ? `${nombre} ya puede volver a iniciar sesión.`
          : `${nombre} · ${actualizado.activo ? 'Activo' : 'Inactivo'}`,
      })

      void queryClient.invalidateQueries({ queryKey: ['profesores'] })
      void queryClient.invalidateQueries({ queryKey: ['estudiantes'] })
      void queryClient.invalidateQueries({ queryKey: ['tutores'] })
      void queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo cambiar el estado', { description: mensaje })
    },
  })

  const restablecer = useMutation({
    mutationFn: () => restablecerPasswordUsuario(usuario.id),
    onSuccess: (resultado) => {
      toast.success('Contraseña restablecida', {
        description: `${nombre} · Contraseña temporal: ${resultado.password_temporal}`,
        duration: 10000,
      })
      setConfirmandoReset(false)
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo restablecer la contraseña', {
        description: mensaje,
      })
    },
  })

  const accionPendiente = cambiar.isPending ? cambiar.variables : undefined
  const desactivando = accionPendiente?.tipo === 'activar'
  const desbloqueando = accionPendiente?.tipo === 'desbloquear'
  const ocupado = cambiar.isPending || restablecer.isPending

  function cerrar() {
    setErrorEnvio(null)
    setConfirmandoReset(false)
    cambiar.reset()
    restablecer.reset()
    onOpenChange(false)
  }

  function ejecutar(accion: AccionEstado) {
    setErrorEnvio(null)
    cambiar.mutate(accion)
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor && !ocupado) cerrar()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle>Gestionar cuenta</DialogTitle>
          <DialogDescription>
            {nombre} · CI {usuario.ci}
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Estado actual</span>
            <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
          </div>
          {bloqueado && usuario.bloqueado_hasta ? (
            <p className="text-sm text-muted-foreground">
              Bloqueada hasta{' '}
              <span className="font-medium text-foreground">
                {formatearFechaHora(usuario.bloqueado_hasta)}
              </span>
              .
            </p>
          ) : null}
        </section>

        <section className="grid gap-2">
          <Button
            type="button"
            variant={usuario.activo ? 'destructive' : 'default'}
            onClick={() =>
              ejecutar({ tipo: 'activar', activo: !usuario.activo })
            }
            disabled={ocupado || noPuedeDesactivarse}
          >
            {desactivando ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : usuario.activo ? (
              <UserX aria-hidden="true" />
            ) : (
              <UserCheck aria-hidden="true" />
            )}
            {usuario.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
          </Button>

          {noPuedeDesactivarse ? (
            <p className="text-sm text-destructive" role="alert">
              No puedes desactivar tu propia cuenta.
            </p>
          ) : null}

          {bloqueado ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => ejecutar({ tipo: 'desbloquear' })}
              disabled={ocupado}
            >
              {desbloqueando ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <LockOpen aria-hidden="true" />
              )}
              Desbloquear cuenta
            </Button>
          ) : null}

          {bloqueado ? (
            <p className="text-xs text-muted-foreground">
              Al desbloquear se reinician los intentos fallidos a 0.
            </p>
          ) : null}
        </section>

        <section className="grid gap-2 border-t border-border pt-4">
          {confirmandoReset ? (
            <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3">
              <p className="text-sm text-foreground">
                Se asignará la contraseña temporal{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {PASSWORD_TEMPORAL}
                </code>
                . ¿Deseas continuar?
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmandoReset(false)}
                  disabled={ocupado}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setErrorEnvio(null)
                    restablecer.mutate()
                  }}
                  disabled={ocupado}
                >
                  {restablecer.isPending ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <KeyRound aria-hidden="true" />
                  )}
                  Sí, restablecer
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setErrorEnvio(null)
                setConfirmandoReset(true)
              }}
              disabled={ocupado}
            >
              <KeyRound aria-hidden="true" />
              Restablecer contraseña
            </Button>
          )}
        </section>

        {errorEnvio ? (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {errorEnvio}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={cerrar}
            disabled={ocupado}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
