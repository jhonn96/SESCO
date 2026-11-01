import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarPlus,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmarEliminacionDialog } from '@/components/ConfirmarEliminacionDialog'
import { DashboardShell } from '@/components/DashboardShell'
import { EditarHorarioDialog } from '@/components/EditarHorarioDialog'
import { NuevoHorarioDialog } from '@/components/NuevoHorarioDialog'
import { PageHeader } from '@/components/PageHeader'
import { TablaEstado } from '@/components/TablaEstado'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { compararCursos, etiquetaCurso, nombreTurno } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { formatearFechaLarga, hoyIso } from '@/lib/fechas'
import { DIAS_SEMANA, type DiaSemana } from '@/lib/horarios'
import { cn } from '@/lib/utils'
import { listarCursos } from '@/services/cursos'
import {
  eliminarHorario,
  listarHorarios,
  type Horario,
} from '@/services/horarios'

/** Minutos transcurridos desde la medianoche; sirve para comparar horas. */
function aMinutos(hora: string): number {
  const [horas, minutos] = hora.split(':').map(Number)
  return horas * 60 + minutos
}

function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

/** Paleta pastel: cada materia conserva su color en toda la matriz. */
const PALETA_MATERIAS = [
  'border-sky-200 bg-sky-50 text-sky-950',
  'border-violet-200 bg-violet-50 text-violet-950',
  'border-emerald-200 bg-emerald-50 text-emerald-950',
  'border-rose-200 bg-rose-50 text-rose-950',
  'border-amber-200 bg-amber-50 text-amber-950',
  'border-teal-200 bg-teal-50 text-teal-950',
  'border-indigo-200 bg-indigo-50 text-indigo-950',
  'border-lime-200 bg-lime-50 text-lime-950',
] as const

function colorMateria(materiaId: number): string {
  return PALETA_MATERIAS[Math.abs(materiaId) % PALETA_MATERIAS.length]
}

/** Hueco mínimo entre bloques para dibujar la fila de receso. */
const MINUTOS_RECESO = 10

interface Franja {
  clave: string
  inicio: string
  fin: string
}

type FilaMatriz =
  | { tipo: 'clase'; franja: Franja }
  | { tipo: 'receso'; clave: string; desde: string; hasta: string }

/**
 * Horario semanal de un curso: filas por franja horaria y columnas de lunes a
 * viernes. La edición y la baja se hacen desde los botones de cada bloque.
 */
