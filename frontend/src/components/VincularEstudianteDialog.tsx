import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, LoaderCircle, Search, UserPlus, X } from 'lucide-react'
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
import { compararPersonas, nombreCompleto } from '@/lib/personas'
import { listarEstudiantes, type Estudiante } from '@/services/estudiantes'
import {
  confirmarTutoria,
  crearTutoria,
  type Parentesco,
} from '@/services/tutorias'
import { listarTodosLosTutores, type Tutor } from '@/services/tutores'

interface VincularEstudianteDialogProps {
  abierto: boolean
  onOpenChange: (abierto: boolean) => void
  /** Tutor ya elegido (por ejemplo, desde la fila de la tabla). */
  tutorInicial?: Tutor | null
}

interface Errores {
  estudiante?: string
  tutorId?: string
  parentesco?: string
}

const RETRASO_BUSQUEDA = 350
const PARENTESCOS: Parentesco[] = ['Padre', 'Madre', 'Abuelo/a', 'Tutor legal']

/**
 * Crea el vínculo estudiante-tutor y lo confirma en el acto.
 *
 * RD-02: ``POST /api/tutorias`` crea el vínculo en estado ``pendiente`` y solo
 * el Director puede confirmarlo; por eso se encadena el endpoint de
 * confirmación antes de cerrar el diálogo.
 */
