import { useQuery } from '@tanstack/react-query'

import { obtenerDirectorioUsuarios } from '@/services/usuarios'

/** Directorio `usuario_id → usuario` de los tutores, cacheado 10 minutos. */
export function useDirectorioTutores() {
  return useQuery({
    queryKey: ['usuarios', 'directorio', 'tutor'],
    queryFn: ({ signal }) => obtenerDirectorioUsuarios(4, signal),
    staleTime: 10 * 60_000,
  })
}
