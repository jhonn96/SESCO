import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LoaderCircle, UserPlus } from 'lucide-react'
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
import { CONTRASENA_POR_DEFECTO } from '@/lib/credenciales'
import { mensajeDeError } from '@/lib/errores'
import { hoyIso } from '@/lib/fechas'
import { nombreCompleto } from '@/lib/personas'
import { IDS_ROL } from '@/lib/roles'
import { crearProfesor } from '@/services/profesores'
import { crearUsuario, eliminarUsuario, verificarCi } from '@/services/usuarios'

interface NuevoProfesorDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
}

interface Formulario {
  nombres: string
  apellidos: string
  ci: string
  telefono: string
  direccion: string
  fechaIngreso: string
}

type Errores = Partial<Record<keyof Formulario, string>>

const FORMULARIO_VACIO: Formulario = {
  nombres: '',
  apellidos: '',
  ci: '',
  telefono: '',
  direccion: '',
  fechaIngreso: '',
}

const PATRON_TELEFONO = /^[0-9+\-\s()]+$/

function validar(formulario: Formulario): Errores {
  const errores: Errores = {}

  if (!formulario.nombres.trim()) {
    errores.nombres = 'Ingresa los nombres.'
  } else if (formulario.nombres.trim().length > 80) {
    errores.nombres = 'Máximo 80 caracteres.'
  }

  if (!formulario.apellidos.trim()) {
    errores.apellidos = 'Ingresa los apellidos.'
  } else if (formulario.apellidos.trim().length > 80) {
    errores.apellidos = 'Máximo 80 caracteres.'
  }

  const ci = formulario.ci.trim()
  if (!ci) {
    errores.ci = 'Ingresa la cédula de identidad.'
  } else if (ci.length > 15) {
    errores.ci = 'La cédula admite hasta 15 caracteres.'
  }

  const telefono = formulario.telefono.trim()
  if (!telefono) {
    errores.telefono = 'Ingresa el teléfono.'
  } else if (telefono.length < 7) {
    errores.telefono = 'El teléfono debe tener al menos 7 caracteres.'
  } else if (telefono.length > 20) {
    errores.telefono = 'El teléfono admite hasta 20 caracteres.'
  } else if (!PATRON_TELEFONO.test(telefono)) {
    errores.telefono = 'Usa solo números, espacios, +, -, ( o ).'
  }

  if (!formulario.direccion.trim()) {
    errores.direccion = 'Ingresa la dirección.'
  } else if (formulario.direccion.trim().length > 150) {
    errores.direccion = 'Máximo 150 caracteres.'
  }

  if (!formulario.fechaIngreso) {
    errores.fechaIngreso = 'Selecciona la fecha de ingreso.'
  } else if (formulario.fechaIngreso > hoyIso()) {
    errores.fechaIngreso = 'La fecha no puede ser futura.'
  }

  return errores
}

/**
 * Alta de un profesor: primero la cuenta (`POST /api/usuarios`) y luego el
 * perfil docente (`POST /api/profesores`). Al terminar se muestran las
 * credenciales para que el Director se las entregue.
 */
