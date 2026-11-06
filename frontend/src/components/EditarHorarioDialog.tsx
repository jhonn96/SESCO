import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { etiquetaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import {
  DIAS_SEMANA,
  etiquetaDia,
  type DiaSemana,
} from '@/lib/horarios'
import { compararPersonas, nombreCompleto } from '@/lib/personas'
import type { Curso } from '@/services/cursos'
import {
  actualizarHorario,
  type Horario,
  type NuevoHorario,
} from '@/services/horarios'
import { listarMaterias } from '@/services/materias'
import { listarProfesores } from '@/services/profesores'

interface EditarHorarioDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  horario: Horario
  curso: Curso | null
  /** Días del curso que ya tienen un bloque de cierre (puede incluir el propio). */
  diasConCierre: readonly DiaSemana[]
}

interface Formulario {
  diaSemana: DiaSemana
  materiaId: string
  profesorId: string
  horaInicio: string
  horaFin: string
  esUltimoBloque: boolean
}

type Errores = Partial<Record<keyof Formulario, string>>

/** El backend espera un `time` completo; el input devuelve `HH:MM`. */
function aHoraCompleta(valor: string): string {
  return valor.length === 5 ? `${valor}:00` : valor
}

function validar(formulario: Formulario): Errores {
  const errores: Errores = {}

  if (!formulario.materiaId) {
    errores.materiaId = 'Selecciona la materia.'
  }

  if (!formulario.profesorId) {
    errores.profesorId = 'Selecciona el profesor.'
  }

  if (!formulario.horaInicio) {
    errores.horaInicio = 'Indica la hora de inicio.'
  }

  if (!formulario.horaFin) {
    errores.horaFin = 'Indica la hora de fin.'
  } else if (
    formulario.horaInicio &&
    formulario.horaFin <= formulario.horaInicio
  ) {
    errores.horaFin = 'La hora de fin debe ser posterior a la de inicio.'
  }

  return errores
}

