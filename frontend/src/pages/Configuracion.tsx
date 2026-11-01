import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  Info,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaHora } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  actualizarParametrosAsistencia,
  obtenerParametrosAsistencia,
  type ParametroAsistencia,
  type ParametroAsistenciaUpdate,
} from '@/services/configuracion'

const CLAVE = ['configuracion', 'parametros-asistencia'] as const

interface Formulario {
  tolerancia_min: string
  limite_falta_min: string
  umbral_alerta_faltas: string
  umbral_alerta_tardanzas: string
  umbral_inasistencia_pct: string
}

type Errores = Partial<Record<keyof Formulario, string>>

const FORMULARIO_VACIO: Formulario = {
  tolerancia_min: '',
  limite_falta_min: '',
  umbral_alerta_faltas: '',
  umbral_alerta_tardanzas: '',
  umbral_inasistencia_pct: '',
}

function aFormulario(parametros: ParametroAsistencia): Formulario {
  return {
    tolerancia_min: String(parametros.tolerancia_min),
    limite_falta_min: String(parametros.limite_falta_min),
    umbral_alerta_faltas: String(parametros.umbral_alerta_faltas),
    umbral_alerta_tardanzas: String(parametros.umbral_alerta_tardanzas),
    umbral_inasistencia_pct: String(parametros.umbral_inasistencia_pct),
  }
}

function numero(valor: string): number {
  return Number(valor.replace(',', '.'))
}

function validar(formulario: Formulario): {
  errores: Errores
  datos?: ParametroAsistenciaUpdate
} {
  const errores: Errores = {}
  const tolerancia = numero(formulario.tolerancia_min)
  const limite = numero(formulario.limite_falta_min)
  const faltas = numero(formulario.umbral_alerta_faltas)
  const tardanzas = numero(formulario.umbral_alerta_tardanzas)
  const porcentaje = numero(formulario.umbral_inasistencia_pct)

  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 240) {
    errores.tolerancia_min =
      'Ingresa un número entero entre 0 y 240 minutos.'
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > 480) {
    errores.limite_falta_min =
      'Ingresa un número entero entre 1 y 480 minutos.'
  } else if (!errores.tolerancia_min && limite <= tolerancia) {
    errores.limite_falta_min =
      'El límite de falta debe ser mayor que la tolerancia.'
  }
  if (!Number.isInteger(faltas) || faltas < 1 || faltas > 100) {
    errores.umbral_alerta_faltas =
      'Ingresa un número entero entre 1 y 100 faltas.'
  }
  if (!Number.isInteger(tardanzas) || tardanzas < 1 || tardanzas > 100) {
    errores.umbral_alerta_tardanzas =
      'Ingresa un número entero entre 1 y 100 tardanzas.'
  }
  if (
    !Number.isFinite(porcentaje) ||
    porcentaje < 0 ||
    porcentaje > 100
  ) {
    errores.umbral_inasistencia_pct =
      'Ingresa un porcentaje entre 0 y 100.'
  }

  if (Object.keys(errores).length > 0) return { errores }

  return {
    errores,
    datos: {
      tolerancia_min: tolerancia,
      limite_falta_min: limite,
      umbral_alerta_faltas: faltas,
      umbral_alerta_tardanzas: tardanzas,
      umbral_inasistencia_pct: porcentaje,
    },
  }
}

interface CampoNumeroProps {
  id: keyof Formulario
  etiqueta: string
  descripcion: string
  sufijo: string
  valor: string
  error?: string
  min: number
  max: number
  step?: number
  onCambiar: (valor: string) => void
}

