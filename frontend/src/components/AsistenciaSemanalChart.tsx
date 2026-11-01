import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarX2 } from 'lucide-react'

import { useChartTheme } from '@/hooks/use-chart-theme'

/** Punto del gráfico: porcentajes calculados por la página desde la API. */
export interface PuntoSerieSemanal {
  dia: string
  fecha: string
  presentes: number | null
  tardanzas: number | null
  faltas: number | null
  registros: number
}

interface AsistenciaSemanalChartProps {
  datos: PuntoSerieSemanal[]
  /** Texto del estado vacío; por defecto alude a la semana seleccionada. */
  descripcionVacio?: string
  /** Clases de altura del área del gráfico (móvil, tablet y escritorio). */
  alturaClase?: string
  /** Etiqueta accesible del gráfico. */
  etiqueta?: string
}

const ALTURA_POR_DEFECTO = 'h-[340px] sm:h-[380px] lg:h-[420px]'

export function AsistenciaSemanalChart({
  datos,
  descripcionVacio = 'No hay asistencias registradas en la semana de la fecha seleccionada. Prueba con otro día del calendario.',
  alturaClase = ALTURA_POR_DEFECTO,
  etiqueta = 'Asistencia semanal: porcentaje de presentes, tardanzas y faltas por día',
}: AsistenciaSemanalChartProps) {
  const paleta = useChartTheme()
  const [, verde, ambar, rojo] = paleta.series

  const hayRegistros = datos.some((punto) => punto.registros > 0)

  if (!hayRegistros) {
    return (
      <figure className="m-0">
        <div
          className={`flex ${alturaClase} flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center`}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarX2 className="size-7" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-semibold">Sin registros de asistencia</p>
            <p className="max-w-md text-base text-muted-foreground">
              {descripcionVacio}
            </p>
          </div>
        </div>
      </figure>
    )
  }

  return (
    <figure className="m-0 space-y-4">
      <figcaption className="flex flex-wrap items-center gap-6 text-base text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: verde }}
          />
          Presentes
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: ambar }}
          />
          Tardanzas
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: rojo }}
          />
          Faltas
        </span>
      </figcaption>

      <div
        role="img"
        aria-label={etiqueta}
        className={`${alturaClase} w-full`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={datos}
            margin={{ top: 12, right: 24, bottom: 0, left: 4 }}
          >
            <CartesianGrid
              stroke={paleta.grid}
              strokeDasharray="4 4"
              vertical={false}
            />
            <XAxis
              dataKey="dia"
              stroke={paleta.axis}
              tickLine={false}
              axisLine={false}
              tick={{ fill: paleta.axis, fontSize: 15 }}
              dy={8}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke={paleta.axis}
              tickLine={false}
              axisLine={false}
              tick={{ fill: paleta.axis, fontSize: 15 }}
              tickFormatter={(valor: number) => `${valor}%`}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: paleta.axis, strokeDasharray: '4 4' }}
              contentStyle={{
                backgroundColor: paleta.tooltipBackground,
                border: `1px solid ${paleta.tooltipBorder}`,
                borderRadius: 12,
                fontSize: 15,
                padding: '10px 14px',
                boxShadow: '0 8px 24px hsl(222.2 84% 4.9% / 0.12)',
              }}
              labelStyle={{
                color: paleta.tooltipText,
                fontWeight: 600,
                fontSize: 15,
              }}
              itemStyle={{ color: paleta.tooltipText, fontSize: 15 }}
              labelFormatter={(_etiqueta, payload) => {
                const punto = payload?.[0]?.payload as
                  | PuntoSerieSemanal
                  | undefined
                return punto?.fecha ?? ''
              }}
              formatter={(valor, nombre) => [
                typeof valor === 'number'
                  ? `${valor.toLocaleString('es-BO', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })} %`
                  : 'Sin registros',
                nombre,
              ]}
            />
            <Line
              type="monotone"
              dataKey="presentes"
              name="Presentes"
              stroke={verde}
              strokeWidth={3.5}
              strokeLinecap="round"
              dot={{ r: 4, fill: verde, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="tardanzas"
              name="Tardanzas"
              stroke={ambar}
              strokeWidth={3.5}
              strokeLinecap="round"
              dot={{ r: 4, fill: ambar, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="faltas"
              name="Faltas"
              stroke={rojo}
              strokeWidth={3.5}
              strokeLinecap="round"
              dot={{ r: 4, fill: rojo, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-sm text-muted-foreground">
        Porcentaje calculado sobre los registros de asistencia de cada día. Los
        colores se adaptan al modo claro y oscuro.
      </p>
    </figure>
  )
}
