import { useEffect, useMemo, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react'
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
import {
  ESTADOS_ASISTENCIA,
  ESTADOS_MANUALES,
  type EstadoManual,
} from '@/lib/asistencia'
import { etiquetaCortaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import { registrarAsistenciaManual } from '@/services/asistencia'
import { listarMisEstudiantes, type Estudiante } from '@/services/estudiantes'
import { obtenerBloquesVigentes } from '@/services/horarios'

const MINIMO_BUSQUEDA = 2
const MAXIMO_RESULTADOS = 8

const ICONO_ESTADO: Record<EstadoManual, LucideIcon> = {
  presente: CheckCircle2,
  tardanza: Clock,
  falta: XCircle,
}

const ESTILO_ACTIVO: Record<EstadoManual, string> = {
  presente:
    'border-success/40 bg-success/10 text-success ring-1 ring-success/30',
  tardanza:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300',
  falta:
    'border-destructive/40 bg-destructive/10 text-destructive ring-1 ring-destructive/30',
}

export interface RegistroManualDialogProps {
  abierto: boolean
  onCerrar: () => void
}

/**
 * Registro manual para estudiantes sin celular: busca solo entre los cursos
 * del docente y registra en el bloque que está en curso.
 */
export function RegistroManualDialog({
  abierto,
  onCerrar,
}: RegistroManualDialogProps) {
  const queryClient = useQueryClient()

  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<Estudiante | null>(null)
  const [estado, setEstado] = useState<EstadoManual>('presente')
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const termino = busqueda.trim()
  const puedeBuscar = termino.length >= MINIMO_BUSQUEDA

  // El registro manual solo se habilita si el docente tiene clase ahora.
  const vigentes = useQuery({
    queryKey: ['profesor', 'bloques-vigentes'],
    queryFn: ({ signal }) => obtenerBloquesVigentes(signal),
    enabled: abierto,
    staleTime: 0,
  })

  const bloques = vigentes.data ?? []
  const bloqueActual = bloques[0]
  const sinBloque = vigentes.isSuccess && bloques.length === 0
  const puedeRegistrar = !vigentes.isPending && !sinBloque

  // Si hay una única clase en curso, se limita la búsqueda a ese curso.
  const cursosVigentes = useMemo(
    () => [...new Set((vigentes.data ?? []).map((bloque) => bloque.curso_id))],
    [vigentes.data],
  )
  const cursoEnClase =
    cursosVigentes.length === 1 ? cursosVigentes[0] : undefined

  const estudiantes = useQuery({
    queryKey: ['profesor', 'mis-estudiantes', termino, cursoEnClase],
    queryFn: ({ signal }) =>
      listarMisEstudiantes(
        { q: termino, limit: MAXIMO_RESULTADOS, curso_id: cursoEnClase },
        signal,
      ),
    enabled: abierto && puedeBuscar && !seleccionado && puedeRegistrar,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

  const resultados = useMemo(
    () => estudiantes.data?.data ?? [],
    [estudiantes.data],
  )

  const registrar = useMutation({
    mutationFn: (estudianteId: number) =>
      registrarAsistenciaManual({
        estudiante_id: estudianteId,
        estado,
      }),
    onSuccess: (registro) => {
      const nombre = seleccionado
        ? nombreCompleto(seleccionado.usuario)
        : `Estudiante #${registro.estudiante_id}`

      toast.success('Asistencia registrada', {
        description: `${nombre} · ${ESTADOS_ASISTENCIA[registro.estado].etiqueta}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo registrar la asistencia', {
        description: mensaje,
      })
    },
  })

  useEffect(() => {
    if (!abierto) return
    setBusqueda('')
    setSeleccionado(null)
    setEstado('presente')
    setErrorEnvio(null)
    registrar.reset()
    // Solo se reinicia al abrir el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  function cerrar() {
    registrar.reset()
    onCerrar()
  }

  function elegir(estudiante: Estudiante) {
    setSeleccionado(estudiante)
    setBusqueda('')
    setErrorEnvio(null)
  }

  function cambiarEstado(valor: EstadoManual) {
    setEstado(valor)
  }

  const nombreSeleccionado = seleccionado
    ? nombreCompleto(seleccionado.usuario)
    : ''

  const avisoHorario = vigentes.isPending ? (
    <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      Comprobando tu horario…
    </p>
  ) : sinBloque ? (
    <div
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-200"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        No tienes clase en este momento
      </p>
      <p className="mt-1 text-amber-700/90 dark:text-amber-200/80">
        El registro manual se habilita durante tu horario de clases. Si crees
        que es un error, pide al director que revise tu horario.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => void vigentes.refetch()}
        disabled={vigentes.isFetching}
      >
        <RefreshCw
          className={cn('size-4', vigentes.isFetching && 'animate-spin')}
          aria-hidden="true"
        />
        {vigentes.isFetching ? 'Actualizando…' : 'Actualizar'}
      </Button>
    </div>
  ) : vigentes.isError ? (
    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      No se pudo comprobar tu horario. Puedes buscar y el sistema validará el
      bloque al registrar.
    </p>
  ) : bloqueActual ? (
    <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
      <Clock3
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-medium">Clase en curso</p>
        <p className="truncate text-muted-foreground">
          {bloqueActual.curso
            ? etiquetaCortaCurso(bloqueActual.curso)
            : `Curso #${bloqueActual.curso_id}`}
          {bloqueActual.materia ? ` · ${bloqueActual.materia.nombre}` : ''}
          {` · ${bloqueActual.hora_inicio.slice(0, 5)}–${bloqueActual.hora_fin.slice(0, 5)}`}
        </p>
      </div>
    </div>
  ) : null

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor && !registrar.isPending) cerrar()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" aria-hidden="true" />
            Registro manual de asistencia
          </DialogTitle>
          <DialogDescription>
            Busca por nombre o CI entre los estudiantes de tus cursos, elige su
            estado y confirma. Se usará el bloque horario vigente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {avisoHorario}

          {puedeRegistrar ? (
            <>
              {seleccionado ? (
                <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {inicialesPersona(seleccionado.usuario)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{nombreSeleccionado}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {seleccionado.usuario?.ci
                        ? `CI ${seleccionado.usuario.ci}`
                        : 'Sin CI registrado'}
                      {seleccionado.curso
                        ? ` · ${etiquetaCortaCurso(seleccionado.curso)}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSeleccionado(null)
                      setErrorEnvio(null)
                    }}
                    disabled={registrar.isPending}
                  >
                    <X aria-hidden="true" />
                    Cambiar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="registro-manual-busqueda">Estudiante</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="registro-manual-busqueda"
                      value={busqueda}
                      onChange={(evento) => {
                        setBusqueda(evento.target.value)
                        setErrorEnvio(null)
                      }}
                      placeholder="Nombre, apellidos o CI…"
                      autoComplete="off"
                      className="h-10 pl-9 text-base md:text-base"
                      autoFocus
                    />
                  </div>

                  <div className="min-h-24">
                    {!puedeBuscar ? (
                      <p className="px-1 py-3 text-sm text-muted-foreground">
                        Escribe al menos {MINIMO_BUSQUEDA} caracteres para buscar.
                      </p>
                    ) : estudiantes.isFetching && resultados.length === 0 ? (
                      <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
                        <LoaderCircle
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Buscando estudiantes…
                      </p>
                    ) : estudiantes.isError ? (
                      <p
                        role="alert"
                        className="px-1 py-3 text-sm text-destructive"
                      >
                        {mensajeDeError(estudiantes.error)}
                      </p>
                    ) : resultados.length === 0 ? (
                      <p className="px-1 py-3 text-sm text-muted-foreground">
                        No se encontraron estudiantes en tus cursos con “{termino}”.
                      </p>
                    ) : (
                      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                        {resultados.map((estudiante) => {
                          const nombre =
                            nombreCompleto(estudiante.usuario) ||
                            `Estudiante #${estudiante.usuario_id}`

                          return (
                            <li key={estudiante.usuario_id}>
                              <button
                                type="button"
                                onClick={() => elegir(estudiante)}
                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                              >
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                  {inicialesPersona(estudiante.usuario)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">
                                    {nombre}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {estudiante.usuario?.ci
                                      ? `CI ${estudiante.usuario.ci}`
                                      : 'Sin CI'}
                                    {estudiante.curso
                                      ? ` · ${etiquetaCortaCurso(estudiante.curso)}`
                                      : ''}
                                  </span>
                                </span>
                                <UserCheck
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {seleccionado ? (
                <div className="space-y-2">
                  <Label id="registro-manual-estado">Estado de asistencia</Label>
                  <div
                    role="group"
                    aria-labelledby="registro-manual-estado"
                    className="grid gap-2 sm:grid-cols-3"
                  >
                    {ESTADOS_MANUALES.map((valor) => {
                      const Icono = ICONO_ESTADO[valor]
                      const activo = estado === valor

                      return (
                        <button
                          key={valor}
                          type="button"
                          aria-pressed={activo}
                          onClick={() => cambiarEstado(valor)}
                          disabled={registrar.isPending}
                          className={cn(
                            'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                            activo
                              ? ESTILO_ACTIVO[valor]
                              : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <Icono className="size-4" aria-hidden="true" />
                          {ESTADOS_ASISTENCIA[valor].etiqueta}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {estado === 'falta'
                      ? 'Se guardará sin hora de ingreso y se avisará al tutor.'
                      : 'Se tomará la hora actual como hora de ingreso.'}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          {errorEnvio ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorEnvio}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={cerrar}
            disabled={registrar.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (seleccionado) registrar.mutate(seleccionado.usuario_id)
            }}
            disabled={!seleccionado || registrar.isPending || !puedeRegistrar}
          >
            {registrar.isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <UserCheck aria-hidden="true" />
            )}
            {registrar.isPending ? 'Registrando…' : 'Registrar asistencia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
