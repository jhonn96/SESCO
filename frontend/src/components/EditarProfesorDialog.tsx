import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Save } from 'lucide-react'
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
import { mensajeDeError } from '@/lib/errores'
import { hoyIso } from '@/lib/fechas'
import { nombreCompleto } from '@/lib/personas'
import {
  actualizarProfesor,
  type ActualizarProfesor,
  type Profesor,
} from '@/services/profesores'

interface EditarProfesorDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  profesor: Profesor
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

/** Edición de la cuenta y el perfil del docente (`PUT`). */
export function EditarProfesorDialog({
  abierto,
  onOpenChange,
  profesor,
}: EditarProfesorDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>({
    nombres: profesor.usuario?.nombres ?? '',
    apellidos: profesor.usuario?.apellidos ?? '',
    ci: profesor.usuario?.ci ?? '',
    telefono: profesor.telefono,
    direccion: profesor.direccion,
    fechaIngreso: profesor.fecha_ingreso,
  })
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => {
      const datos: ActualizarProfesor = {
        nombres: formulario.nombres.trim(),
        apellidos: formulario.apellidos.trim(),
        ci: formulario.ci.trim(),
        telefono: formulario.telefono.trim(),
        direccion: formulario.direccion.trim(),
        fecha_ingreso: formulario.fechaIngreso,
      }
      return actualizarProfesor(profesor.usuario_id, datos)
    },
    onSuccess: (actualizado) => {
      toast.success('Profesor actualizado', {
        description: `${nombreCompleto(actualizado.usuario)} · CI ${
          actualizado.usuario?.ci ?? '—'
        }`,
      })
      void queryClient.invalidateQueries({ queryKey: ['profesores'] })
      void queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      void queryClient.invalidateQueries({ queryKey: ['profesor_curso'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      if (/c[ée]dula|ci\b/i.test(mensaje) && /existe|registrad/i.test(mensaje)) {
        setErrores((previos) => ({ ...previos, ci: mensaje }))
      }
      setErrorEnvio(mensaje)
      toast.error('No se pudo actualizar el profesor', { description: mensaje })
    },
  })

  function cerrar() {
    setErrores({})
    setErrorEnvio(null)
    guardar.reset()
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
    guardar.mutate()
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
          <DialogTitle>Editar profesor</DialogTitle>
          <DialogDescription>
            {nombreCompleto(profesor.usuario) || 'Docente'} · CI{' '}
            {profesor.usuario?.ci ?? '—'}. La contraseña no cambia desde aquí.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="editar-prof-nombres">Nombres</Label>
              <Input
                id="editar-prof-nombres"
                value={formulario.nombres}
                onChange={(evento) =>
                  actualizar('nombres', evento.target.value)
                }
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(errores.nombres)}
                className="h-10"
              />
              {errores.nombres ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.nombres}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-prof-apellidos">Apellidos</Label>
              <Input
                id="editar-prof-apellidos"
                value={formulario.apellidos}
                onChange={(evento) =>
                  actualizar('apellidos', evento.target.value)
                }
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(errores.apellidos)}
                className="h-10"
              />
              {errores.apellidos ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.apellidos}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-prof-ci">CI</Label>
              <Input
                id="editar-prof-ci"
                value={formulario.ci}
                onChange={(evento) => actualizar('ci', evento.target.value)}
                maxLength={15}
                autoComplete="off"
                aria-invalid={Boolean(errores.ci)}
                className="h-10"
              />
              {errores.ci ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.ci}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-prof-telefono">Teléfono</Label>
              <Input
                id="editar-prof-telefono"
                value={formulario.telefono}
                onChange={(evento) =>
                  actualizar('telefono', evento.target.value)
                }
                maxLength={20}
                autoComplete="off"
                aria-invalid={Boolean(errores.telefono)}
                className="h-10"
              />
              {errores.telefono ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.telefono}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="editar-prof-direccion">Dirección</Label>
              <Textarea
                id="editar-prof-direccion"
                value={formulario.direccion}
                onChange={(evento) =>
                  actualizar('direccion', evento.target.value)
                }
                maxLength={150}
                aria-invalid={Boolean(errores.direccion)}
                className="min-h-20"
              />
              {errores.direccion ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.direccion}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="editar-prof-ingreso">Fecha de ingreso</Label>
              <Input
                id="editar-prof-ingreso"
                type="date"
                value={formulario.fechaIngreso}
                max={hoyIso()}
                onChange={(evento) =>
                  actualizar('fechaIngreso', evento.target.value)
                }
                aria-invalid={Boolean(errores.fechaIngreso)}
                className="h-10 text-base md:text-base"
              />
              {errores.fechaIngreso ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.fechaIngreso}
                </p>
              ) : null}
            </div>
          </div>

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
              disabled={guardar.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save aria-hidden="true" />
              )}
              {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
