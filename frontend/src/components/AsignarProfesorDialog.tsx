import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { etiquetaCurso, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import type { Curso } from '@/services/cursos'
import {
  crearAsignacion,
  eliminarAsignacion,
  listarAsignacionesCurso,
  type ProfesorCurso,
} from '@/services/profesor_curso'
import { listarProfesores } from '@/services/profesores'

interface AsignarProfesorDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  curso: Curso | null
}

function nombreProfesor(asignacion: ProfesorCurso): string {
  return (
    nombreCompleto(asignacion.profesor?.usuario) ||
    `Profesor #${asignacion.profesor_id}`
  )
}

/**
 * Asigna profesores a un curso y permite retirar las asignaciones existentes.
 * Solo puede haber un asesor por curso; el backend desmarca al anterior.
 */
export function AsignarProfesorDialog({
  abierto,
  onOpenChange,
  curso,
}: AsignarProfesorDialogProps) {
  const queryClient = useQueryClient()
  const [profesorId, setProfesorId] = useState('')
  const [esAsesor, setEsAsesor] = useState(false)
  const [errorProfesor, setErrorProfesor] = useState<string | null>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const asignaciones = useQuery({
    queryKey: ['profesor_curso', 'curso', curso?.id],
    queryFn: ({ signal }) => listarAsignacionesCurso(curso!.id, signal),
    enabled: abierto && curso !== null,
    staleTime: 30_000,
  })

  const profesores = useQuery({
    queryKey: ['profesores', 'todos'],
    queryFn: ({ signal }) => listarProfesores({ limit: 100 }, signal),
    enabled: abierto,
    staleTime: 10 * 60_000,
  })

  const asignados = asignaciones.data?.data ?? []
  const idsAsignados = new Set(asignados.map((item) => item.profesor_id))
  const disponibles = (profesores.data?.data ?? []).filter(
    (profesor) => !idsAsignados.has(profesor.usuario_id),
  )

  const crear = useMutation({
    mutationFn: () => {
      if (!curso) throw new Error('Selecciona un curso antes de asignar.')
      return crearAsignacion({
        profesor_id: Number(profesorId),
        curso_id: curso.id,
        es_asesor: esAsesor,
      })
    },
    onSuccess: (asignacion) => {
      toast.success('Profesor asignado', {
        description: `${nombreProfesor(asignacion)} → ${
          curso ? etiquetaCurso(curso) : 'el curso'
        }${asignacion.es_asesor ? ' · Asesor de curso' : ''}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['profesor_curso'] })
      void queryClient.invalidateQueries({ queryKey: ['cursos'] })
      setProfesorId('')
      setEsAsesor(false)
      setErrorEnvio(null)
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo asignar el profesor', { description: mensaje })
    },
  })

  const quitar = useMutation({
    mutationFn: (asignacion: ProfesorCurso) =>
      eliminarAsignacion(asignacion.profesor_id, asignacion.curso_id),
    onSuccess: (_datos, asignacion) => {
      toast.success('Asignación retirada', {
        description: `${nombreProfesor(asignacion)} ya no está asignado a ${
          curso ? etiquetaCurso(curso) : 'este curso'
        }.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['profesor_curso'] })
    },
    onError: (error) => {
      toast.error('No se pudo retirar la asignación', {
        description: mensajeDeError(error),
      })
    },
  })

  function cerrar() {
    setProfesorId('')
    setEsAsesor(false)
    setErrorProfesor(null)
    setErrorEnvio(null)
    crear.reset()
    quitar.reset()
    onOpenChange(false)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrorEnvio(null)
    if (!profesorId) {
      setErrorProfesor('Selecciona un profesor.')
      return
    }
    setErrorProfesor(null)
    crear.mutate()
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
          <DialogTitle>Asignar profesor</DialogTitle>
          <DialogDescription>
            {curso
              ? `${etiquetaCurso(curso)} · Turno ${nombreTurno(
                  curso.turno,
                )}. Puedes asignar varios docentes y marcar a uno como asesor del curso.`
              : 'Selecciona un curso para gestionar sus profesores.'}
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Profesores asignados</h3>
            {asignaciones.data ? (
              <Badge variant="muted">
                {asignados.length}{' '}
                {asignados.length === 1 ? 'asignación' : 'asignaciones'}
              </Badge>
            ) : null}
          </div>

          {asignaciones.isLoading ? (
            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Cargando asignaciones…
            </p>
          ) : asignaciones.isError ? (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>{mensajeDeError(asignaciones.error)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void asignaciones.refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : asignados.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Este curso todavía no tiene profesores asignados.
            </p>
          ) : (
            <ul className="grid max-h-48 gap-2 overflow-y-auto">
              {asignados.map((asignacion) => {
                const nombre = nombreProfesor(asignacion)
                return (
                  <li
                    key={asignacion.profesor_id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {inicialesPersona(asignacion.profesor?.usuario)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{nombre}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        CI {asignacion.profesor?.usuario?.ci ?? '—'}
                      </p>
                    </div>
                    {asignacion.es_asesor ? (
                      <Badge variant="success">Asesor</Badge>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Quitar a ${nombre}`}
                      title="Quitar asignación"
                      disabled={quitar.isPending}
                      onClick={() => quitar.mutate(asignacion)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <form className="grid gap-4 border-t border-border pt-4" onSubmit={enviar} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="asignar-profesor">Profesor</Label>
            <Select
              id="asignar-profesor"
              value={profesorId}
              onChange={(evento) => {
                setProfesorId(evento.target.value)
                setErrorProfesor(null)
                setErrorEnvio(null)
              }}
              aria-invalid={Boolean(errorProfesor)}
              disabled={profesores.isLoading || asignaciones.isLoading}
            >
              <option value="">
                {profesores.isLoading
                  ? 'Cargando profesores…'
                  : disponibles.length === 0
                    ? 'Todos los profesores ya están asignados'
                    : 'Selecciona un profesor'}
              </option>
              {disponibles.map((profesor) => (
                <option key={profesor.usuario_id} value={profesor.usuario_id}>
                  {nombreCompleto(profesor.usuario) ||
                    `Profesor #${profesor.usuario_id}`}{' '}
                  · {profesor.usuario?.ci ?? 'sin CI'}
                </option>
              ))}
            </Select>
            {errorProfesor ? (
              <p className="text-sm text-destructive" role="alert">
                {errorProfesor}
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Checkbox
              id="asignar-asesor"
              checked={esAsesor}
              onChange={(evento) => setEsAsesor(evento.target.checked)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="asignar-asesor">Es asesor de curso</Label>
              <p className="text-xs text-muted-foreground">
                Solo puede haber un asesor por curso; al marcarlo se reemplaza
                al asesor anterior.
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
              Cerrar
            </Button>
            <Button
              type="submit"
              disabled={crear.isPending || !curso || disponibles.length === 0}
            >
              {crear.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus aria-hidden="true" />
              )}
              {crear.isPending ? 'Asignando…' : 'Asignar profesor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
