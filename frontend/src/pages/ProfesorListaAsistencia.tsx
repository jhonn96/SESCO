import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ListChecks,
  RefreshCw,
} from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { ProfesorShell } from '@/components/ProfesorShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { compararCursos, etiquetaCortaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { hoyIso } from '@/lib/fechas'
import { DIAS_SEMANA } from '@/lib/horarios'
import { cn } from '@/lib/utils'
import type { EstadoAsistencia } from '@/services/asistencia'
import type { Curso } from '@/services/cursos'
import {
  obtenerListaAsistencia,
  obtenerMiHorario,
  obtenerMisCursos,
} from '@/services/profesores'

const LETRAS: Record<EstadoAsistencia, string> = {
  presente: 'P',
  tardanza: 'T',
  falta: 'F',
  justificada: 'J',
}

const ETIQUETAS: Record<EstadoAsistencia, string> = {
  presente: 'Presente',
  tardanza: 'Tardanza',
  falta: 'Falta',
  justificada: 'Justificada',
}

const ESTILOS: Record<EstadoAsistencia, string> = {
  presente:
    'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  tardanza:
    'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  falta:
    'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  justificada:
    'bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
}

const LEYENDA: { estado: EstadoAsistencia; color: string }[] = [
  {
    estado: 'presente',
    color: 'bg-emerald-500',
  },
  {
    estado: 'tardanza',
    color: 'bg-amber-500',
  },
  {
    estado: 'falta',
    color: 'bg-rose-500',
  },
  {
    estado: 'justificada',
    color: 'bg-sky-500',
  },
]

function mesActual(): string {
  return hoyIso().slice(0, 7)
}

function etiquetaMes(mes: string): string {
  if (!/^\d{4}-\d{2}$/.test(mes)) return mes
  const [anio, numero] = mes.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-BO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(anio, numero - 1, 1, 12))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function abreviaturaDia(dia: string): string {
  return DIAS_SEMANA.find((item) => item.valor === dia)?.abreviatura ?? dia
}