export function Horarios() {
  const queryClient = useQueryClient()
  const [cursoSeleccionadoId, setCursoSeleccionadoId] = useState<
    number | undefined
  >()
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [horarioAEditar, setHorarioAEditar] = useState<Horario | null>(null)
  const [horarioAEliminar, setHorarioAEliminar] = useState<Horario | null>(
    null,
  )

  const cursos = useQuery({
    queryKey: ['cursos', 'lista'],
    queryFn: ({ signal }) => listarCursos(signal),
    staleTime: 10 * 60_000,
  })

  const cursosOrdenados = useMemo(
    () => [...(cursos.data ?? [])].sort(compararCursos),
    [cursos.data],
  )

  // Sin elección explícita se muestra el primer curso del listado.
  const cursoId = cursoSeleccionadoId ?? cursosOrdenados[0]?.id

  const cursoSeleccionado =
    cursosOrdenados.find((curso) => curso.id === cursoId) ?? null

  const consulta = useQuery({
    queryKey: ['horarios', 'curso', cursoId],
    queryFn: ({ signal }) => listarHorarios(cursoId as number, signal),
    enabled: cursoId !== undefined,
  })

  const bloques = useMemo(() => consulta.data ?? [], [consulta.data])

  const diasConCierre = useMemo<DiaSemana[]>(
    () => [
      ...new Set(
        bloques
          .filter((bloque) => bloque.es_ultimo_bloque)
          .map((bloque) => bloque.dia_semana),
      ),
    ],
    [bloques],
  )

  // Franjas únicas (inicio, fin) de toda la semana, en orden cronológico.
  const franjas = useMemo<Franja[]>(() => {
    const unicas = new Map<string, Franja>()
    for (const bloque of bloques) {
      const clave = `${bloque.hora_inicio}-${bloque.hora_fin}`
      if (!unicas.has(clave)) {
        unicas.set(clave, {
          clave,
          inicio: bloque.hora_inicio,
          fin: bloque.hora_fin,
        })
      }
    }
    return [...unicas.values()].sort(
      (a, b) => a.inicio.localeCompare(b.inicio) || a.fin.localeCompare(b.fin),
    )
  }, [bloques])

  // Celdas indexadas por día + franja para resolver cada intersección.
  const celdas = useMemo(() => {
    const mapa = new Map<string, Horario>()
    for (const bloque of bloques) {
      mapa.set(
        `${bloque.dia_semana}|${bloque.hora_inicio}|${bloque.hora_fin}`,
        bloque,
      )
    }
    return mapa
  }, [bloques])

  // Hora de ingreso: el primer bloque de cada día.
  const ingresoPorDia = useMemo(() => {
    const resultado: Record<string, string | null> = {}
    for (const dia of DIAS_SEMANA) {
      const delDia = bloques.filter(
        (bloque) => bloque.dia_semana === dia.valor,
      )
      resultado[dia.valor] =
        delDia.length > 0
          ? delDia.reduce(
              (minimo, bloque) =>
                aMinutos(bloque.hora_inicio) < aMinutos(minimo)
                  ? bloque.hora_inicio
                  : minimo,
              delDia[0].hora_inicio,
            )
          : null
    }
    return resultado
  }, [bloques])

  // Filas de la matriz, con una fila de receso cuando hay un hueco ≥ 10 min.
  const filas = useMemo<FilaMatriz[]>(() => {
    const resultado: FilaMatriz[] = []
    let anterior: Franja | null = null
    for (const franja of franjas) {
      if (
        anterior &&
        aMinutos(franja.inicio) - aMinutos(anterior.fin) >= MINUTOS_RECESO
      ) {
        resultado.push({
          tipo: 'receso',
          clave: `receso-${anterior.fin}-${franja.inicio}`,
          desde: anterior.fin,
          hasta: franja.inicio,
        })
      }
      resultado.push({ tipo: 'clase', franja })
      anterior = franja
    }
    return resultado
  }, [franjas])

  const eliminar = useMutation({
    mutationFn: (horario: Horario) => eliminarHorario(horario.id),
    onSuccess: (_datos, horario) => {
      toast.success('Bloque eliminado', {
        description: `${horario.materia?.nombre ?? 'Materia'} · ${horaCorta(
          horario.hora_inicio,
        )}–${horaCorta(horario.hora_fin)}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['horarios'] })
      setHorarioAEliminar(null)
    },
    onError: (error) => {
      toast.error('No se pudo eliminar el bloque', {
        description: mensajeDeError(error),
      })
    },
  })

  const cargando =
    cursos.isLoading || (cursoId !== undefined && consulta.isLoading)
  const errorTabla = cursos.isError
    ? mensajeDeError(cursos.error)
    : consulta.isError
      ? mensajeDeError(consulta.error)
      : null
  const sinDatos = !cargando && !errorTabla && bloques.length === 0
  const mostrarMatriz = !cargando && bloques.length > 0

  function reintentar() {
    if (cursos.isError) void cursos.refetch()
    if (consulta.isError) void consulta.refetch()
  }

  function imprimir() {
    if (!cursoSeleccionado || bloques.length === 0) return
    window.print()
  }

  return (
    <DashboardShell seccion="Horarios">
      <div className="print:hidden">
        <PageHeader
          titulo="Horarios"
          descripcion="Grilla semanal por curso. No puede haber dos materias a la misma hora del mismo día y cada día admite un único bloque de cierre de jornada."
          icono={CalendarClock}
          acciones={
            <>
              {consulta.data ? (
                <Badge variant="info" className="h-8 px-3 text-sm">
                  {bloques.length}{' '}
                  {bloques.length === 1 ? 'bloque' : 'bloques'}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={imprimir}
                disabled={!cursoSeleccionado || bloques.length === 0}
              >
                <Printer aria-hidden="true" />
                Imprimir Horario
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => void consulta.refetch()}
                disabled={consulta.isFetching || !cursoSeleccionado}
              >
                <RefreshCw
                  className={cn(
                    'size-4',
                    consulta.isFetching && 'animate-spin',
                  )}
                  aria-hidden="true"
                />
                Actualizar
              </Button>
              <Button
                type="button"
                className="h-10"
                onClick={() => setDialogoAbierto(true)}
                disabled={!cursoSeleccionado}
              >
                <CalendarPlus aria-hidden="true" />
                Añadir Bloque
              </Button>
            </>
          }
        />
      </div>

      <Card className="[--card-spacing:--spacing(4)] shadow-sm print:hidden">
        <div className="flex flex-col gap-3 px-(--card-spacing) lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-1.5 lg:max-w-sm">
            <Label htmlFor="horario-curso">Curso</Label>
            <Select
              id="horario-curso"
              value={cursoId ?? ''}
              onChange={(evento) =>
                setCursoSeleccionadoId(
                  evento.target.value ? Number(evento.target.value) : undefined,
                )
              }
              disabled={cursos.isLoading}
            >
              <option value="">
                {cursos.isLoading ? 'Cargando cursos…' : 'Selecciona un curso'}
              </option>
              {cursosOrdenados.map((curso) => (
                <option key={curso.id} value={curso.id}>
                  {etiquetaCurso(curso)} · {nombreTurno(curso.turno)}
                </option>
              ))}
            </Select>
          </div>

          <p className="text-sm text-muted-foreground">
            {cursoSeleccionado
              ? consulta.isLoading
                ? `Turno ${nombreTurno(cursoSeleccionado.turno)} · Cargando bloques…`
                : `Turno ${nombreTurno(cursoSeleccionado.turno)} · ${
                    bloques.length
                  } ${
                    bloques.length === 1
                      ? 'bloque registrado'
                      : 'bloques registrados'
                  }`
              : 'Elige un curso para consultar su horario.'}
          </p>
        </div>
      </Card>

      <Card
        className="horario-matriz-card gap-0 overflow-hidden [--card-spacing:0px] shadow-sm print:overflow-visible print:rounded-none print:shadow-none print:ring-0"
        aria-busy={consulta.isFetching}
      >
        <div className="flex flex-col gap-1 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <h2 className="text-base font-semibold">Matriz semanal</h2>
            <p className="text-sm text-muted-foreground">
              Pasa el cursor sobre un bloque para editarlo o eliminarlo.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {cursoSeleccionado
              ? `Turno ${nombreTurno(cursoSeleccionado.turno)}`
              : 'Sin curso seleccionado'}
          </p>
        </div>

        {/* Encabezado que solo aparece en la impresión. */}
        <div className="hidden px-6 pt-5 pb-4 print:block">
          <div className="flex items-end justify-between gap-8 border-b border-neutral-300 pb-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.3em] text-neutral-500 uppercase">
                SESCO · Horario de clases
              </p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {cursoSeleccionado
                  ? etiquetaCurso(cursoSeleccionado)
                  : 'Sin curso seleccionado'}
              </p>
              <p className="text-sm text-neutral-600">
                {cursoSeleccionado
                  ? `Turno ${nombreTurno(cursoSeleccionado.turno)}`
                  : ''}
                {bloques.length > 0
                  ? ` · ${bloques.length} ${
                      bloques.length === 1 ? 'bloque' : 'bloques'
                    } semanales`
                  : ''}
              </p>
            </div>
            <p className="text-right text-xs text-neutral-500">
              Impreso el {formatearFechaLarga(hoyIso())}
            </p>
          </div>
        </div>

        {consulta.isError && bloques.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive print:hidden">
            No se pudo actualizar el horario. Se muestran los últimos datos
            disponibles.
          </p>
        ) : null}

        <Table className="horario-matriz min-w-[920px]">
          <TableHeader>
            <TableRow className="border-neutral-200 hover:bg-transparent">
              <TableHead className="w-24 border-r border-amber-200 bg-amber-100 px-3 text-[11px] font-semibold tracking-wide text-amber-950 uppercase">
                Hora
              </TableHead>
              {DIAS_SEMANA.map((dia) => (
                <TableHead
                  key={dia.valor}
                  className="border-r border-amber-200 bg-amber-100 px-3 text-center text-[11px] font-semibold tracking-[0.18em] text-amber-950 uppercase last:border-r-0"
                >
                  {dia.etiqueta}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={DIAS_SEMANA.length + 1}
              cargando={cargando}
              error={errorTabla}
              onReintentar={reintentar}
              vacio={sinDatos}
              tituloVacio={
                cursoId === undefined
                  ? 'Selecciona un curso'
                  : 'Este curso no tiene bloques de horario'
              }
              descripcionVacio={
                cursoId === undefined
                  ? 'Elige un curso del listado para consultar su matriz semanal.'
                  : 'Usa «Añadir Bloque» para registrar la primera materia de la semana.'
              }
              iconoVacio={CalendarClock}
            />

            {mostrarMatriz ? (
              <>
                <TableRow className="border-neutral-200 bg-amber-50 hover:bg-amber-50">
                  <TableCell className="border-r border-neutral-200 px-3 py-2 align-middle">
                    <span className="text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
                      Hora de ingreso
                    </span>
                  </TableCell>
                  {DIAS_SEMANA.map((dia) => {
                    const ingreso = ingresoPorDia[dia.valor]
                    return (
                      <TableCell
                        key={dia.valor}
                        className="border-r border-neutral-200 px-3 py-2 text-center align-middle last:border-r-0"
                      >
                        {ingreso ? (
                          <span className="font-semibold tabular-nums text-amber-900">
                            {horaCorta(ingreso)}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>

                {filas.map((fila) =>
                  fila.tipo === 'receso' ? (
                    <TableRow
                      key={fila.clave}
                      className="border-neutral-200 bg-amber-100 hover:bg-amber-100"
                    >
                      <TableCell className="border-r border-neutral-200 px-3 py-2 align-middle text-xs font-semibold tabular-nums text-amber-950">
                        {horaCorta(fila.desde)}–{horaCorta(fila.hasta)}
                      </TableCell>
                      <TableCell
                        colSpan={DIAS_SEMANA.length}
                        className="px-3 py-2 text-center text-[11px] font-semibold tracking-[0.35em] text-amber-900/80 uppercase"
                      >
                        Receso
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow
                      key={fila.franja.clave}
                      className="border-neutral-200 hover:bg-neutral-50"
                    >
                      <TableCell className="border-r border-neutral-200 bg-neutral-100 px-3 py-2 align-middle">
                        <span className="block text-xs font-semibold tabular-nums text-neutral-900">
                          {horaCorta(fila.franja.inicio)}
                        </span>
                        <span className="block text-[11px] tabular-nums text-neutral-500">
                          {horaCorta(fila.franja.fin)}
                        </span>
                      </TableCell>

                      {DIAS_SEMANA.map((dia) => {
                        const bloque = celdas.get(
                          `${dia.valor}|${fila.franja.inicio}|${fila.franja.fin}`,
                        )
                        if (!bloque) {
                          return (
                            <TableCell
                              key={dia.valor}
                              className="border-r border-neutral-200 px-1.5 py-1.5 align-top last:border-r-0"
                            >
                              <span
                                className="block h-14 rounded-md border border-dashed border-neutral-300 bg-neutral-50"
                                aria-hidden="true"
                              />
                            </TableCell>
                          )
                        }

                        const materia =
                          bloque.materia?.nombre ??
                          `Materia #${bloque.materia_id}`
                        return (
                          <TableCell
                            key={dia.valor}
                            className="group relative border-r border-neutral-200 px-1.5 py-1.5 align-top last:border-r-0"
                          >
                            <div
                              className={cn(
                                'flex h-14 flex-col justify-center gap-1 rounded-md border px-2 py-1.5 shadow-xs',
                                colorMateria(bloque.materia_id),
                              )}
                              title={`${materia} · ${dia.etiqueta} ${horaCorta(
                                bloque.hora_inicio,
                              )}–${horaCorta(bloque.hora_fin)}`}
                            >
                              <p className="line-clamp-2 text-[13px] leading-tight font-semibold">
                                {materia}
                              </p>
                              {bloque.es_ultimo_bloque ? (
                                <span className="text-[9px] font-semibold tracking-wide uppercase opacity-70">
                                  Cierre de jornada
                                </span>
                              ) : null}
                            </div>

                            <div className="absolute top-2 right-2 flex gap-0.5 rounded-md bg-background/90 p-0.5 opacity-0 shadow-sm ring-1 ring-border transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 print:hidden">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Editar ${materia} (${dia.etiqueta} ${horaCorta(bloque.hora_inicio)}–${horaCorta(bloque.hora_fin)})`}
                                title="Editar bloque"
                                onClick={() => setHorarioAEditar(bloque)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Eliminar ${materia} (${dia.etiqueta} ${horaCorta(bloque.hora_inicio)}–${horaCorta(bloque.hora_fin)})`}
                                title="Eliminar bloque"
                                onClick={() => setHorarioAEliminar(bloque)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ),
                )}
              </>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      <NuevoHorarioDialog
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        curso={cursoSeleccionado}
        diasConCierre={diasConCierre}
      />

      {horarioAEditar ? (
        <EditarHorarioDialog
          key={horarioAEditar.id}
          abierto
          onOpenChange={(abierto) => {
            if (!abierto) setHorarioAEditar(null)
          }}
          horario={horarioAEditar}
          curso={cursoSeleccionado}
          diasConCierre={diasConCierre}
        />
      ) : null}

      <ConfirmarEliminacionDialog
        abierto={horarioAEliminar !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !eliminar.isPending) setHorarioAEliminar(null)
        }}
        titulo="Eliminar bloque de horario"
        textoConfirmar="Eliminar bloque"
        pendiente={eliminar.isPending}
        descripcion={
          horarioAEliminar ? (
            <>
              ¿Seguro que quieres eliminar{' '}
              <strong>
                {horarioAEliminar.materia?.nombre ?? 'este bloque'}
              </strong>{' '}
              ({horaCorta(horarioAEliminar.hora_inicio)}–
              {horaCorta(horarioAEliminar.hora_fin)})? Esta acción no se puede
              deshacer. Si ya tiene asistencias registradas, el sistema
              impedirá la baja.
            </>
          ) : null
        }
        onConfirmar={() => {
          if (horarioAEliminar) eliminar.mutate(horarioAEliminar)
        }}
      />
    </DashboardShell>
  )
}
