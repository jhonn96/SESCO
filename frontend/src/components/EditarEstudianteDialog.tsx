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
import { Select } from '@/components/ui/select'
import { compararCursos, etiquetaCurso, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { hoyIso } from '@/lib/fechas'
import { nombreCompleto } from '@/lib/personas'
import type { Curso } from '@/services/cursos'
import {
  actualizarEstudiante,
  type ActualizarEstudiante,
  type Estudiante,
} from '@/services/estudiantes'

interface EditarEstudianteDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  estudiante: Estudiante
  cursos: Curso[]
}

interface Formulario {
  nombres: string
  apellidos: string
  ci: string
  fechaNac: string
  cursoId: string
}

type Errores = Partial<Record<keyof Formulario, string>>

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

  if (!formulario.fechaNac) {
    errores.fechaNac = 'Selecciona la fecha de nacimiento.'
  } else if (formulario.fechaNac >= hoyIso()) {
    errores.fechaNac = 'La fecha debe ser anterior a hoy.'
  }

  if (!formulario.cursoId) {
    errores.cursoId = 'Selecciona el curso.'
  }

  return errores
}

/** Edición de los datos personales y académicos del estudiante (`PUT`). */
export function EditarEstudianteDialog({
  abierto,
  onOpenChange,
  estudiante,
  cursos,
}: EditarEstudianteDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>({
    nombres: estudiante.usuario?.nombres ?? '',
    apellidos: estudiante.usuario?.apellidos ?? '',
    ci: estudiante.usuario?.ci ?? '',
    fechaNac: estudiante.fecha_nac,
    cursoId: String(estudiante.curso_id),
  })
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const cursosOrdenados = [...cursos].sort(compararCursos)

  const guardar = useMutation({
    mutationFn: () => {
      const datos: ActualizarEstudiante = {
        nombres: formulario.nombres.trim(),
        apellidos: formulario.apellidos.trim(),
        ci: formulario.ci.trim(),
        fecha_nac: formulario.fechaNac,
        curso_id: Number(formulario.cursoId),
      }
      return actualizarEstudiante(estudiante.usuario_id, datos)
    },
    onSuccess: (actualizado) => {
      const curso =
        cursosOrdenados.find((item) => item.id === actualizado.curso_id) ?? null
      toast.success('Estudiante actualizado', {
        description: `${nombreCompleto(actualizado.usuario)} · ${
          curso ? etiquetaCurso(curso) : 'Curso actualizado'
        }`,
      })
      void queryClient.invalidateQueries({ queryKey: ['estudiantes'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      void queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      if (/c[ée]dula|ci\b/i.test(mensaje) && /existe|registrad/i.test(mensaje)) {
        setErrores((previos) => ({ ...previos, ci: mensaje }))
      }
      setErrorEnvio(mensaje)
      toast.error('No se pudo actualizar el estudiante', { description: mensaje })
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
          <DialogTitle>Editar estudiante</DialogTitle>
          <DialogDescription>
            {nombreCompleto(estudiante.usuario)} · CI{' '}
            {estudiante.usuario?.ci ?? '—'}. Actualiza sus datos personales o
            cámbialo de curso.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="editar-est-nombres">Nombres</Label>
              <Input
                id="editar-est-nombres"
                value={formulario.nombres}
                onChange={(evento) => actualizar('nombres', evento.target.value)}
                placeholder="Ej.: Ana María"
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
              <Label htmlFor="editar-est-apellidos">Apellidos</Label>
              <Input
                id="editar-est-apellidos"
                value={formulario.apellidos}
                onChange={(evento) =>
                  actualizar('apellidos', evento.target.value)
                }
                placeholder="Ej.: Quispe Mamani"
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
              <Label htmlFor="editar-est-ci">CI</Label>
              <Input
                id="editar-est-ci"
                value={formulario.ci}
                onChange={(evento) => actualizar('ci', evento.target.value)}
                placeholder="Ej.: 12345678 LP"
                maxLength={15}
                autoComplete="off"
                aria-invalid={Boolean(errores.ci)}
                className="h-10"
              />
              {errores.ci ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.ci}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Debe ser única en el sistema.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-est-fecha">Fecha de nacimiento</Label>
              <Input
                id="editar-est-fecha"
                type="date"
                value={formulario.fechaNac}
                max={hoyIso()}
                onChange={(evento) =>
                  actualizar('fechaNac', evento.target.value)
                }
                aria-invalid={Boolean(errores.fechaNac)}
                className="h-10 text-base md:text-base"
              />
              {errores.fechaNac ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.fechaNac}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="editar-est-curso">Curso</Label>
              <Select
                id="editar-est-curso"
                value={formulario.cursoId}
                onChange={(evento) =>
                  actualizar('cursoId', evento.target.value)
                }
                aria-invalid={Boolean(errores.cursoId)}
              >
                <option value="">Selecciona un curso</option>
                {cursosOrdenados.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {etiquetaCurso(curso)} · {nombreTurno(curso.turno)}
                  </option>
                ))}
              </Select>
              {errores.cursoId ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.cursoId}
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