export function ProfesorListaAsistencia() {
  const [mes, setMes] = useState(mesActual)
  const [cursoSeleccionado, setCursoSeleccionado] = useState('')
  const [materiaSeleccionada, setMateriaSeleccionada] = useState('')

  const horario = useQuery({
    queryKey: ['profesor', 'mi-horario'],
    queryFn: ({ signal }) => obtenerMiHorario(signal),
    staleTime: 5 * 60_000,
  })

  const misCursos = useQuery({
    queryKey: ['profesor', 'mis-cursos'],
    queryFn: ({ signal }) => obtenerMisCursos(signal),
    staleTime: 5 * 60_000,
  })

  const cursos = useMemo(() => {
    const mapa = new Map<number, Curso>()
    for (const curso of misCursos.data ?? []) mapa.set(curso.id, curso)
    for (const bloque of horario.data ?? []) {
      if (bloque.curso) mapa.set(bloque.curso.id, bloque.curso)
    }
    return [...mapa.values()].sort(compararCursos)
  }, [misCursos.data, horario.data])

  const cursoValido = cursos.some(
    (curso) => String(curso.id) === cursoSeleccionado,
  )
    ? cursoSeleccionado
    : ''
  const cursoEfectivo = cursoValido || (cursos[0] ? String(cursos[0].id) : '')

  const materias = useMemo(() => {
    const mapa = new Map<number, string>()
    for (const bloque of horario.data ?? []) {
      if (String(bloque.curso_id) !== cursoEfectivo) continue
      if (bloque.materia) mapa.set(bloque.materia.id, bloque.materia.nombre)
    }
    return [...mapa.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [horario.data, cursoEfectivo])

  const materiaValida = materias.some(
    (materia) => String(materia.id) === materiaSeleccionada,
  )
    ? materiaSeleccionada
    : ''
  const materiaEfectiva =
    materiaValida || (materias[0] ? String(materias[0].id) : '')

  const lista = useQuery({
    queryKey: [
      'profesor',
      'lista-asistencia',
      cursoEfectivo,
      materiaEfectiva,
      mes,
    ],
    queryFn: ({ signal }) =>
      obtenerListaAsistencia(
        {
          cursoId: Number(cursoEfectivo),
          materiaId: Number(materiaEfectiva),
          mes,
        },
        signal,
      ),
    enabled: Boolean(cursoEfectivo && materiaEfectiva && mes),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  })

  const estudiantes = lista.data?.estudiantes ?? []
  const diasVisibles = useMemo(() => {
    const datos = lista.data
    if (!datos) return []

    const hoy = hoyIso()
    const fechasConRegistro = new Set<string>()
    for (const estudiante of datos.estudiantes) {
      for (const fecha of Object.keys(estudiante.estados)) {
        fechasConRegistro.add(fecha)
      }
    }

    return datos.dias.filter(
      (dia) =>
        dia.dia_semana !== 'sabado' &&
        dia.dia_semana !== 'domingo' &&
        (fechasConRegistro.has(dia.fecha) ||
          (dia.es_clase && dia.fecha >= hoy)),
    )
  }, [lista.data])
  const diasDeClase = diasVisibles.filter((dia) => dia.es_clase).length
  const cargando = lista.isLoading
  const cargandoCursos = horario.isLoading || misCursos.isLoading
  const sinCursos = !cargandoCursos && cursos.length === 0
  const sinMaterias = !cargandoCursos && cursos.length > 0 && materias.length === 0

  function refrescar() {
    void horario.refetch()
    void misCursos.refetch()
    void lista.refetch()
  }

  function cambiarCurso(valor: string) {
    setCursoSeleccionado(valor)
    setMateriaSeleccionada('')
  }

  return (
    <ProfesorShell seccion="Lista de asistencia">
      <div className="print:hidden">
        <PageHeader
          titulo="Lista de asistencia"
          descripcion="Consulta la asistencia mensual de tus cursos por materia. Cada columna representa un día de clase y cada fila un estudiante ordenado por apellidos."
          icono={ListChecks}
          acciones={
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={refrescar}
              disabled={
                !cursoEfectivo ||
                !materiaEfectiva ||
                lista.isFetching ||
                horario.isFetching ||
                misCursos.isFetching
              }
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  (lista.isFetching ||
                    horario.isFetching ||
                    misCursos.isFetching) &&
                    'animate-spin',
                )}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          }
        />
      </div>

      <Card className="p-4 print:hidden">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="curso-lista">Curso</Label>
            <Select
              id="curso-lista"
              value={cursoEfectivo}
              onChange={(event) => cambiarCurso(event.target.value)}
              disabled={cargandoCursos || cursos.length === 0}
            >
              {cursos.length === 0 ? (
                <option value="">Sin cursos asignados</option>
              ) : (
                cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {etiquetaCortaCurso(curso)}
                  </option>
                ))
              )}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="materia-lista">Materia</Label>
            <Select
              id="materia-lista"
              value={materiaEfectiva}
              onChange={(event) => setMateriaSeleccionada(event.target.value)}
              disabled={cargandoCursos || materias.length === 0}
            >
              {materias.length === 0 ? (
                <option value="">Sin materias asignadas</option>
              ) : (
                materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nombre}
                  </option>
                ))
              )}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mes-lista">Mes</Label>
            <Input
              id="mes-lista"
              type="month"
              value={mes}
              onChange={(event) =>
                setMes(event.target.value || mesActual())
              }
              className="h-10"
            />
          </div>

          <div className="flex items-end">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {LEYENDA.map((item) => (
                <span key={item.estado} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn('size-2.5 rounded-full', item.color)}
                    aria-hidden="true"
                  />
                  {LETRAS[item.estado]} = {ETIQUETAS[item.estado]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {horario.isError ? (
        <Card className="p-6">
          <div
            role="alert"
            className="flex flex-col items-start gap-3 text-sm text-destructive sm:flex-row sm:items-center"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {mensajeDeError(
                horario.error,
                'No se pudo cargar tu horario de clases.',
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void horario.refetch()}
              disabled={horario.isFetching}
            >
              Reintentar
            </Button>
          </div>
        </Card>
      ) : sinCursos ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Aún no tienes cursos asignados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando el colegio cargue tu horario, podrás consultar la lista de
            asistencia por curso y materia.
          </p>
        </Card>
      ) : sinMaterias ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">
            No hay materias asignadas para este curso
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecciona otro curso o solicita al director que complete tu
            horario.
          </p>
        </Card>
      ) : lista.isError && estudiantes.length === 0 ? (
        <Card className="p-6">
          <div
            role="alert"
            className="flex flex-col items-start gap-3 text-sm text-destructive sm:flex-row sm:items-center"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {mensajeDeError(
                lista.error,
                'No se pudo cargar la lista de asistencia.',
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void lista.refetch()}
              disabled={lista.isFetching}
            >
              Reintentar
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px] print:overflow-visible print:shadow-none print:ring-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3 text-sm print:px-1 print:py-1 print:text-[10px]">
            <span className="font-medium">
              {lista.data ? etiquetaMes(lista.data.mes) : etiquetaMes(mes)}
              {lista.data ? ` · ${lista.data.materia.nombre}` : ''}
            </span>
            <span className="text-muted-foreground">
              {estudiantes.length}{' '}
              {estudiantes.length === 1 ? 'estudiante' : 'estudiantes'} ·{' '}
              {diasDeClase} {diasDeClase === 1 ? 'día de clase' : 'días de clase'}
            </span>
          </div>

          {cargando ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, indice) => (
                <Skeleton key={indice} className="h-8 w-full" />
              ))}
              <span className="sr-only" role="status">
                Cargando lista de asistencia…
              </span>
            </div>
          ) : estudiantes.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">
                No hay estudiantes matriculados en este curso
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                La lista aparecerá cuando el curso tenga estudiantes asignados.
              </p>
            </div>
          ) : diasVisibles.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">
                No hay días de clase con asistencia registrada en este mes
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Las columnas aparecerán cuando existan registros o cuando el
                horario tenga clases programadas.
              </p>
            </div>
          ) : (
            <div className="max-h-[68vh] w-full overflow-auto print:max-h-none print:overflow-visible">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm print:w-full print:min-w-0 print:table-fixed">
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-40 min-w-56 border-r border-b border-border/70 bg-card px-4 py-3 text-left font-semibold print:static print:w-[22%] print:min-w-0 print:px-1 print:py-1 print:text-[9px]">
                      Estudiante
                    </th>
                    {diasVisibles.map((dia) => (
                      <th
                        key={dia.fecha}
                        scope="col"
                        title={`${dia.fecha} · ${dia.dia_semana}`}
                        className={cn(
                          'sticky top-0 z-30 min-w-9 border-r border-b border-border/70 px-1 py-2 text-center text-xs font-medium print:static print:min-w-0 print:px-0 print:py-1 print:text-[8px] print:leading-none',
                          dia.es_clase
                            ? 'bg-card text-foreground'
                            : 'bg-muted/70 text-muted-foreground',
                        )}
                      >
                        <span className="block">{dia.dia}</span>
                        <span className="block text-[10px] uppercase opacity-70 print:text-[7px]">
                          {abreviaturaDia(dia.dia_semana)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {estudiantes.map((estudiante) => (
                    <tr key={estudiante.usuario_id} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-20 border-r border-b border-border/70 bg-card px-4 py-2 text-left font-medium group-hover:bg-muted/50 print:static print:min-w-0 print:px-1 print:py-0.5 print:text-[9px]"
                      >
                        <span className="block">
                          {estudiante.apellidos}
                        </span>
                        <span className="block text-xs font-normal text-muted-foreground print:text-[8px]">
                          {estudiante.nombres}
                        </span>
                      </th>
                      {diasVisibles.map((dia) => {
                        const estado = estudiante.estados[dia.fecha]
                        return (
                          <td
                            key={dia.fecha}
                            className={cn(
                              'border-r border-b border-border/70 p-1 text-center print:p-0.5',
                              !dia.es_clase && 'bg-muted/30',
                            )}
                          >
                            {estado ? (
                              <span
                                title={`${dia.fecha}: ${ETIQUETAS[estado]}`}
                                className={cn(
                                  'inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold print:size-4 print:rounded-sm print:text-[8px]',
                                  ESTILOS[estado],
                                )}
                              >
                                {LETRAS[estado]}
                              </span>
                            ) : (
                              <span className="sr-only">Sin registro</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </ProfesorShell>
  )
}
