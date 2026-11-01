import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

/** Botón de la barra superior para alternar entre modo claro y oscuro. */
export function ThemeToggle() {
  const { esOscuro, alternarTema } = useTheme()
  const etiqueta = esOscuro ? 'Activar modo claro' : 'Activar modo oscuro'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={alternarTema}
      aria-label={etiqueta}
      title={etiqueta}
      className="text-muted-foreground hover:text-foreground"
    >
      {esOscuro ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
    </Button>
  )
}
