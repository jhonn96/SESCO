import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AppSidebar } from '@/components/AppSidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { useNotificacionesRealtime } from '@/hooks/use-notificaciones-realtime'
import { ETIQUETA_ROL, nombreRol } from '@/lib/roles'

interface DashboardShellProps {
  /** Texto del breadcrumb superior, por ejemplo "Resumen general". */
  seccion: string
  children: ReactNode
}

/**
 * Layout administrativo compartido por los paneles de SESCO: sidebar fijo,
 * header con breadcrumb, toggle de tema y el contenido a todo el ancho.
 */
export function DashboardShell({ seccion, children }: DashboardShellProps) {
  const { usuario, cerrarSesion } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useNotificacionesRealtime()

  const rol = nombreRol(usuario)
  const rolLabel = rol ? ETIQUETA_ROL[rol] : 'Sin rol'
  const esPortalEscolar = rol === 'estudiante' || rol === 'tutor'

  function manejarCierre() {
    cerrarSesion()
    queryClient.clear()
    toast.success('Sesión cerrada correctamente')
    navigate('/login', { replace: true })
  }

  return (
    <SidebarProvider>
      <AppSidebar rol={rol} usuario={usuario} onCerrarSesion={manejarCierre} />

      <SidebarInset>
        <header
          data-slot="dashboard-header"
          className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur lg:px-8"
        >
          <SidebarTrigger size="icon" className="-ml-1" />
          <Separator orientation="vertical" className="h-6" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
              SESCO ·{' '}
              {esPortalEscolar ? 'Portal escolar' : 'Panel administrativo'}
            </p>
            <p className="truncate text-base font-semibold">{seccion}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary sm:inline-flex">
              {rolLabel}
            </span>
            <ThemeToggle />
          </div>
        </header>

        <div
          data-slot="dashboard-content"
          className="flex w-full flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
