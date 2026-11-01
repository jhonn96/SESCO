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
import { etiquetaCurso, nombreNivel, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { etiquetaPeriodo } from '@/lib/periodos'
import { actualizarCurso, type Curso } from '@/services/cursos'
import type { Periodo } from '@/services/periodos'

interface EditarCursoDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  curso: Curso
  periodos: Periodo[]
}

interface Formulario {
  nivel: string
  grado: string
  paralelo: string
  turno: string
  periodoId: string
}

type Errores = Partial<Record<keyof Formulario, string>>

const NIVELES = ['inicial', 'primaria', 'secundaria'] as const
const TURNOS = ['manana', 'tarde', 'noche'] as const

function validar(formulario: Formulario): Errores {
  const errores: Errores = {}

  if (!NIVELES.includes(formulario.nivel as (typeof NIVELES)[number])) {
    errores.nivel = 'Selecciona el nivel.'
  }

  const grado = Number(formulario.grado)
  if (!formulario.grado) {
    errores.grado = 'Selecciona el grado.'
  } else if (!Number.isInteger(grado) || grado < 1 || grado > 6) {
    errores.grado = 'El grado debe estar entre 1 y 6.'
  }

  const paralelo = formulario.paralelo.trim()
  if (!paralelo) {
    errores.paralelo = 'Ingresa el paralelo.'
  } else if (!/^[A-Za-z]$/.test(paralelo)) {
    errores.paralelo = 'Usa una sola letra, por ejemplo A.'
  }

  if (!TURNOS.includes(formulario.turno as (typeof TURNOS)[number])) {
    errores.turno = 'Selecciona el turno.'
  }

  if (!formulario.periodoId) {
    errores.periodoId = 'Selecciona el periodo lectivo.'
  }

  return errores
}

/** Edición de un curso (`PUT /api/cursos/{id}`). */
export function EditarCursoDialog({
  abierto,
  onOpenChange,
  curso,
  periodos,
}: EditarCursoDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>({
    nivel: curso.nivel,
    grado: String(curso.grado),
    paralelo: curso.paralelo.trim(),
    turno: curso.turno,
    periodoId: String(curso.periodo_id),
  })
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const periodosOrdenados = [...periodos].sort(
    (a, b) => a.gestion - b.gestion || a.trimestre - b.trimestre,
  )

  const guardar = useMutation({
    mutationFn: () =>
      actualizarCurso(curso.id, {
        nivel: formulario.nivel,
        grado: Number(formulario.grado),
        paralelo: formulario.paralelo.trim().toUpperCase(),
        turno: formulario.turno,
        periodo_id: Number(formulario.periodoId),
      }),
    onSuccess: (actualizado) => {
      toast.success('Curso actualizado', {
        description: `${etiquetaCurso(actualizado)} · ${nombreTurno(
          actualizado.turno,
        )}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['cursos'] })
      void queryClient.invalidateQueries({ queryKey: ['estudiantes'] })
      void queryClient.invalidateQueries({ queryKey: ['horarios'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo actualizar el curso', { description: mensaje })
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar curso</DialogTitle>
          <DialogDescription>
            {etiquetaCurso(curso)} · {nombreTurno(curso.turno)}. El nivel, grado
            y paralelo no pueden repetirse en el mismo periodo.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="editar-curso-nivel">Nivel</Label>
              <Select
                id="editar-curso-nivel"
                value={formulario.nivel}
                onChange={(evento) => actualizar('nivel', evento.target.value)}
                aria-invalid={Boolean(errores.nivel)}
              >
                {NIVELES.map((nivel) => (
                  <option key={nivel} value={nivel}>
                    {nombreNivel(nivel)}
                  </option>
                ))}
              </Select>
              {errores.nivel ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.nivel}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-curso-grado">Grado</Label>
              <Select
                id="editar-curso-grado"
                value={formulario.grado}
                onChange={(evento) => actualizar('grado', evento.target.value)}
                aria-invalid={Boolean(errores.grado)}
              >
                {Array.from({ length: 6 }, (_, indice) => indice + 1).map(
                  (grado) => (
                    <option key={grado} value={grado}>
                      {grado}°
                    </option>
                  ),
                )}
              </Select>
              {errores.grado ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.grado}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-curso-paralelo">Paralelo</Label>
              <Input
                id="editar-curso-paralelo"
                value={formulario.paralelo}
                onChange={(evento) =>
                  actualizar(
                    'paralelo',
                    evento.target.value.toUpperCase().slice(0, 1),
                  )
                }
                maxLength={1}
                autoComplete="off"
                aria-invalid={Boolean(errores.paralelo)}
                className="h-10 uppercase"
              />
              {errores.paralelo ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.paralelo}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-curso-turno">Turno</Label>
              <Select
                id="editar-curso-turno"
                value={formulario.turno}
                onChange={(evento) => actualizar('turno', evento.target.value)}
                aria-invalid={Boolean(errores.turno)}
              >
                {TURNOS.map((turno) => (
                  <option key={turno} value={turno}>
                    {nombreTurno(turno)}
                  </option>
                ))}
              </Select>
              {errores.turno ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.turno}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="editar-curso-periodo">Periodo lectivo</Label>
              <Select
                id="editar-curso-periodo"
                value={formulario.periodoId}
                onChange={(evento) =>
                  actualizar('periodoId', evento.target.value)
                }
                aria-invalid={Boolean(errores.periodoId)}
                disabled={periodos.length === 0}
              >
                <option value="">
                  {periodos.length === 0
                    ? 'Cargando periodos…'
                    : 'Selecciona un periodo'}
                </option>
                {periodosOrdenados.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {etiquetaPeriodo(periodo)}
                  </option>
                ))}
              </Select>
              {errores.periodoId ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.periodoId}
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
