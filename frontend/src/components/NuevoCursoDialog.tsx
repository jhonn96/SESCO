import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, School } from 'lucide-react'
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
import { hoyIso } from '@/lib/fechas'
import { etiquetaPeriodo, periodoVigente } from '@/lib/periodos'
import { crearCurso } from '@/services/cursos'
import type { Periodo } from '@/services/periodos'

interface NuevoCursoDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
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

const FORMULARIO_VACIO: Formulario = {
  nivel: 'primaria',
  grado: '1',
  paralelo: '',
  turno: 'manana',
  periodoId: '',
}

const NIVELES = ['inicial', 'primaria', 'secundaria'] as const
const TURNOS = ['manana', 'tarde', 'noche'] as const

function validar(formulario: Formulario, periodoId: string): Errores {
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

  if (!periodoId) {
    errores.periodoId = 'Selecciona el periodo lectivo.'
  }

  return errores
}

/**
 * Alta de un curso. El periodo es obligatorio porque el backend exige que
 * cada curso pertenezca a un periodo lectivo concreto.
 */
export function NuevoCursoDialog({
  abierto,
  onOpenChange,
  periodos,
}: NuevoCursoDialogProps) {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const periodosOrdenados = [...periodos].sort(
    (a, b) => a.gestion - b.gestion || a.trimestre - b.trimestre,
  )
  const vigente = periodoVigente(periodos, hoyIso())
  const periodoId = formulario.periodoId || (vigente ? String(vigente.id) : '')

  const crear = useMutation({
    mutationFn: () =>
      crearCurso({
        nivel: formulario.nivel,
        grado: Number(formulario.grado),
        paralelo: formulario.paralelo.trim().toUpperCase(),
        turno: formulario.turno,
        periodo_id: Number(periodoId),
      }),
    onSuccess: (curso) => {
      toast.success('Curso creado', {
        description: `${etiquetaCurso(curso)} · ${nombreTurno(curso.turno)}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['cursos'] })
      cerrar()
    },
    onError: (error) => setErrorEnvio(mensajeDeError(error)),
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
    const encontrados = validar(formulario, periodoId)
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo curso</DialogTitle>
          <DialogDescription>
            Registra un curso dentro de un periodo lectivo. El nivel, grado y
            paralelo no pueden repetirse en el mismo periodo.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-curso-nivel">Nivel</Label>
              <Select
                id="nuevo-curso-nivel"
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
              <Label htmlFor="nuevo-curso-grado">Grado</Label>
              <Select
                id="nuevo-curso-grado"
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
              <Label htmlFor="nuevo-curso-paralelo">Paralelo</Label>
              <Input
                id="nuevo-curso-paralelo"
                value={formulario.paralelo}
                onChange={(evento) =>
                  actualizar(
                    'paralelo',
                    evento.target.value.toUpperCase().slice(0, 1),
                  )
                }
                placeholder="A"
                maxLength={1}
                autoComplete="off"
                aria-invalid={Boolean(errores.paralelo)}
                className="h-10 uppercase"
              />
              {errores.paralelo ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.paralelo}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Una sola letra (A, B, C…).
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-curso-turno">Turno</Label>
              <Select
                id="nuevo-curso-turno"
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
              <Label htmlFor="nuevo-curso-periodo">Periodo lectivo</Label>
              <Select
                id="nuevo-curso-periodo"
                value={periodoId}
                onChange={(evento) =>
                  actualizar('periodoId', evento.target.value)
                }
                aria-invalid={Boolean(errores.periodoId)}
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
              ) : (
                <p className="text-xs text-muted-foreground">
                  Por defecto se elige el periodo que incluye la fecha de hoy.
                </p>
              )}
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
            <Button type="submit" disabled={crear.isPending || !periodoId}>
              {crear.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <School aria-hidden="true" />
              )}
              {crear.isPending ? 'Guardando…' : 'Crear curso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
