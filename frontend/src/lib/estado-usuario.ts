import type { Usuario } from '@/services/auth'

export interface EstadoUsuario {
  etiqueta: 'Activo' | 'Bloqueado' | 'Inactivo' | 'Sin usuario'
  variante: 'success' | 'destructive' | 'muted'
}

/** Indica si la cuenta tiene un bloqueo temporal vigente. */
export function estaBloqueado(
  usuario: Usuario | null | undefined,
  ahora: number = Date.now(),
): boolean {
  if (!usuario?.bloqueado_hasta) return false
  return new Date(usuario.bloqueado_hasta).getTime() > ahora
}

/** Estado visible de una cuenta: activo, bloqueado o inactivo. */
export function estadoDeUsuario(
  usuario: Usuario | null | undefined,
  ahora: number = Date.now(),
): EstadoUsuario {
  if (!usuario) {
    return { etiqueta: 'Sin usuario', variante: 'muted' }
  }
  if (!usuario.activo) {
    return { etiqueta: 'Inactivo', variante: 'muted' }
  }
  if (estaBloqueado(usuario, ahora)) {
    return { etiqueta: 'Bloqueado', variante: 'destructive' }
  }
  return { etiqueta: 'Activo', variante: 'success' }
}
