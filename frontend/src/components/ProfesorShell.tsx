import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  QrCode,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { MenuUsuario } from '@/components/MenuUsuario'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { formatearFechaLarga, hoyIso } from '@/lib/fechas'
import { ETIQUETA_ROL, nombreRol } from '@/lib/roles'

interface ProfesorShellProps {
  /** Texto del encabezado, por ejemplo "Panel del profesor". */
  seccion: string
  /** Abre el escáner desde el menú lateral. */
  onEscanear?: () => void
  /** Abre el registro manual desde el menú lateral. */
  onRegistroManual?: () => void
  /** Habilita las acciones de registro (solo con clase en curso). */
  puedeRegistrar?: boolean
  children: ReactNode
}

/**
 * Layout del módulo del profesor: sidebar reducido a sus tareas diarias
 * (panel, registro de asistencia y atajos) y contenido a todo el ancho.
 */
export function ProfesorShell({
  seccion,
  onEscanear,
  onRegistroManual,
  puedeRegistrar = true,
  children,
}: ProfesorShellProps) {
  const { usuario, cerrarSesion } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const rol = nombreRol(usuario)

  function manejarCierre() {
    cerrarSesion()
    queryClient.clear()
    toast.success('Sesión cerrada correctamente')
    navigate('/login', { replace: true })
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="print:hidden">
        <SidebarHeader className="border-b border-sidebar-border/70 p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="SESCO">
                <Link to="/profesor">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <GraduationCap className="size-5!" aria-hidden="true" />
                  </span>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-base font-semibold tracking-tight">
                      SESCO
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      Panel del profesor
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <MenuProfesor
            onEscanear={onEscanear}
            onRegistroManual={onRegistroManual}
            puedeRegistrar={puedeRegistrar}
          />
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/70 p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <MenuUsuario
                usuario={usuario}
                rol={rol ? ETIQUETA_ROL[rol] : 'Profesor'}
                onCerrarSesion={manejarCierre}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="print:m-0 print:rounded-none print:shadow-none">
        <header
          data-slot="dashboard-header"
          className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur lg:px-8 print:hidden"
        >
          <SidebarTrigger size="icon" className="-ml-1" />
          <Separator orientation="vertical" className="h-6" />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              SESCO · Aula
            </p>
            <p className="truncate text-base font-semibold">{seccion}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-sm font-medium text-muted-foreground lg:inline-flex">
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatearFechaLarga(hoyIso())}
            </span>
            <ThemeToggle />
          </div>
        </header>

        <div
          data-slot="dashboard-content"
          className="flex w-full flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8 print:gap-0 print:p-0"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

interface MenuProfesorProps {
  onEscanear?: () => void
  onRegistroManual?: () => void
  puedeRegistrar: boolean
}

function MenuProfesor({
  onEscanear,
  onRegistroManual,
  puedeRegistrar,
}: MenuProfesorProps) {
  const { pathname, hash } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  function cerrarMenuMovil() {
    if (isMobile) setOpenMobile(false)
  }

  const enPanel = pathname === '/profesor' && hash !== '#registros'
  const enRegistros = pathname === '/profesor' && hash === '#registros'
  const enEstudiantes = pathname === '/profesor/estudiantes'
  const enLista = pathname === '/profesor/lista-asistencia'
  const enAlertas = pathname === '/profesor/alertas'
  const enHorario = pathname === '/profesor/horario'
  const muestraAcciones = Boolean(onEscanear || onRegistroManual)

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="text-sm font-semibold tracking-wide uppercase">
          Mi jornada
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={enPanel}
                tooltip="Panel"
              >
                <Link
                  to="/profesor"
                  onClick={cerrarMenuMovil}
                  aria-current={enPanel ? 'page' : undefined}
                >
                  <LayoutDashboard aria-hidden="true" />
                  <span>Panel</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={enRegistros}
                tooltip="Registros de hoy"
              >
                <Link
                  to="/profesor#registros"
                  onClick={cerrarMenuMovil}
                  aria-current={enRegistros ? 'page' : undefined}
                >
                  <ClipboardList aria-hidden="true" />
                  <span>Registros de hoy</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={enEstudiantes}
                tooltip="Mis estudiantes"
              >
                <Link
                  to="/profesor/estudiantes"
                  onClick={cerrarMenuMovil}
                  aria-current={enEstudiantes ? 'page' : undefined}
                >
                  <Users aria-hidden="true" />
                  <span>Mis estudiantes</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={enLista}
                tooltip="Lista de asistencia"
              >
                <Link
                  to="/profesor/lista-asistencia"
                  onClick={cerrarMenuMovil}
                  aria-current={enLista ? 'page' : undefined}
                >
                  <ListChecks aria-hidden="true" />
                  <span>Lista de asistencia</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={enAlertas}
                tooltip="Alertas"
              >
                <Link
                  to="/profesor/alertas"
                  onClick={cerrarMenuMovil}
                  aria-current={enAlertas ? 'page' : undefined}
                >
                  <BellRing aria-hidden="true" />
                  <span>Alertas</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={enHorario}
                tooltip="Mi horario"
              >
                <Link
                  to="/profesor/horario"
                  onClick={cerrarMenuMovil}
                  aria-current={enHorario ? 'page' : undefined}
                >
                  <CalendarDays aria-hidden="true" />
                  <span>Mi horario</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {muestraAcciones ? (
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm font-semibold tracking-wide uppercase">
            Registrar asistencia
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={
                    puedeRegistrar
                      ? 'Escanear QR'
                      : 'No tienes clases en este momento'
                  }
                  disabled={!puedeRegistrar}
                  onClick={() => {
                    cerrarMenuMovil()
                    onEscanear?.()
                  }}
                >
                  <QrCode aria-hidden="true" />
                  <span>Escanear QR</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={
                    puedeRegistrar
                      ? 'Registro manual'
                      : 'No tienes clases en este momento'
                  }
                  disabled={!puedeRegistrar}
                  onClick={() => {
                    cerrarMenuMovil()
                    onRegistroManual?.()
                  }}
                >
                  <UserPlus aria-hidden="true" />
                  <span>Registro manual</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  )
}
