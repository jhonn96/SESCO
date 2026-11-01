import { useState, type FormEvent } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { LoaderCircle, Megaphone, RefreshCw, Send, Star, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { TablaPaginacion } from '@/components/TablaPaginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaHora } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  crearAviso,
  listarAvisos,
  type TipoAviso,
} from '@/services/avisos'

const TAMANO = 8

const TIPOS: { valor: TipoAviso; etiqueta: string; variante: 'info' | 'warning' | 'destructive' }[] = [
  { valor: 'general', etiqueta: 'General', variante: 'info' },
  { valor: 'citacion', etiqueta: 'Citación', variante: 'warning' },
  { valor: 'urgente', etiqueta: 'Urgente', variante: 'destructive' },
]

const ESTILO_TIPO: Record<TipoAviso, { etiqueta: string; variante: 'info' | 'warning' | 'destructive' }> = {
  general: TIPOS[0],
  citacion: TIPOS[1],
  urgente: TIPOS[2],
}

const FORMATO = new Intl.NumberFormat('es-BO')

interface ErroresFormulario {
  titulo?: string
  contenido?: string
  fechaCita?: string
}

function porcentajeLectura(leidos: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((leidos / total) * 100)
}

export function Comunicados() {
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [tipo, setTipo] = useState<TipoAviso>('general')
  const [importante, setImportante] = useState(false)
  const [fechaCita, setFechaCita] = useState('')
  const [errores, setErrores] = useState<ErroresFormulario>({})
  const [pagina, setPagina] = useState(0)

  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: ['avisos', { pagina, tamano: TAMANO }],
    queryFn: ({ signal }) =>
      listarAvisos({ skip: pagina * TAMANO, limit: TAMANO }, signal),
    placeholderData: keepPreviousData,
  })

  const avisos = consulta.data?.data ?? []
  const total = consulta.data?.total ?? 0
  const cargando = consulta.isLoading
  const sinDatos = avisos.length === 0 && !cargando && !consulta.isError

  const publicar = useMutation({
    mutationFn: crearAviso,
    onSuccess: (aviso) => {
      toast.success('Comunicado publicado', {
        description: `“${aviso.titulo}” fue enviado a ${FORMATO.format(aviso.total_destinatarios)} destinatarios.`,
      })
      setTitulo('')
      setContenido('')
      setTipo('general')
      setImportante(false)
      setFechaCita('')
      setErrores({})
      setPagina(0)
      queryClient.invalidateQueries({ queryKey: ['avisos'] })
    },
    onError: (error) =>
      toast.error('No se pudo publicar el comunicado', {
        description: mensajeDeError(error),
      }),
  })

  function validar(): boolean {
    const nuevos: ErroresFormulario = {}
    if (titulo.trim().length < 3) {
      nuevos.titulo = 'El título debe tener al menos 3 caracteres.'
    }
    if (contenido.trim().length < 10) {
      nuevos.contenido = 'El contenido debe tener al menos 10 caracteres.'
    }
    if (tipo === 'citacion' && !fechaCita) {
      nuevos.fechaCita = 'Una citación requiere fecha y hora.'
    }
    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!validar()) return

    publicar.mutate({
      titulo: titulo.trim(),
      contenido: contenido.trim(),
      tipo,
      importante,
      ...(tipo === 'citacion' && fechaCita
        ? { fecha_cita: new Date(fechaCita).toISOString() }
        : {}),
    })
  }

  return (
    <DashboardShell seccion="Comunicados">
      <PageHeader
        titulo="Comunicados"
        descripcion="Publica avisos para tutores y profesores, y revisa cuántos destinatarios ya los leyeron."
        icono={Megaphone}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {total} {total === 1 ? 'comunicado' : 'comunicados'}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void consulta.refetch()}
              disabled={consulta.isFetching}
            >
              <RefreshCw
                className={cn('size-4', consulta.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </>
        }
      />

      <Card className="[--card-spacing:--spacing(6)] shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Nuevo comunicado</CardTitle>
          <CardDescription className="text-base">
            Sin destinatarios específicos, el aviso se difunde a todos los
            tutores y profesores activos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={enviar} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="aviso-titulo">Título</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {titulo.length}/120
                  </span>
                </div>
                <Input
                  id="aviso-titulo"
                  value={titulo}
                  maxLength={120}
                  onChange={(evento) => {
                    setTitulo(evento.target.value)
                    setErrores((previos) => ({ ...previos, titulo: undefined }))
                  }}
                  placeholder="Ej.: Reunión de padres de familia"
                  aria-invalid={Boolean(errores.titulo)}
                  className="h-10 text-base md:text-base"
                />
                {errores.titulo ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errores.titulo}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="aviso-tipo">Tipo</Label>
                <Select
                  id="aviso-tipo"
                  value={tipo}
                  onChange={(evento) => {
                    setTipo(evento.target.value as TipoAviso)
                    setErrores((previos) => ({ ...previos, fechaCita: undefined }))
                  }}
                >
                  {TIPOS.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {tipo === 'citacion' ? (
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="aviso-fecha-cita">Fecha y hora de la citación</Label>
                <Input
                  id="aviso-fecha-cita"
                  type="datetime-local"
                  value={fechaCita}
                  onChange={(evento) => {
                    setFechaCita(evento.target.value)
                    setErrores((previos) => ({ ...previos, fechaCita: undefined }))
                  }}
                  aria-invalid={Boolean(errores.fechaCita)}
                  className="h-10 text-base md:text-base"
                />
                {errores.fechaCita ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errores.fechaCita}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="aviso-contenido">Contenido</Label>
              <Textarea
                id="aviso-contenido"
                value={contenido}
                onChange={(evento) => {
                  setContenido(evento.target.value)
                  setErrores((previos) => ({ ...previos, contenido: undefined }))
                }}
                rows={4}
                placeholder="Escribe el detalle del comunicado…"
                aria-invalid={Boolean(errores.contenido)}
                className="min-h-28 text-base"
              />
              {errores.contenido ? (
                <p className="text-sm text-destructive" role="alert">
                  {errores.contenido}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Mínimo 10 caracteres. {contenido.length} escritos.
                </p>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <Checkbox
                id="aviso-importante"
                checked={importante}
                onChange={(evento) => setImportante(evento.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="aviso-importante">Marcar como importante</Label>
                <p className="text-sm text-muted-foreground">
                  Se resalta con una estrella en la bandeja de tutores y
                  profesores.
                </p>
              </div>
            </div>

            {publicar.isError ? (
              <p
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {mensajeDeError(publicar.error)}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <p className="text-sm text-muted-foreground">
                Los avisos se publican de inmediato y quedan registrados en la
                bitácora.
              </p>
              <Button type="submit" className="h-10" disabled={publicar.isPending}>
                {publicar.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                Publicar comunicado
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        <div className="border-b border-border/70 px-4 py-4">
          <h2 className="text-xl font-semibold tracking-tight">Avisos publicados</h2>
          <p className="text-sm text-muted-foreground">
            Lecturas de tutores y profesores sobre el total de destinatarios de
            cada comunicado.
          </p>
        </div>

        {consulta.isError && avisos.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar la lista. Se muestran los últimos datos
            disponibles.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4">Comunicado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Publicado</TableHead>
              <TableHead className="px-4">Lecturas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={4}
              cargando={cargando}
              error={
                consulta.isError && avisos.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio="Aún no hay comunicados publicados"
              descripcionVacio="Usa el formulario de arriba para enviar el primero a tutores y profesores."
              iconoVacio={Megaphone}
            />

            {avisos.map((aviso) => {
              const estilo = ESTILO_TIPO[aviso.tipo]
              const porcentaje = porcentajeLectura(
                aviso.leidos,
                aviso.total_destinatarios,
              )

              return (
                <TableRow key={aviso.id}>
                  <TableCell className="max-w-xl px-4 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{aviso.titulo}</p>
                      {aviso.importante ? (
                        <Badge variant="warning">
                          <Star aria-hidden="true" />
                          Importante
                        </Badge>
                      ) : null}
                    </div>
                    <p className="line-clamp-1 text-sm text-muted-foreground">
                      {aviso.contenido}
                    </p>
                    {aviso.tipo === 'citacion' && aviso.fecha_cita ? (
                      <p className="mt-1 text-xs font-medium text-primary">
                        Citación: {formatearFechaHora(aviso.fecha_cita)}
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <Badge variant={estilo.variante}>{estilo.etiqueta}</Badge>
                  </TableCell>

                  <TableCell>
                    <p className="text-sm">{formatearFechaHora(aviso.publicado_en)}</p>
                    <p className="text-xs text-muted-foreground">
                      Autor #{aviso.autor_id}
                    </p>
                  </TableCell>

                  <TableCell className="px-4">
                    {aviso.total_destinatarios > 0 ? (
                      <div className="w-44 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium tabular-nums">
                            {FORMATO.format(aviso.leidos)} de{' '}
                            {FORMATO.format(aviso.total_destinatarios)}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {porcentaje} %
                          </span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Lecturas de ${aviso.titulo}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={porcentaje}
                          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        >
                          <div
                            className="h-full rounded-full bg-success transition-[width] duration-500"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {FORMATO.format(aviso.confirmados)} confirmados
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Sin destinatarios
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <TablaPaginacion
          pagina={pagina}
          tamano={TAMANO}
          total={total}
          onCambiarPagina={setPagina}
          etiqueta="comunicados"
          deshabilitado={consulta.isFetching}
        />
      </Card>
    </DashboardShell>
  )
}
