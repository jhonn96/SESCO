import { useState } from 'react'
import { ChevronsUpDown, KeyRound, LogOut } from 'lucide-react'

import { CambiarPasswordDialog } from '@/components/CambiarPasswordDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import type { Usuario } from '@/services/auth'

interface MenuUsuarioProps {
  usuario: Usuario | null
  rol: string
  onCerrarSesion: () => void
}

/** Menú de cuenta del sidebar: cambiar contraseña o cerrar sesión. */
export function MenuUsuario({ usuario, rol, onCerrarSesion }: MenuUsuarioProps) {
  const [cambiarPasswordAbierto, setCambiarPasswordAbierto] = useState(false)

  const nombre = usuario
    ? `${usuario.nombres} ${usuario.apellidos}`.trim()
    : 'Usuario'
  const iniciales = usuario
    ? `${usuario.nombres[0] ?? ''}${usuario.apellidos[0] ?? ''}`.toUpperCase()
    : 'US'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            aria-label="Menú de usuario"
            className="h-auto py-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {iniciales}
            </span>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{nombre}</span>
              <span className="truncate text-xs text-muted-foreground">
                {rol}
              </span>
            </div>
            <ChevronsUpDown
              className="ml-auto size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuLabel className="grid gap-0.5">
            <span className="truncate text-sm font-semibold">{nombre}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {rol}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCambiarPasswordAbierto(true)}>
            <KeyRound aria-hidden="true" />
            Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onCerrarSesion}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CambiarPasswordDialog
        abierto={cambiarPasswordAbierto}
        onOpenChange={setCambiarPasswordAbierto}
      />
    </>
  )
}