function CampoNumero({
  id,
  etiqueta,
  descripcion,
  sufijo,
  valor,
  error,
  min,
  max,
  step = 1,
  onCambiar,
}: CampoNumeroProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode={step === 1 ? 'numeric' : 'decimal'}
          min={min}
          max={max}
          step={step}
          value={valor}
          onChange={(evento) => onCambiar(evento.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-ayuda`}
          className={cn(
            'h-10 pr-20 text-base tabular-nums md:text-base',
            error && 'border-destructive',
          )}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {sufijo}
        </span>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {descripcion}
        </p>
      )}
    </div>
  )
}

function CargandoFormulario() {
  return (
    <Card className="[--card-spacing:--spacing(6)] shadow-sm" role="status">
      <CardHeader>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, indice) => (
          <div key={indice} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function Configuracion() {
  const queryClient = useQueryClient()
  const [formularioEditado, setFormularioEditado] =
    useState<Formulario | null>(null)
  const [errores, setErrores] = useState<Errores>({})

  const consulta = useQuery({
    queryKey: CLAVE,
    queryFn: ({ signal }) => obtenerParametrosAsistencia(signal),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const guardar = useMutation({
    mutationFn: (datos: ParametroAsistenciaUpdate) =>
      actualizarParametrosAsistencia(datos),
    onSuccess: (parametros) => {
      queryClient.setQueryData(CLAVE, parametros)
      setFormularioEditado(aFormulario(parametros))
      setErrores({})
      toast.success('Configuración de asistencia actualizada', {
        description:
          'Los nuevos valores se aplicarán a los próximos registros y alertas.',
      })
    },
    onError: (error) => {
      toast.error('No se pudo guardar la configuración', {
        description: mensajeDeError(error),
      })
    },
  })

  const datosActuales = consulta.data
  const formulario =
    formularioEditado ??
    (datosActuales ? aFormulario(datosActuales) : FORMULARIO_VACIO)
  const toleranciaVista = numero(formulario.tolerancia_min)
  const limiteVista = numero(formulario.limite_falta_min)

  const resumenReglas = useMemo(() => {
    if (!Number.isFinite(toleranciaVista) || !Number.isFinite(limiteVista)) {
      return null
    }
    return {
      presente: `Hasta ${toleranciaVista} min`,
      tardanza:
        limiteVista > toleranciaVista
          ? `De ${toleranciaVista + 1} a ${limiteVista} min`
          : 'Revisa las tolerancias',
      falta: `Más de ${limiteVista} min o sin registro`,
    }
  }, [toleranciaVista, limiteVista])

  function cambiarCampo(campo: keyof Formulario, valor: string) {
    setFormularioEditado({ ...formulario, [campo]: valor })
    setErrores((anteriores) => ({ ...anteriores, [campo]: undefined }))
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const resultado = validar(formulario)
    setErrores(resultado.errores)
    if (!resultado.datos) return
    guardar.mutate(resultado.datos)
  }

  function descartar() {
    setFormularioEditado(null)
    setErrores({})
  }

  const hayCambios =
    datosActuales !== undefined &&
    JSON.stringify(aFormulario(datosActuales)) !== JSON.stringify(formulario)

  return (
    <DashboardShell seccion="Configuración">
      <PageHeader
        titulo="Configuración de asistencia"
        descripcion="Define las tolerancias con las que se clasifica la asistencia y los umbrales que generan alertas para el Director y los tutores."
        icono={Settings}
        acciones={
          <>
            {datosActuales ? (
              <Badge variant="muted" className="h-8 px-3 text-sm">
                Actualizado{' '}
                {formatearFechaHora(datosActuales.actualizado_en)}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void consulta.refetch()}
              disabled={consulta.isFetching || guardar.isPending}
            >
              <RefreshCw
                className={cn('size-4', consulta.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              Recargar
            </Button>
          </>
        }
      />

      {consulta.isLoading ? <CargandoFormulario /> : null}

      {consulta.isError && !datosActuales ? (
        <Card className="border-destructive/30 bg-destructive/5 [--card-spacing:--spacing(6)]">
          <CardContent className="flex flex-wrap items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">
                No se pudo cargar la configuración
              </p>
              <p className="text-base text-muted-foreground">
                {mensajeDeError(consulta.error)}
              </p>
            </div>
            <Button type="button" onClick={() => void consulta.refetch()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {datosActuales ? (
        <form
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
          onSubmit={enviar}
          noValidate
        >
          <div className="space-y-6">
            <Card className="[--card-spacing:--spacing(6)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Clock3 className="size-5 text-primary" aria-hidden="true" />
                  Tiempos de clasificación
                </CardTitle>
                <CardDescription>
                  El minuto de ingreso se calcula desde el inicio del bloque de
                  clase. Un segundo de retraso ya cuenta como minuto completo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <CampoNumero
                  id="tolerancia_min"
                  etiqueta="Minutos de tolerancia"
                  descripcion="Hasta este retraso el estudiante queda como presente."
                  sufijo="min"
                  valor={formulario.tolerancia_min}
                  error={errores.tolerancia_min}
                  min={0}
                  max={240}
                  onCambiar={(valor) => cambiarCampo('tolerancia_min', valor)}
                />
                <CampoNumero
                  id="limite_falta_min"
                  etiqueta="Minutos para considerar falta"
                  descripcion="Superado este límite, el registro pasa a falta."
                  sufijo="min"
                  valor={formulario.limite_falta_min}
                  error={errores.limite_falta_min}
                  min={1}
                  max={480}
                  onCambiar={(valor) => cambiarCampo('limite_falta_min', valor)}
                />
              </CardContent>
            </Card>

            <Card className="[--card-spacing:--spacing(6)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShieldAlert
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  Umbrales de alerta
                </CardTitle>
                <CardDescription>
                  Al alcanzar estos acumulados se generan alertas para el
                  seguimiento del estudiante.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <CampoNumero
                  id="umbral_alerta_faltas"
                  etiqueta="Umbral de faltas"
                  descripcion="Faltas acumuladas antes de generar una alerta."
                  sufijo="faltas"
                  valor={formulario.umbral_alerta_faltas}
                  error={errores.umbral_alerta_faltas}
                  min={1}
                  max={100}
                  onCambiar={(valor) =>
                    cambiarCampo('umbral_alerta_faltas', valor)
                  }
                />
                <CampoNumero
                  id="umbral_alerta_tardanzas"
                  etiqueta="Umbral de tardanzas"
                  descripcion="Tardanzas acumuladas antes de generar una alerta."
                  sufijo="tardanzas"
                  valor={formulario.umbral_alerta_tardanzas}
                  error={errores.umbral_alerta_tardanzas}
                  min={1}
                  max={100}
                  onCambiar={(valor) =>
                    cambiarCampo('umbral_alerta_tardanzas', valor)
                  }
                />
              </CardContent>
            </Card>

            <Card className="[--card-spacing:--spacing(6)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CalendarClock
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  Inasistencia por curso
                </CardTitle>
                <CardDescription>
                  Porcentaje de faltas sobre los registros del periodo que se
                  usa para marcar un curso en riesgo en el panel.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-w-md">
                <CampoNumero
                  id="umbral_inasistencia_pct"
                  etiqueta="Porcentaje de inasistencia"
                  descripcion="El curso supera el umbral cuando lo excede."
                  sufijo="%"
                  valor={formulario.umbral_inasistencia_pct}
                  error={errores.umbral_inasistencia_pct}
                  min={0}
                  max={100}
                  step={0.5}
                  onCambiar={(valor) =>
                    cambiarCampo('umbral_inasistencia_pct', valor)
                  }
                />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={descartar}
                disabled={!hayCambios || guardar.isPending}
              >
                <Undo2 aria-hidden="true" />
                Descartar cambios
              </Button>
              <Button
                type="submit"
                className="h-10"
                disabled={guardar.isPending || !hayCambios}
              >
                {guardar.isPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save aria-hidden="true" />
                )}
                Guardar configuración
              </Button>
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="border-primary/20 bg-primary/5 [--card-spacing:--spacing(5)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="size-4 text-primary" aria-hidden="true" />
                  Cómo se aplicará
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {resumenReglas ? (
                  <div className="space-y-2">
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Presente</span>
                      <span className="font-medium">
                        {resumenReglas.presente}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Tardanza</span>
                      <span className="font-medium">
                        {resumenReglas.tardanza}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Falta</span>
                      <span className="text-right font-medium">
                        {resumenReglas.falta}
                      </span>
                    </p>
                  </div>
                ) : null}

                <Separator />

                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Las alertas de faltas y tardanzas se calculan por
                    estudiante. La inasistencia se compara por curso.
                  </p>
                  <p>
                    Los cambios no alteran registros ya guardados; solo se usan
                    en los próximos escaneos o cierres de bloque.
                  </p>
                </div>

                {datosActuales.actualizado_por ? (
                  <p className="text-xs text-muted-foreground">
                    Última edición por el usuario #
                    {datosActuales.actualizado_por}.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </form>
      ) : null}
    </DashboardShell>
  )
}
