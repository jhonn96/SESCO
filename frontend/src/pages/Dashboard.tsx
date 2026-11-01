import { Construction } from 'lucide-react'

import { DashboardShell } from '@/components/DashboardShell'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { ETIQUETA_ROL, nombreRol } from '@/lib/roles'

/**
 * Panel para profesores, estudiantes y tutores. El panel global de asistencia
 * es exclusivo del director y vive en `DirectorDashboard`.
 */
export function Dashboard() {
  const { usuario } = useAuth()
  const rol = nombreRol(usuario)
  const rolLabel = rol ? ETIQUETA_ROL[rol] : 'Sin rol'
  const nombre = usuario
    ? `${usuario.nombres} ${usuario.apellidos}`.trim()
    : 'Usuario'

  return (
    <DashboardShell seccion="Mi panel">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
          Bienvenido {nombre} - Rol: {rolLabel}
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground lg:text-lg">
          {usuario
            ? `Sesión iniciada con el CI ${usuario.ci} como ${rolLabel}.`
            : `Sesión iniciada como ${rolLabel}.`}
        </p>
      </section>

      <Card className="[--card-spacing:--spacing(6)] shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Panel en preparación</CardTitle>
          <CardDescription className="text-base">
            El resumen personalizado de asistencia para tu rol estará
            disponible en la siguiente etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Construction className="size-6" aria-hidden="true" />
          </span>
          <p className="text-base text-muted-foreground">
            Mientras tanto puedes recorrer los módulos del menú lateral. Los que
            todavía no están habilitados muestran un aviso al abrirlos.
          </p>
        </CardContent>
      </Card>
    </DashboardShell>
  )
}
