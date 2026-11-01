import { useQuery } from '@tanstack/react-query'

import { obtenerDirectorioEstudiantes } from '@/services/estudiantes'

/**
 * Directorio `usuario_id → estudiante` compartido por las tablas que solo
 * reciben identificadores (alertas y justificaciones). Se cachea 5 minutos.
 */
export function useDirectorioEstudiantes() {
  return useQuery({
    queryKey: ['estudiantes', 'directorio'],
    queryFn: ({ signal }) => obtenerDirectorioEstudiantes(signal),
    staleTime: 5 * 60_000,
  })
}
