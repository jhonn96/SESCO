import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, UserPlus } from 'lucide-react'
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
import { CONTRASENA_POR_DEFECTO } from '@/lib/credenciales'
import { compararCursos, etiquetaCurso, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { hoyIso } from '@/lib/fechas'
import { nombreCompleto } from '@/lib/personas'
import { IDS_ROL } from '@/lib/roles'
import type { Curso } from '@/services/cursos'
import { crearEstudiante } from '@/services/estudiantes'
import { crearUsuario, eliminarUsuario, verificarCi } from '@/services/usuarios'

interface NuevoEstudianteDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
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

const FORMULARIO_VACIO: Formulario = {
  nombres: '',
  apellidos: '',
  ci: '',
  fechaNac: '',
  cursoId: '',
}

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

/**
 * Alta de un estudiante: primero crea la cuenta (`POST /api/usuarios`) y luego
 * el perfil académico (`POST /api/estudiantes`), que genera el secreto QR en
 * el backend. Si falla el segundo paso, se elimina la cuenta recién creada.
 */
export function NuevoEstudianteDialog({
  abierto,
  onOpenChange,
  cursos,
}: NuevoEstudianteDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const cursosOrdenados = [...cursos].sort(compararCursos)

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
        rol_id: IDS_ROL.estudiante,
        password: CONTRASENA_POR_DEFECTO,
      })

      try {
        await crearEstudiante({
          usuario_id: usuario.id,
          curso_id: Number(datos.cursoId),
          fecha_nac: datos.fechaNac,
        })
      } catch (error) {
        // Compensación: si falla el perfil, no debe quedar una cuenta huérfana.
        await eliminarUsuario(usuario.id).catch(() => undefined)
        throw error
      }

      const curso =
        cursosOrdenados.find((item) => item.id === Number(datos.cursoId)) ?? null
      return { usuario, curso }
    },
    onSuccess: ({ usuario, curso }) => {
      toast.success('Estudiante registrado', {
        description: `${nombreCompleto(usuario)} fue matriculado en ${
          curso ? etiquetaCurso(curso) : 'el curso seleccionado'
        }.`,
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
          <DialogTitle>Nuevo estudiante</DialogTitle>
          <DialogDescription>
            Crea la cuenta y matricula al estudiante en un curso del periodo
            activo. El sistema genera automáticamente su código QR.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-est-nombres">Nombres</Label>
              <Input
                id="nuevo-est-nombres"
                value={formulario.nombres}
                onChange={(evento) => actualizar('nombres', evento.target.value)}
                placeholder="Ej.: Ana María"
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(errores.nombres)}
                aria-describedby={
                  errores.nombres ? 'error-est-nombres' : undefined
                }
                className="h-10"
              />
              {errores.nombres ? (
                <p
                  id="error-est-nombres"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.nombres}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-est-apellidos">Apellidos</Label>
              <Input
                id="nuevo-est-apellidos"
                value={formulario.apellidos}
                onChange={(evento) =>
                  actualizar('apellidos', evento.target.value)
                }
                placeholder="Ej.: Quispe Mamani"
                maxLength={80}
                autoComplete="off"
                aria-invalid={Boolean(errores.apellidos)}
                aria-describedby={
                  errores.apellidos ? 'error-est-apellidos' : undefined
                }
                className="h-10"
              />
              {errores.apellidos ? (
                <p
                  id="error-est-apellidos"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.apellidos}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-est-ci">CI</Label>
              <Input
                id="nuevo-est-ci"
                value={formulario.ci}
                onChange={(evento) => actualizar('ci', evento.target.value)}
                placeholder="Ej.: 12345678 LP"
                maxLength={15}
                autoComplete="off"
                aria-invalid={Boolean(errores.ci)}
                aria-describedby={errores.ci ? 'error-est-ci' : undefined}
                className="h-10"
              />
              {errores.ci ? (
                <p
                  id="error-est-ci"
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
              <Label htmlFor="nuevo-est-fecha">Fecha de nacimiento</Label>
              <Input
                id="nuevo-est-fecha"
                type="date"
                value={formulario.fechaNac}
                max={hoyIso()}
                onChange={(evento) =>
                  actualizar('fechaNac', evento.target.value)
                }
                aria-invalid={Boolean(errores.fechaNac)}
                aria-describedby={
                  errores.fechaNac ? 'error-est-fecha' : undefined
                }
                className="h-10 text-base md:text-base"
              />
              {errores.fechaNac ? (
                <p
                  id="error-est-fecha"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errores.fechaNac}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nuevo-est-curso">Curso</Label>
              <Select
                id="nuevo-est-curso"
                value={formulario.cursoId}
                onChange={(evento) =>
                  actualizar('cursoId', evento.target.value)
                }
                aria-invalid={Boolean(errores.cursoId)}
                aria-describedby={
                  errores.cursoId ? 'error-est-curso' : undefined
                }
              >
                <option value="">Selecciona un curso</option>
                {cursosOrdenados.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {etiquetaCurso(curso)} · {nombreTurno(curso.turno)}
                  </option>
                ))}
              </Select>
              {errores.cursoId ? (
                <p
                  id="error-est-curso"
                  className="text-sm text-destructive"
                  role="alert"
                >
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
              {crear.isPending ? 'Registrando…' : 'Registrar estudiante'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
