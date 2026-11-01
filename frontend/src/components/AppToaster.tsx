import { Toaster } from 'sonner'

import { useTheme } from '@/hooks/use-theme'

/**
 * Toaster de Sonner sincronizado con el tema para que los avisos de éxito
 * (verde) y error (rojo) mantengan buen contraste en ambos modos.
 */
export function AppToaster() {
  const { tema } = useTheme()

  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      theme={tema}
      toastOptions={{ duration: 4000 }}
    />
  )
}