export function VincularEstudianteDialog({
  abierto,
  onOpenChange,
  tutorInicial = null,
}: VincularEstudianteDialogProps) {
  const queryClient = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [estudiante, setEstudiante] = useState<Estudiante | null>(null)
  const [tutorId, setTutorId] = useState('')
  const [parentesco, setParentesco] = useState('')
  const [esPrincipal, setEsPrincipal] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => setBusquedaAplicada(busqueda.trim()),
      RETRASO_BUSQUEDA,
    )
    return () => window.clearTimeout(temporizador)
  }, [busqueda])

  // Si el diálogo se abre desde la fila de un tutor, ese tutor viene elegido.
  const tutorIdEfectivo = tutorId || (tutorInicial ? String(tutorInicial.usuario_id) : '')

  const resultados = useQuery({
    queryKey: ['estudiantes', 'busqueda', busquedaAplicada],
    queryFn: ({ signal }) =>
      listarEstudiantes({ q: busquedaAplicada, limit: 8 }, signal),
    enabled: abierto && estudiante === null && busquedaAplicada.length >= 2,
  })

  const tutores = useQuery({
    queryKey: ['tutores', 'todos'],
    queryFn: ({ signal }) => listarTodosLosTutores(signal),
    enabled: abierto,
    staleTime: 10 * 60_000,
  })

  const tutoresOrdenados = [...(tutores.data ?? [])].sort((a, b) =>
    compararPersonas(a.usuario, b.usuario),
  )
  /** Incluye al tutor inicial mientras la lista completa todavía carga. */
  const opcionesTutores =
    tutorInicial &&
    !tutoresOrdenados.some((t) => t.usuario_id === tutorInicial.usuario_id)
      ? [tutorInicial, ...tutoresOrdenados]
      : tutoresOrdenados
  const tutorSeleccionado =
    opcionesTutores.find(
      (tutor) => tutor.usuario_id === Number(tutorIdEfectivo),
    ) ?? null

  const vincular = useMutation({
    mutationFn: async () => {
      if (!estudiante) {
        throw new Error('Selecciona un estudiante antes de continuar.')
      }
      const creada = await crearTutoria({
        estudiante_id: estudiante.usuario_id,
        tutor_id: Number(tutorIdEfectivo),
        parentesco: parentesco as Parentesco,
        es_principal: esPrincipal,
      })
      if (creada.estado === 'confirmada') return creada
      try {
        return await confirmarTutoria(
          estudiante.usuario_id,
          Number(tutorIdEfectivo),
        )
      } catch (error) {
        throw new Error(
          `El vínculo quedó pendiente de confirmación. ${mensajeDeError(error)}`,
        )
      }
    },
    onSuccess: (tutoria) => {
      toast.success('Vínculo confirmado', {
        description: `${nombreCompleto(estudiante?.usuario)} quedó vinculado a ${
          nombreCompleto(tutorSeleccionado?.usuario) || 'el tutor seleccionado'
        } como ${tutoria.parentesco}.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['tutorias'] })
      void queryClient.invalidateQueries({ queryKey: ['tutores'] })
      cerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorEnvio(mensaje)
      toast.error('No se pudo vincular al estudiante', { description: mensaje })
    },
  })

  const listaResultados = resultados.data?.data ?? []

  function cerrar() {
    setBusqueda('')
    setBusquedaAplicada('')
    setEstudiante(null)
    setTutorId('')
    setParentesco('')
    setEsPrincipal(false)
    setErrores({})
    setErrorEnvio(null)
    vincular.reset()
    onOpenChange(false)
  }

  function cambiarBusqueda(valor: string) {
    setBusqueda(valor)
    if (estudiante) setEstudiante(null)
    setErrores((previos) => ({ ...previos, estudiante: undefined }))
    setErrorEnvio(null)
  }

  function seleccionarEstudiante(item: Estudiante) {
    setEstudiante(item)
    setBusqueda(nombreCompleto(item.usuario))
    setBusquedaAplicada('')
    setErrores((previos) => ({ ...previos, estudiante: undefined }))
  }

  function quitarEstudiante() {
    setEstudiante(null)
    setBusqueda('')
    setBusquedaAplicada('')
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const encontrados: Errores = {}
    if (!estudiante) {
      encontrados.estudiante = 'Selecciona un estudiante de los resultados.'
    }
    if (!tutorIdEfectivo) encontrados.tutorId = 'Selecciona el tutor.'
    if (!parentesco) encontrados.parentesco = 'Selecciona el parentesco.'

    setErrores(encontrados)
    setErrorEnvio(null)
    if (Object.keys(encontrados).length > 0) return
    vincular.mutate()
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
          <DialogTitle>Vincular estudiante a un tutor</DialogTitle>
          <DialogDescription>
            Busca al estudiante, elige al tutor y define el parentesco. El
            vínculo se confirma automáticamente porque lo autoriza el Director.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={enviar} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="vincular-busqueda">Estudiante</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="vincular-busqueda"
                value={busqueda}
                onChange={(evento) => cambiarBusqueda(evento.target.value)}
                placeholder="Busca por nombres, apellidos o CI…"
                autoComplete="off"
                aria-invalid={Boolean(errores.estudiante)}
                className="h-10 pr-3 pl-9 text-base md:text-base"
              />
            </div>

            {estudiante ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {nombreCompleto(estudiante.usuario)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CI {estudiante.usuario?.ci ?? '—'}
                    {estudiante.curso
                      ? ` · ${etiquetaCurso(estudiante.curso)}`
                      : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={quitarEstudiante}
                  aria-label="Quitar estudiante seleccionado"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ) : busquedaAplicada.length < 2 ? (
              <p className="text-xs text-muted-foreground">
                Escribe al menos 2 caracteres para buscar.
              </p>
            ) : resultados.isFetching ? (
              <p className="text-xs text-muted-foreground">Buscando…</p>
            ) : resultados.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {mensajeDeError(resultados.error)}
              </p>
            ) : listaResultados.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No se encontraron estudiantes con ese criterio.
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {listaResultados.map((item) => (
                  <li key={item.usuario_id} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => seleccionarEstudiante(item)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {nombreCompleto(item.usuario)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          CI {item.usuario?.ci ?? '—'}
                          {item.curso ? ` · ${etiquetaCurso(item.curso)}` : ''}
                        </span>
                      </span>
                      <UserPlus
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {errores.estudiante ? (
              <p className="text-sm text-destructive" role="alert">
                {errores.estudiante}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="vincular-tutor">Tutor</Label>
              <Select
                id="vincular-tutor"
                value={tutorIdEfectivo}
                onChange={(evento) => {
                  setTutorId(evento.target.value)
                  setErrores((previos) => ({ ...previos, tutorId: undefined }))
                  setErrorEnvio(null)
                }}
                aria-invalid={Boolean(errores.tutorId)}
                disabled={tutores.isLoading}
              >
                <option value="">
                  {tutores.isLoading
                    ? 'Cargando tutores…'
                    : 'Selecciona un tutor'}
                </option>
                {opcionesTutores.map((tutor) => (
                  <option key={tutor.usuario_id} value={tutor.usuario_id}>
                    {nombreCompleto(tutor.usuario) ||
                      `Tutor #${tutor.usuario_id}`}{' '}
                    · {tutor.usuario?.ci ?? 'sin CI'}
                  </option>
                ))}
              </Select>
              {errores.tutorId ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.tutorId}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="vincular-parentesco">Parentesco</Label>
              <Select
                id="vincular-parentesco"
                value={parentesco}
                onChange={(evento) => {
                  setParentesco(evento.target.value)
                  setErrores((previos) => ({
                    ...previos,
                    parentesco: undefined,
                  }))
                  setErrorEnvio(null)
                }}
                aria-invalid={Boolean(errores.parentesco)}
              >
                <option value="">Selecciona el parentesco</option>
                {PARENTESCOS.map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </Select>
              {errores.parentesco ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.parentesco}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Checkbox
              id="vincular-principal"
              checked={esPrincipal}
              onChange={(evento) => setEsPrincipal(evento.target.checked)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="vincular-principal">Es tutor principal</Label>
              <p className="text-xs text-muted-foreground">
                Si lo marcas, se desmarca el tutor principal anterior del
                estudiante.
              </p>
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              El vínculo se guarda como{' '}
              <strong className="font-semibold text-foreground">
                confirmada
              </strong>{' '}
              y queda registrado a nombre del Director.
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
              disabled={vincular.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={vincular.isPending}>
              {vincular.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus aria-hidden="true" />
              )}
              {vincular.isPending ? 'Vinculando…' : 'Vincular estudiante'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
