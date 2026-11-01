import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  School,
  Settings,
  Users,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { ETIQUETA_ROL, rutaPorRol, type RolNombre } from '@/lib/roles'
import type { Usuario } from '@/services/auth'

interface ItemMenu {
  titulo: string
  icono: LucideIcon
  /** Ruta del módulo. Si falta, el ítem aún no está disponible. */
  ruta?: string
}

interface GrupoMenu {
  titulo: string
  items: ItemMenu[]
}

const MENU_POR_ROL: Record<RolNombre, GrupoMenu[]> = {
  director: [
    {
      titulo: 'Principal',
      items: [
        { titulo: 'Panel', icono: LayoutDashboard, ruta: '/director' },
        {
          titulo: 'Asistencia',
          icono: CalendarCheck2,
          ruta: '/director/asistencia',
        },
        {
          titulo: 'Estudiantes',
          icono: Users,
          ruta: '/director/estudiantes',
        },
        {
          titulo: 'Profesores',
          icono: GraduationCap,
          ruta: '/director/profesores',
        },
        {
          titulo: 'Tutores',
          icono: HeartHandshake,
          ruta: '/director/tutores',
        },
      ],
    },
    {
      titulo: 'Estructura',
      items: [
        { titulo: 'Cursos', icono: School, ruta: '/director/cursos' },
        {
          titulo: 'Horarios',
          icono: CalendarClock,
          ruta: '/director/horarios',
        },
      ],
    },
    {
      titulo: 'Gestión',
      items: [
        { titulo: 'Alertas', icono: BellRing, ruta: '/director/alertas' },
        {
          titulo: 'Justificaciones',
          icono: ClipboardCheck,
          ruta: '/director/justificaciones',
        },
        {
          titulo: 'Comunicados',
          icono: Megaphone,
          ruta: '/director/comunicados',
        },
      ],
    },
    {
      titulo: 'Análisis',
      items: [
        { titulo: 'Reportes', icono: BarChart3, ruta: '/director/reportes' },
        {
          titulo: 'Configuración',
          icono: Settings,
          ruta: '/director/configuracion',
        },
      ],
    },
  ],
  profesor: [
    {
      titulo: 'Principal',
      items: [
        { titulo: 'Panel', icono: LayoutDashboard, ruta: '/profesor' },
        { titulo: 'Mis cursos', icono: BookOpen },
        { titulo: 'Asistencia', icono: CalendarCheck2 },
        { titulo: 'Estudiantes', icono: Users },
      ],
    },
    {
      titulo: 'Análisis',
      items: [{ titulo: 'Reportes', icono: BarChart3 }],
    },
  ],
  estudiante: [
    {
      titulo: 'Principal',
      items: [
        { titulo: 'Panel', icono: LayoutDashboard, ruta: '/estudiante' },
        { titulo: 'Mi asistencia', icono: ClipboardList },
        { titulo: 'Mi horario', icono: CalendarDays },
      ],
    },
    {
      titulo: 'Personal',
      items: [{ titulo: 'Notificaciones', icono: Bell }],
    },
  ],
  tutor: [
    {
      titulo: 'Principal',
      items: [
        { titulo: 'Panel', icono: LayoutDashboard, ruta: '/tutor' },
        {
          titulo: 'Asistencia del estudiante',
          icono: ClipboardList,
          ruta: '/tutor/asistencia',
        },
        { titulo: 'Notificaciones', icono: Bell },
      ],
    },
    {
      titulo: 'Seguimiento',
      items: [{ titulo: 'Reportes', icono: BarChart3 }],
    },
  ],
}

interface AppSidebarProps {
  rol: RolNombre | null
  usuario: Usuario | null
  onCerrarSesion: () => void
}

export function AppSidebar({ rol, usuario, onCerrarSesion }: AppSidebarProps) {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const rolActivo = rol ?? 'director'
  const grupos = MENU_POR_ROL[rolActivo]
  const nombre = usuario
    ? `${usuario.nombres} ${usuario.apellidos}`.trim()
    : 'Usuario'
  const iniciales = usuario
    ? `${usuario.nombres[0] ?? ''}${usuario.apellidos[0] ?? ''}`.toUpperCase()
    : 'US'

  /** En móvil el menú es un panel deslizante: se cierra al navegar. */
  function cerrarMenuMovil() {
    if (isMobile) setOpenMobile(false)
  }

  function abrirModulo(item: ItemMenu) {
    if (item.ruta) return

    toast.info(`${item.titulo} estará disponible pronto`, {
      description: 'Este módulo se habilitará en la siguiente etapa.',
    })
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/70 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="SESCO">
              <Link to={rutaPorRol(rolActivo)} onClick={cerrarMenuMovil}>
                <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <GraduationCap className="size-5!" aria-hidden="true" />
                </span>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-semibold tracking-tight">
                    SESCO
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Asistencia escolar
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {grupos.map((grupo) => (
          <SidebarGroup key={grupo.titulo}>
            <SidebarGroupLabel className="text-sm font-semibold tracking-wide uppercase">
              {grupo.titulo}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {grupo.items.map((item) => {
                  const Icono = item.icono
                  const activo = item.ruta === pathname

                  if (item.ruta) {
                    return (
                      <SidebarMenuItem key={item.titulo}>
                        <SidebarMenuButton
                          asChild
                          isActive={activo}
                          tooltip={item.titulo}
                        >
                          <Link
                            to={item.ruta}
                            onClick={cerrarMenuMovil}
                            aria-current={activo ? 'page' : undefined}
                          >
                            <Icono aria-hidden="true" />
                            <span>{item.titulo}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  }

                  return (
                    <SidebarMenuItem key={item.titulo}>
                      <SidebarMenuButton
                        tooltip={item.titulo}
                        onClick={() => abrirModulo(item)}
                      >
                        <Icono aria-hidden="true" />
                        <span>{item.titulo}</span>
                        <span className="ml-auto hidden rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden lg:inline">
                          Pronto
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Cerrar sesión"
              onClick={onCerrarSesion}
              aria-label="Cerrar sesión"
              className="h-auto py-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {iniciales}
              </span>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">
                  {nombre}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {ETIQUETA_ROL[rolActivo]}
                </span>
              </div>
              <LogOut
                className="ml-auto size-4! shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