/** Edición de un bloque de horario (`PUT /api/horarios/{id}`). */
export function EditarHorarioDialog({
  abierto,
  onOpenChange,
  horario,
  curso,
  diasConCierre,
}: EditarHorarioDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>({
    diaSemana: horario.dia_semana,
    materiaId: String(horario.materia_id),
    profesorId: String(horario.profesor_id),
    horaInicio: horario.hora_inicio.slice(0, 5),
    horaFin: horario.hora_fin.slice(0, 5),
    esUltimoBloque: horario.es_ultimo_bloque,
  })
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  // Si el bloque editado es el cierre actual de ese día, no se bloquea su casilla.
  const cierrePropio =
    horario.es_ultimo_bloque && horario.dia_semana === formulario.diaSemana
  const cierreAjeno =
    diasConCierre.includes(formulario.diaSemana) && !cierrePropio

  const materias = useQuery({
    queryKey: ['materias', 'lista'],
    queryFn: ({ signal }) => listarMaterias(signal),
    enabled: abierto,
    staleTime: 30 * 60_000,
  })

  const materiasOrdenadas = [...(materias.data ?? [])].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  )

  const profesores = useQuery({
    queryKey: ['profesores', 'selector'],
    queryFn: ({ signal }) => listarProfesores({ limit: 100 }, signal),
    enabled: abierto,
    staleTime: 5 * 60_000,
  })

  const profesoresOrdenados = [...(profesores.data?.data ?? [])].sort((a, b) =>
    compararPersonas(a.usuario, b.usuario),
  )

  const guardar = useMutation({
    mutationFn: () => {
      const datos: Partial<NuevoHorario> = {
        dia_semana: formulario.diaSemana,
        materia_id: Number(formulario.materiaId),
        profesor_id: Number(formulario.profesorId),
        hora_inicio: aHoraCompleta(formulario.horaInicio),
        hora_fin: aHoraCompleta(formulario.horaFin),
        es_ultimo_bloque: formulario.esUltimoBloque,
      }
      return actualizarHorario(horario.id, datos)
    },
    onSuccess: (actualizado) => {
      toast.success('Bloque actualizado', {
        description: `${etiquetaDia(actualizado.dia_semana)} · ${
          actualizado.materia?.nombre ?? 'Materia'
        } · ${actualizado.hora_inicio.slice(0, 5)}–${actualizado.hora_fin.slice(
          0,
          5,
        )}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['horarios'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo actualizar el bloque', { description: mensaje })
    },
  })

  function cerrar() {
    setErrores({})
    setErrorEnvio(null)
    guardar.reset()
    onOpenChange(false)
  }

  function actualizar<K extends keyof Formulario>(
    campo: K,
    valor: Formulario[K],
  ) {
    setFormulario((previo) => ({ ...previo, [campo]: valor }))
    setErrores((previos) => ({ ...previos, [campo]: undefined }))
    setErrorEnvio(null)
  }

  function cambiarDia(dia: DiaSemana) {
    setFormulario((previo) => {
      const esCierreDeEseDia =
        horario.es_ultimo_bloque && horario.dia_semana === dia
      return {
        ...previo,
        diaSemana: dia,
        esUltimoBloque:
          diasConCierre.includes(dia) && !esCierreDeEseDia
            ? false
            : previo.esUltimoBloque,
      }
    })
    setErrores((previos) => ({ ...previos, diaSemana: undefined }))
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar bloque de horario</DialogTitle>
          <DialogDescription>
            {curso ? `${etiquetaCurso(curso)}. ` : ''}
            Los horarios no pueden solaparse dentro del mismo día ni con otra
            clase del mismo profesor.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="editar-horario-dia">Día de la semana</Label>
              <Select
                id="editar-horario-dia"
                value={formulario.diaSemana}
                onChange={(evento) =>
                  cambiarDia(evento.target.value as DiaSemana)
                }
              >
                {DIAS_SEMANA.map((dia) => (
                  <option key={dia.valor} value={dia.valor}>
                    {dia.etiqueta}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-horario-materia">Materia</Label>
              <Select
                id="editar-horario-materia"
                value={formulario.materiaId}
                onChange={(evento) =>
                  actualizar('materiaId', evento.target.value)
                }
                aria-invalid={Boolean(errores.materiaId)}
                disabled={materias.isLoading}
              >
                <option value="">
                  {materias.isLoading
                    ? 'Cargando materias…'
                    : 'Selecciona una materia'}
                </option>
                {materiasOrdenadas.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nombre}
                  </option>
                ))}
              </Select>
              {errores.materiaId ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.materiaId}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="editar-horario-profesor">Profesor</Label>
            <Select
              id="editar-horario-profesor"
              value={formulario.profesorId}
              onChange={(evento) =>
                actualizar('profesorId', evento.target.value)
              }
              aria-invalid={Boolean(errores.profesorId)}
              disabled={profesores.isLoading}
            >
              <option value="">
                {profesores.isLoading
                  ? 'Cargando profesores...'
                  : 'Selecciona un profesor'}
              </option>
              {profesoresOrdenados.map((profesor) => (
                <option key={profesor.usuario_id} value={profesor.usuario_id}>
                  {nombreCompleto(profesor.usuario) ||
                    `Profesor #${profesor.usuario_id}`}
                </option>
              ))}
            </Select>
            {errores.profesorId ? (
              <p className="text-sm text-destructive" role="alert">
                {errores.profesorId}
              </p>
            ) : null}
            {profesores.isError ? (
              <p className="text-sm text-destructive" role="alert">
                No se pudieron cargar los profesores.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="editar-horario-inicio">Hora de inicio</Label>
              <Input
                id="editar-horario-inicio"
                type="time"
                value={formulario.horaInicio}
                onChange={(evento) =>
                  actualizar('horaInicio', evento.target.value)
                }
                aria-invalid={Boolean(errores.horaInicio)}
                className="h-10 text-base md:text-base"
              />
              {errores.horaInicio ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.horaInicio}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="editar-horario-fin">Hora de fin</Label>
              <Input
                id="editar-horario-fin"
                type="time"
                value={formulario.horaFin}
                onChange={(evento) =>
                  actualizar('horaFin', evento.target.value)
                }
                aria-invalid={Boolean(errores.horaFin)}
                className="h-10 text-base md:text-base"
              />
              {errores.horaFin ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.horaFin}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Checkbox
              id="editar-horario-ultimo"
              checked={formulario.esUltimoBloque}
              onChange={(evento) =>
                actualizar('esUltimoBloque', evento.target.checked)
              }
              disabled={cierreAjeno}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="editar-horario-ultimo">
                Es el último bloque del día
              </Label>
              <p className="text-xs text-muted-foreground">
                {cierreAjeno
                  ? `El ${etiquetaDia(formulario.diaSemana).toLowerCase()} ya tiene un bloque de cierre. Desmárcalo antes de asignar este.`
                  : 'Se usa para calcular la hora de salida en la asistencia.'}
              </p>
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
