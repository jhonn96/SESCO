/** Mensaje legible de un error de la API o de red. */
export function mensajeDeError(
  error: unknown,
  respaldo = 'Ocurrió un error inesperado.',
): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return respaldo
}
