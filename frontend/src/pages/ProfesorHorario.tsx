import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  GraduationCap,
  Inbox,
  RefreshCw,
} from 'lucide-react'

import { ProfesorShell } from '@/components/ProfesorShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { etiquetaCortaCurso } from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { posicionEnColegio } from '@/lib/fechas'
import { DIAS_SEMANA, type DiaSemana } from '@/lib/horarios'
import { cn } from '@/lib/utils'
import { obtenerClaseActual, obtenerMiHorario } from '@/services/profesores'
import type { Horario } from '@/services/horarios'

export function ProfesorHorario() {
  const posicion = posicionEnColegio()

  const horario = useQuery({
    queryKey: ['profesor', 'mi-horario'],
    queryFn: ({ signal }) => obtenerMiHorario(signal),
    staleTime: 5 * 60_000,
  })

  const clase = useQuery({
    queryKey: ['profesor', 'clase-actual'],
    queryFn: ({ signal }) => obtenerClaseActual(signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const bloques = horario.data
  const bloqueEnCursoId = clase.data?.bloque?.id ?? null

  const bloquesPorDia = useMemo(() => {
    const grupos = new Map<DiaSemana, Horario[]>()
    for (const dia of DIAS_SEMANA) grupos.set(dia.valor, [])
    for (const bloque of bloques ?? []) {
      grupos.get(bloque.dia_semana)?.push(bloque)
    }
    return grupos
  }, [bloques])

  return (
    <ProfesorShell seccion="Mi horario">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarDays className="size-4" aria-hidden="true" />
            Semana de clases
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Mi horario
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Consulta los bloques que tienes asignados en cada día. La clase que
            está en curso se resalta automáticamente.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void horario.refetch()}
          disabled={horario.isFetching}
          className="w-full shrink-0 sm:w-auto"
        >
          <RefreshCw
            className={cn('size-4', horario.isFetching && 'animate-spin')}
            aria-hidden="true"
          />
          Actualizar
        </Button>
      </section>

      {horario.isLoading ? (
        <div
          className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          {Array.from({ length: 5 }).map((_, indice) => (
            <div
              key={indice}
              className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ))}
          <span className="sr-only" role="status">
            Cargando horario…
          </span>
        </div>
      ) : horario.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {mensajeDeError(
              horario.error,
              'No se pudo cargar tu horario semanal.',
            )}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void horario.refetch()}
            disabled={horario.isFetching}
          >
            <RefreshCw
              className={cn(
                'size-4',
                horario.isFetching && 'animate-spin',
              )}
              aria-hidden="true"
            />
            Reintentar
          </Button>
        </div>
      ) : !bloques || bloques.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">Aún no tienes horario asignado</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Cuando el colegio cargue los bloques de tus cursos, los verás aquí
            con sus materias y horas.
          </p>
        </div>
      ) : (
        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DIAS_SEMANA.map((dia) => {
            const bloquesDia = bloquesPorDia.get(dia.valor) ?? []
            const esHoy = posicion.dia === dia.valor

            return (
              <section
                key={dia.valor}
                aria-label={dia.etiqueta}
                className={cn(
                  'rounded-2xl border bg-card p-4 shadow-sm sm:p-5',
                  esHoy
                    ? 'border-primary/40 ring-1 ring-primary/20'
                    : 'border-border/70',
                )}
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {dia.etiqueta}
                  </h2>
                  {esHoy ? (
                    <Badge variant="info">Hoy</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {bloquesDia.length}{' '}
                      {bloquesDia.length === 1 ? 'bloque' : 'bloques'}
                    </span>
                  )}
                </header>

                {bloquesDia.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sin clases programadas
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {bloquesDia.map((bloque) => (
                      <BloqueProfesor
                        key={bloque.id}
                        bloque={bloque}
                        enCurso={bloque.id === bloqueEnCursoId}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </ProfesorShell>
  )
}

function BloqueProfesor({
  bloque,
  enCurso,
}: {
  bloque: Horario
  enCurso: boolean
}) {
  const curso = bloque.curso
    ? etiquetaCortaCurso(bloque.curso)
    : `Curso #${bloque.curso_id}`

  return (
    <li
      className={cn(
        'rounded-xl border p-3',
        enCurso
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border/60 bg-background/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm leading-snug font-semibold break-words">
            {bloque.materia?.nombre ?? 'Sin materia'}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{curso}</span>
          </p>
        </div>
        {enCurso ? (
          <Badge variant="info" className="tracking-wide">
            EN CURSO
          </Badge>
        ) : null}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground tabular-nums">
        <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
        {bloque.hora_inicio.slice(0, 5)} - {bloque.hora_fin.slice(0, 5)}
        {bloque.es_ultimo_bloque ? (
          <span className="text-[11px] font-normal">· Último bloque</span>
        ) : null}
      </p>
    </li>
  )
}
