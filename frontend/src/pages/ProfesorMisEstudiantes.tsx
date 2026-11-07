import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LogOut, RefreshCw, Users } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { ProfesorShell } from '@/components/ProfesorShell'
import { SalidaManualDialog } from '@/components/SalidaManualDialog'
import { SalidaMasivaDialog } from '@/components/SalidaMasivaDialog'
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
import { ESTADOS_ASISTENCIA } from '@/lib/asistencia'
import { compararCursos, etiquetaCortaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { formatearHoraEnColegio, posicionEnColegio } from '@/lib/fechas'
import { inicialesPersona, nombreCompleto } from '@/lib/personas'
import { cn } from '@/lib/utils'
import {
  listarAsistencias,
  type RegistroAsistencia,
} from '@/services/asistencia'
import type { Curso } from '@/services/cursos'
import {
  listarMisEstudiantes,
  type Estudiante,
} from '@/services/estudiantes'
import { obtenerMisCursos } from '@/services/profesores'

const TAMANO_ESTUDIANTES = 100
const TAMANO_ASISTENCIAS = 200

interface FilaEstudiante {
  estudiante: Estudiante
  abierto: RegistroAsistencia | null
  ingreso: string | null
  salida: string | null
  estado: RegistroAsistencia['estado'] | null
}

async function cargarEstudiantes(
  cursoId: number,
  signal?: AbortSignal,
): Promise<Estudiante[]> {
  const items: Estudiante[] = []
  let skip = 0
  let total = Number.POSITIVE_INFINITY

  while (skip < total) {
    const { data, total: encontrados } = await listarMisEstudiantes(
      { curso_id: cursoId, skip, limit: TAMANO_ESTUDIANTES },
      signal,
    )
    total = encontrados
    items.push(...data)
    if (data.length === 0) break
    skip += data.length
  }
  return items
}

async function cargarAsistenciasHoy(
  cursoId: number,
  fecha: string,
  signal?: AbortSignal,
): Promise<RegistroAsistencia[]> {
  const items: RegistroAsistencia[] = []
  let skip = 0
  let total = Number.POSITIVE_INFINITY

  while (skip < total) {
    const { data, total: encontrados } = await listarAsistencias(
      {
        fecha,
        cursoId,
        skip,
        limit: TAMANO_ASISTENCIAS,
      },
      signal,
    )
    total = encontrados
    items.push(...data)
    if (data.length === 0) break
    skip += data.length
  }
  return items
}

function horaMasReciente(actual: string | null, candidato: string): string {
  if (!actual) return candidato
  return new Date(candidato).getTime() > new Date(actual).getTime()
    ? candidato
    : actual
}

function horaMasAntigua(actual: string | null, candidato: string): string {
  if (!actual) return candidato
  return new Date(candidato).getTime() < new Date(actual).getTime()
    ? candidato
    : actual
}

/**
 * Panel «Mis estudiantes» del docente: lista los estudiantes de sus cursos
 * con el estado de hoy y permite registrar salidas individuales o de todo el
 * curso para actividades extracurriculares.
 */
export function ProfesorMisEstudiantes() {
  const [cursoSeleccionado, setCursoSeleccionado] = useState('')
  const [salidaManual, setSalidaManual] = useState<{
    asistenciaId: number
    nombre: string
  } | null>(null)
  const [masivaAbierta, setMasivaAbierta] = useState(false)

  const { fecha: hoy } = posicionEnColegio()

  const misCursos = useQuery({
    queryKey: ['profesor', 'mis-cursos'],
    queryFn: ({ signal }) => obtenerMisCursos(signal),
    staleTime: 5 * 60_000,
  })

  const cursos = useMemo(
    () => [...(misCursos.data ?? [])].sort(compararCursos),
    [misCursos.data],
  )

  const cursoValido = cursos.some(
    (curso) => String(curso.id) === cursoSeleccionado,
  )
    ? cursoSeleccionado
    : ''
  const cursoEfectivo = cursoValido || (cursos[0] ? String(cursos[0].id) : '')
  const cursoActual: Curso | null =
    cursos.find((curso) => String(curso.id) === cursoEfectivo) ?? null

  const estudiantes = useQuery({
    queryKey: ['profesor', 'mis-estudiantes', cursoEfectivo, 'todos'],
    queryFn: ({ signal }) =>
      cargarEstudiantes(Number(cursoEfectivo), signal),
    enabled: Boolean(cursoEfectivo),
    staleTime: 60_000,
  })

  const asistencias = useQuery({
    queryKey: ['asistencia', 'hoy-curso', cursoEfectivo, hoy],
    queryFn: ({ signal }) =>
      cargarAsistenciasHoy(Number(cursoEfectivo), hoy, signal),
    enabled: Boolean(cursoEfectivo),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const filas = useMemo<FilaEstudiante[]>(() => {
    const porEstudiante = new Map<number, RegistroAsistencia[]>()
    for (const registro of asistencias.data ?? []) {
      const lista = porEstudiante.get(registro.estudiante_id) ?? []
      lista.push(registro)
      porEstudiante.set(registro.estudiante_id, lista)
    }

    return (estudiantes.data ?? []).map((estudiante) => {
      const registros = porEstudiante.get(estudiante.usuario_id) ?? []
      const abiertos = registros.filter(
        (registro) => registro.hora_ingreso && !registro.hora_salida,
      )

      let abierto: RegistroAsistencia | null = null
      for (const registro of abiertos) {
        if (
          !abierto ||
          (registro.hora_ingreso &&
            abierto.hora_ingreso &&
            new Date(registro.hora_ingreso).getTime() >
              new Date(abierto.hora_ingreso).getTime())
        ) {
          abierto = registro
        }
      }

      let ingreso: string | null = null
      let salida: string | null = null
      let ultimo: RegistroAsistencia | null = null

      for (const registro of registros) {
        if (registro.hora_ingreso) {
          ingreso = horaMasAntigua(ingreso, registro.hora_ingreso)
        }
        if (registro.hora_salida) {
          salida = horaMasReciente(salida, registro.hora_salida)
        }
        ultimo = registro
      }

      return {
        estudiante,
        abierto,
        ingreso,
        salida,
        estado: abierto?.estado ?? ultimo?.estado ?? null,
      }
    })
  }, [estudiantes.data, asistencias.data])

  const presentes = filas.filter((fila) => fila.abierto !== null).length
  const cargandoCursos = misCursos.isLoading
  const cargando =
    estudiantes.isLoading || asistencias.isLoading || cargandoCursos
  const error = misCursos.isError
    ? mensajeDeError(misCursos.error, 'No se pudieron cargar tus cursos.')
    : estudiantes.isError
      ? mensajeDeError(
          estudiantes.error,
          'No se pudieron cargar los estudiantes del curso.',
        )
      : asistencias.isError
        ? mensajeDeError(
            asistencias.error,
            'No se pudo cargar la asistencia de hoy.',
          )
        : null
  const sinCursos = !cargandoCursos && cursos.length === 0
  const sinDatos =
    Boolean(cursoEfectivo) &&
    !cargando &&
    !error &&
    filas.length === 0

  function refrescar() {
    void misCursos.refetch()
    void estudiantes.refetch()
    void asistencias.refetch()
  }

  function nombreDe(estudiante: Estudiante): string {
    return (
      nombreCompleto(estudiante.usuario) ||
      `Estudiante #${estudiante.usuario_id}`
    )
  }

  return (
    <ProfesorShell seccion="Mis estudiantes">
      <PageHeader
        titulo="Mis estudiantes"
        descripcion="Consulta a los estudiantes de tus cursos y registra salidas individuales o de todo el curso. Solo aparecen quienes ya ingresaron hoy y aún no tienen salida."
        icono={Users}
        acciones={
          <>
            <Button
              type="button"
              className="h-10"
              onClick={() => setMasivaAbierta(true)}
              disabled={!cursoActual || asistencias.isLoading}
            >
              <Users aria-hidden="true" />
              Salida de Curso Completo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={refrescar}
              disabled={cargando || Boolean(error)}
            >
              <RefreshCw
                className={cn('size-4', cargando && 'animate-spin')}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1.5 sm:w-72">
            <Label htmlFor="mis-estudiantes-curso">Curso</Label>
            <Select
              id="mis-estudiantes-curso"
              value={cursoEfectivo}
              onChange={(evento) =>
                setCursoSeleccionado(evento.target.value)
              }
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

          <p className="text-sm text-muted-foreground">
            {filas.length} {filas.length === 1 ? 'estudiante' : 'estudiantes'}
            {' · '}
            <span className="font-semibold text-foreground tabular-nums">
              {presentes}
            </span>{' '}
            {presentes === 1
              ? 'presente sin salida'
              : 'presentes sin salida'}
          </p>
        </div>
      </Card>

      {sinCursos ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Aún no tienes cursos asignados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando el colegio cargue tu horario, podrás consultar aquí a tus
            estudiantes y registrar sus salidas.
          </p>
        </Card>
      ) : (
        <Card
          className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
          aria-busy={asistencias.isFetching}
        >
          {asistencias.isError && filas.length > 0 ? (
            <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              No se pudo actualizar la asistencia. Se muestran los últimos datos
              disponibles.
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4">Estudiante</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="px-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TablaEstado
                columnas={5}
                cargando={cargando}
                error={filas.length === 0 ? error : null}
                onReintentar={refrescar}
                vacio={sinDatos}
                tituloVacio={
                  cursoEfectivo
                    ? 'No hay estudiantes en este curso'
                    : 'Selecciona un curso'
                }
                descripcionVacio={
                  cursoEfectivo
                    ? 'Los estudiantes aparecerán aquí cuando estén matriculados en el curso.'
                    : 'Elige un curso para consultar a sus estudiantes.'
                }
                iconoVacio={Users}
              />

              {filas.map((fila) => {
                const nombre = nombreDe(fila.estudiante)
                const estado = fila.estado
                  ? ESTADOS_ASISTENCIA[fila.estado]
                  : null

                return (
                  <TableRow key={fila.estudiante.usuario_id}>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {inicialesPersona(fila.estudiante.usuario)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{nombre}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {fila.estudiante.usuario?.ci
                              ? `CI ${fila.estudiante.usuario.ci}`
                              : 'Sin CI registrado'}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="tabular-nums">
                      {fila.ingreso
                        ? formatearHoraEnColegio(fila.ingreso)
                        : '—'}
                    </TableCell>

                    <TableCell className="tabular-nums">
                      {fila.abierto ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          Pendiente
                        </span>
                      ) : fila.salida ? (
                        formatearHoraEnColegio(fila.salida)
                      ) : (
                        '—'
                      )}
                    </TableCell>

                    <TableCell>
                      {estado ? (
                        <Badge variant={estado.variante}>
                          {estado.etiqueta}
                        </Badge>
                      ) : (
                        <Badge variant="muted">Sin registro</Badge>
                      )}
                    </TableCell>

                    <TableCell className="px-4 text-right">
                      {fila.abierto ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSalidaManual({
                              asistenciaId: fila.abierto!.id,
                              nombre,
                            })
                          }
                        >
                          <LogOut aria-hidden="true" />
                          Registrar salida
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <SalidaManualDialog
        abierto={salidaManual !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setSalidaManual(null)
        }}
        asistenciaId={salidaManual?.asistenciaId ?? null}
        nombreEstudiante={salidaManual?.nombre ?? ''}
      />

      <SalidaMasivaDialog
        abierto={masivaAbierta}
        onOpenChange={setMasivaAbierta}
        curso={cursoActual}
        presentes={presentes}
      />
    </ProfesorShell>
  )
}
