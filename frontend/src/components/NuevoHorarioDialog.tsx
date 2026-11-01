import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, LoaderCircle } from 'lucide-react'
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
import type { Curso } from '@/services/cursos'
import { crearHorario } from '@/services/horarios'
import { listarMaterias } from '@/services/materias'

interface NuevoHorarioDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  curso: Curso | null
  /** Días del curso que ya tienen un bloque marcado como cierre de jornada. */
  diasConCierre: readonly DiaSemana[]
}

interface Formulario {
  diaSemana: DiaSemana
  materiaId: string
  horaInicio: string
  horaFin: string
  esUltimoBloque: boolean
}

type Errores = Partial<Record<keyof Formulario, string>>

const FORMULARIO_VACIO: Formulario = {
  diaSemana: 'lunes',
  materiaId: '',
  horaInicio: '',
  horaFin: '',
  esUltimoBloque: false,
}

/** El input `time` devuelve `HH:MM`; el backend espera un `time` completo. */
function aHoraCompleta(valor: string): string {
  return valor.length === 5 ? `${valor}:00` : valor
}

function validar(formulario: Formulario): Errores {
  const errores: Errores = {}

  if (!formulario.materiaId) {
    errores.materiaId = 'Selecciona la materia.'
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

/**
 * Alta de un bloque de horario. El backend rechaza solapamientos y un segundo
 * bloque de cierre; ambos errores se muestran con Sonner y en el formulario.
 */
export function NuevoHorarioDialog({
  abierto,
  onOpenChange,
  curso,
  diasConCierre,
}: NuevoHorarioDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const hayBloqueCierre = diasConCierre.includes(formulario.diaSemana)

  const materias = useQuery({
    queryKey: ['materias', 'lista'],
    queryFn: ({ signal }) => listarMaterias(signal),
    enabled: abierto,
    staleTime: 30 * 60_000,
  })

  const materiasOrdenadas = [...(materias.data ?? [])].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  )

  const crear = useMutation({
    mutationFn: () => {
      if (!curso) throw new Error('Selecciona un curso antes de añadir bloques.')
      return crearHorario({
        curso_id: curso.id,
        materia_id: Number(formulario.materiaId),
        dia_semana: formulario.diaSemana,
        hora_inicio: aHoraCompleta(formulario.horaInicio),
        hora_fin: aHoraCompleta(formulario.horaFin),
        es_ultimo_bloque: formulario.esUltimoBloque,
      })
    },
    onSuccess: (horario) => {
      toast.success('Bloque añadido', {
        description: `${etiquetaDia(horario.dia_semana)} · ${
          horario.materia?.nombre ?? 'Materia'
        } · ${horario.hora_inicio.slice(0, 5)}–${horario.hora_fin.slice(0, 5)}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['horarios'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo añadir el bloque', { description: mensaje })
    },
  })

  function cerrar() {
    setFormulario(FORMULARIO_VACIO)
    setErrores({})
    setErrorEnvio(null)
    crear.reset()
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
    setFormulario((previo) => ({
      ...previo,
      diaSemana: dia,
      // Un día solo admite un bloque de cierre: se desmarca al cambiarse.
      esUltimoBloque: diasConCierre.includes(dia)
        ? false
        : previo.esUltimoBloque,
    }))
    setErrores((previos) => ({ ...previos, diaSemana: undefined }))
    setErrorEnvio(null)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const encontrados = validar(formulario)
    setErrores(encontrados)
    setErrorEnvio(null)
    if (Object.keys(encontrados).length > 0) return
    crear.mutate()
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
          <DialogTitle>Añadir bloque de horario</DialogTitle>
          <DialogDescription>
            {curso
              ? `Nuevo bloque para ${etiquetaCurso(curso)}. No puede solaparse con otro del mismo día.`
              : 'Selecciona un curso para añadir bloques a su horario.'}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-horario-dia">Día de la semana</Label>
              <Select
                id="nuevo-horario-dia"
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
              <Label htmlFor="nuevo-horario-materia">Materia</Label>
              <Select
                id="nuevo-horario-materia"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-horario-inicio">Hora de inicio</Label>
              <Input
                id="nuevo-horario-inicio"
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
              <Label htmlFor="nuevo-horario-fin">Hora de fin</Label>
              <Input
                id="nuevo-horario-fin"
                type="time"
                value={formulario.horaFin}
                onChange={(evento) => actualizar('horaFin', evento.target.value)}
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
              id="nuevo-horario-ultimo"
              checked={formulario.esUltimoBloque}
              onChange={(evento) =>
                actualizar('esUltimoBloque', evento.target.checked)
              }
              disabled={hayBloqueCierre}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="nuevo-horario-ultimo">
                Es el último bloque del día
              </Label>
              <p className="text-xs text-muted-foreground">
                {hayBloqueCierre
                  ? `El ${etiquetaDia(formulario.diaSemana).toLowerCase()} ya tiene un bloque de cierre. Desmárcalo antes de asignar otro.`
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
              disabled={crear.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending || !curso}>
              {crear.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CalendarPlus aria-hidden="true" />
              )}
              {crear.isPending ? 'Guardando…' : 'Añadir bloque'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