export function NuevoProfesorDialog({
  abierto,
  onOpenChange,
}: NuevoProfesorDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const crear = useMutation({
    mutationFn: async (datos: Formulario) => {
      const ci = datos.ci.trim()
      const { disponible } = await verificarCi(ci)
      if (!disponible) {
        throw new Error('Ya existe un usuario registrado con esa cédula (CI).')
      }

      const usuario = await crearUsuario({
        ci,
        nombres: datos.nombres.trim(),
        apellidos: datos.apellidos.trim(),
        rol_id: IDS_ROL.profesor,
        password: CONTRASENA_POR_DEFECTO,
      })

      try {
        await crearProfesor({
          usuario_id: usuario.id,
          fecha_ingreso: datos.fechaIngreso,
          direccion: datos.direccion.trim(),
          telefono: datos.telefono.trim(),
        })
      } catch (error) {
        // Compensación: si falla el perfil, no debe quedar una cuenta huérfana.
        await eliminarUsuario(usuario.id).catch(() => undefined)
        throw error
      }

      return usuario
    },
    onSuccess: (usuario) => {
      toast.success('Profesor registrado', {
        description: `Credenciales para ${nombreCompleto(usuario)} — CI: ${
          usuario.ci
        } · Contraseña: ${CONTRASENA_POR_DEFECTO}`,
        duration: 12000,
      })
      void queryClient.invalidateQueries({ queryKey: ['profesores'] })
      void queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      if (/c[ée]dula|ci\b/i.test(mensaje) && /existe|registrad/i.test(mensaje)) {
        setErrores((previos) => ({ ...previos, ci: mensaje }))
        setErrorEnvio(null)
        return
      }
      setErrorEnvio(mensaje)
    },
  })

  function cerrar() {
    setFormulario(FORMULARIO_VACIO)
    setErrores({})
    setErrorEnvio(null)
    crear.reset()
    onOpenChange(false)
  }

  function actualizar(campo: keyof Formulario, valor: string) {
    setFormulario((previo) => ({ ...previo, [campo]: valor }))
    setErrores((previos) => ({ ...previos, [campo]: undefined }))
    setErrorEnvio(null)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const encontrados = validar(formulario)
    setErrores(encontrados)
    setErrorEnvio(null)
    if (Object.keys(encontrados).length > 0) return
    crear.mutate(formulario)
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) cerrar()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo profesor</DialogTitle>
          <DialogDescription>
            Crea la cuenta del docente y su perfil. Al finalizar se muestran las
            credenciales que debes entregarle.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-prof-nombres">Nombres</Label>
              <Input
                id="nuevo-prof-nombres"
                value={formulario.nombres}
                onChange={(evento) => actualizar('nombres', evento.target.value)}
                placeholder="Ej.: Julio César"
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(errores.nombres)}
                aria-describedby={
                  errores.nombres ? 'error-prof-nombres' : undefined
                }
                className="h-10"
              />
              {errores.nombres ? (
                <p
                  id="error-prof-nombres"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.nombres}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-prof-apellidos">Apellidos</Label>
              <Input
                id="nuevo-prof-apellidos"
                value={formulario.apellidos}
                onChange={(evento) =>
                  actualizar('apellidos', evento.target.value)
                }
                placeholder="Ej.: Apaza Luque"
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(errores.apellidos)}
                aria-describedby={
                  errores.apellidos ? 'error-prof-apellidos' : undefined
                }
                className="h-10"
              />
              {errores.apellidos ? (
                <p
                  id="error-prof-apellidos"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.apellidos}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-prof-ci">CI</Label>
              <Input
                id="nuevo-prof-ci"
                value={formulario.ci}
                onChange={(evento) => actualizar('ci', evento.target.value)}
                placeholder="Ej.: 8019091 CB"
                maxLength={15}
                autoComplete="off"
                aria-invalid={Boolean(errores.ci)}
                aria-describedby={errores.ci ? 'error-prof-ci' : undefined}
                className="h-10"
              />
              {errores.ci ? (
                <p
                  id="error-prof-ci"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.ci}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Debe ser única en el sistema.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-prof-telefono">Teléfono</Label>
              <Input
                id="nuevo-prof-telefono"
                value={formulario.telefono}
                onChange={(evento) =>
                  actualizar('telefono', evento.target.value)
                }
                placeholder="Ej.: 71234567"
                maxLength={20}
                inputMode="tel"
                autoComplete="off"
                aria-invalid={Boolean(errores.telefono)}
                aria-describedby={
                  errores.telefono ? 'error-prof-telefono' : undefined
                }
                className="h-10"
              />
              {errores.telefono ? (
                <p
                  id="error-prof-telefono"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.telefono}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nuevo-prof-direccion">Dirección</Label>
              <Textarea
                id="nuevo-prof-direccion"
                value={formulario.direccion}
                onChange={(evento) =>
                  actualizar('direccion', evento.target.value)
                }
                placeholder="Ej.: Av. 6 de Agosto #1234, Sopocachi"
                maxLength={150}
                rows={2}
                aria-invalid={Boolean(errores.direccion)}
                aria-describedby={
                  errores.direccion ? 'error-prof-direccion' : undefined
                }
                className="min-h-16 text-base"
              />
              {errores.direccion ? (
                <p
                  id="error-prof-direccion"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.direccion}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2 sm:max-w-xs">
              <Label htmlFor="nuevo-prof-ingreso">Fecha de ingreso</Label>
              <Input
                id="nuevo-prof-ingreso"
                type="date"
                value={formulario.fechaIngreso}
                max={hoyIso()}
                onChange={(evento) =>
                  actualizar('fechaIngreso', evento.target.value)
                }
                aria-invalid={Boolean(errores.fechaIngreso)}
                aria-describedby={
                  errores.fechaIngreso ? 'error-prof-ingreso' : undefined
                }
                className="h-10 text-base md:text-base"
              />
              {errores.fechaIngreso ? (
                <p
                  id="error-prof-ingreso"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.fechaIngreso}
                </p>
              ) : null}
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              La contraseña inicial será{' '}
              <strong className="font-semibold text-foreground">
                {CONTRASENA_POR_DEFECTO}
              </strong>
              . Se mostrará al guardar para que la compartas con el docente.
            </span>
          </p>

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
              disabled={crear.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <UserPlus aria-hidden="true" />
              )}
              {crear.isPending ? 'Registrando…' : 'Registrar profesor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
