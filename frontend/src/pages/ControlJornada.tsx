import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, LogOut, RefreshCw } from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import { PageHeader } from '@/components/PageHeader'
import { SalidaEspecialDialog } from '@/components/SalidaEspecialDialog'
import { TablaEstado } from '@/components/TablaEstado'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  compararCursos,
  etiquetaCurso,
  nombreNivel,
  nombreTurno,
} from '@/lib/cursos'
import { mensajeDeError } from '@/lib/errores'
import { cn } from '@/lib/utils'
import { listarCursos, type Curso } from '@/services/cursos'

/**
 * Control de Jornada: registra salidas especiales para un curso completo y
 * notifica a los tutores con el motivo indicado.
 */
export function ControlJornada() {
  const [cursoSeleccionado, setCursoSeleccionado] = useState<Curso | null>(null)

  const consulta = useQuery({
    queryKey: ['cursos', 'lista'],
    queryFn: ({ signal }) => listarCursos(signal),
    staleTime: 10 * 60_000,
  })

  const cursos = useMemo(
    () => [...(consulta.data ?? [])].sort(compararCursos),
    [consulta.data],
  )

  const cargando = consulta.isLoading
  const sinDatos = cursos.length === 0 && !cargando && !consulta.isError

  return (
    <DashboardShell seccion="Control de Jornada">
      <PageHeader
        titulo="Control de Jornada"
        descripcion="Registra salidas especiales para un curso completo. Se notificará a los tutores de los estudiantes presentes y la acción quedará en la bitácora."
        icono={CalendarClock}
        acciones={
          <>
            {consulta.data ? (
              <Badge variant="info" className="h-8 px-3 text-sm">
                {cursos.length} {cursos.length === 1 ? 'curso' : 'cursos'}
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

      <Card
        className="gap-0 overflow-hidden [--card-spacing:0px] shadow-sm"
        aria-busy={consulta.isFetching}
      >
        {consulta.isError && cursos.length > 0 ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            No se pudo actualizar el listado. Se muestran los últimos datos
            disponibles.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-4">Curso</TableHead>
              <TableHead>Nivel</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead className="px-4 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TablaEstado
              columnas={4}
              cargando={cargando}
              error={
                consulta.isError && cursos.length === 0
                  ? mensajeDeError(consulta.error)
                  : null
              }
              onReintentar={() => void consulta.refetch()}
              vacio={sinDatos}
              tituloVacio="No hay cursos registrados"
              descripcionVacio="Crea un curso en el módulo Cursos para poder registrar salidas especiales."
              iconoVacio={CalendarClock}
            />

            {cursos.map((curso) => (
              <TableRow key={curso.id}>
                <TableCell className="px-4">
                  <p className="font-medium">{etiquetaCurso(curso)}</p>
                  <p className="text-xs text-muted-foreground">
                    Periodo #{curso.periodo_id}
                  </p>
                </TableCell>
                <TableCell>{nombreNivel(curso.nivel)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {nombreTurno(curso.turno)}
                </TableCell>
                <TableCell className="px-4 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCursoSeleccionado(curso)}
                  >
                    <LogOut aria-hidden="true" />
                    Registrar Salida Especial
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SalidaEspecialDialog
        abierto={cursoSeleccionado !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setCursoSeleccionado(null)
        }}
        curso={cursoSeleccionado}
      />
    </DashboardShell>
  )
}
