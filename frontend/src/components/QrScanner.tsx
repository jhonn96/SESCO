import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import {
  Camera,
  CameraOff,
  Keyboard,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ScanLine,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDirectorioEstudiantes } from '@/hooks/use-directorio-estudiantes'
import { ESTADOS_ASISTENCIA } from '@/lib/asistencia'
import { datosEstudiante } from '@/lib/directorio'
import { mensajeDeError } from '@/lib/errores'
import { escanearAsistencia } from '@/services/asistencia'

/** Contenedor donde html5-qrcode inyecta el video de la cámara. */
const CONTENEDOR_ID = 'sesco-lector-qr'

/** Formato del QR que genera SESCO: `SESCO|ID_ESTUDIANTE|CODIGO`. */
const PATRON_QR = /^SESCO\|\d+\|\d{8}$/

/** Tras un error se ignoran lecturas durante este tiempo para no repetir avisos. */
const ESPERA_TRAS_ERROR_MS = 2500

type EstadoCamara = 'iniciando' | 'activa' | 'error'

export interface QrScannerProps {
  abierto: boolean
  onCerrar: () => void
  /** Bloque que se está dictando; acota el registro a esa clase. */
  horarioId?: number
}

/**
 * Lector de QR con la cámara del dispositivo. Al detectar un código válido
 * registra la asistencia (`POST /api/asistencia/escanear`) y avisa con Sonner.
 */
export function QrScanner({ abierto, onCerrar, horarioId }: QrScannerProps) {
  const queryClient = useQueryClient()
  const directorio = useDirectorioEstudiantes()

  const [estadoCamara, setEstadoCamara] = useState<EstadoCamara>('iniciando')
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [mostrarManual, setMostrarManual] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')

  const lectorRef = useRef<Html5Qrcode | null>(null)
  const procesandoRef = useRef(false)
  const bloqueoRef = useRef(0)
  const manejarLecturaRef = useRef<(texto: string) => void>(() => {})

  const registrar = useMutation({
    mutationFn: (contenido: string) => escanearAsistencia(contenido, horarioId),
    onMutate: () => {
      procesandoRef.current = true
      setErrorLectura(null)
    },
    onSuccess: (registro) => {
      const estudiante = datosEstudiante(
        directorio.data,
        registro.estudiante_id,
      )
      const estado = ESTADOS_ASISTENCIA[registro.estado]
      const retraso =
        registro.minutos_retraso > 0
          ? ` · ${registro.minutos_retraso} min de retraso`
          : ''

      toast.success('Asistencia registrada', {
        description: `${estudiante.nombre} · ${estado.etiqueta}${retraso}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
      onCerrar()
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error)
      setErrorLectura(mensaje)
      toast.error('No se pudo registrar la asistencia', {
        description: mensaje,
      })
      // Evita que el mismo código invite a repetir el error en cada fotograma.
      bloqueoRef.current = Date.now() + ESPERA_TRAS_ERROR_MS
    },
    onSettled: () => {
      procesandoRef.current = false
    },
  })

  function enviarCodigo(contenido: string) {
    const texto = contenido.trim()
    if (procesandoRef.current) return

    if (!texto) {
      setErrorLectura('El código leído está vacío.')
      return
    }

    if (!PATRON_QR.test(texto)) {
      const mensaje = 'El código no es un QR válido de SESCO.'
      setErrorLectura(mensaje)
      toast.error('QR no válido', { description: mensaje })
      bloqueoRef.current = Date.now() + ESPERA_TRAS_ERROR_MS
      return
    }

    registrar.mutate(texto)
  }

  manejarLecturaRef.current = (texto: string) => {
    if (procesandoRef.current || Date.now() < bloqueoRef.current) return
    enviarCodigo(texto)
  }

  // Reinicia los avisos cada vez que se abre el diálogo.
  useEffect(() => {
    if (!abierto) return
    setErrorLectura(null)
    setCodigoManual('')
    setMostrarManual(false)
    registrar.reset()
    // `registrar` es estable entre renders; solo interesa el cambio de apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  // Enciende y apaga la cámara siguiendo el estado del diálogo.
  useEffect(() => {
    if (!abierto) return

    let vigente = true
    setEstadoCamara('iniciando')
    setErrorCamara(null)

    async function iniciar() {
      // Radix monta el contenido del diálogo en el mismo commit; se espera un
      // fotograma para que el contenedor exista cuando html5-qrcode lo busque.
      await new Promise<void>((resolver) => {
        requestAnimationFrame(() => resolver())
      })
      if (!vigente) return

      try {
        const lector = new Html5Qrcode(CONTENEDOR_ID, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        })
        lectorRef.current = lector

        await lector.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (ancho, alto) => {
              const lado = Math.floor(Math.min(ancho, alto) * 0.72)
              return { width: lado, height: lado }
            },
          },
          (texto) => manejarLecturaRef.current(texto),
          () => {
            // Los fotogramas sin QR son normales: no se muestran.
          },
        )

        if (!vigente) {
          detenerLector(lector)
          return
        }
        setEstadoCamara('activa')
      } catch (error) {
        if (!vigente) return
        setEstadoCamara('error')
        setErrorCamara(mensajeDeCamara(error))
      }
    }

    void iniciar()

    return () => {
      vigente = false
      detenerLector(lectorRef.current)
      lectorRef.current = null
    }
  }, [abierto, intento])

  function enviarManual(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    enviarCodigo(codigoManual)
  }

  const procesando = registrar.isPending

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) onCerrar()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" aria-hidden="true" />
            Escanear QR del estudiante
          </DialogTitle>
          <DialogDescription>
            Apunta la cámara al código dinámico del estudiante. El código
            cambia cada 20 segundos y solo puede usarse una vez.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mx-auto h-[min(46dvh,420px)] w-[min(46dvh,420px)] max-w-full overflow-hidden rounded-xl border border-border bg-black">
          <div
            id={CONTENEDOR_ID}
            className="size-full [&_video]:size-full [&_video]:object-cover"
          />

          {estadoCamara === 'iniciando' ? (
            <Superposicion>
              <LoaderCircle
                className="size-7 animate-spin text-white"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-white">
                Encendiendo la cámara…
              </p>
            </Superposicion>
          ) : null}

          {estadoCamara === 'error' ? (
            <Superposicion>
              <CameraOff className="size-8 text-white/80" aria-hidden="true" />
              <p className="max-w-xs text-center text-sm font-medium text-white">
                {errorCamara ?? 'No se pudo iniciar la cámara.'}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIntento((valor) => valor + 1)}
              >
                <RefreshCw aria-hidden="true" />
                Reintentar
              </Button>
            </Superposicion>
          ) : null}

          {procesando ? (
            <Superposicion className="bg-black/70">
              <LoaderCircle
                className="size-7 animate-spin text-white"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-white">
                Registrando asistencia…
              </p>
            </Superposicion>
          ) : null}

          {estadoCamara === 'activa' && !procesando ? (
            <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              <ScanLine className="size-3.5" aria-hidden="true" />
              Buscando código…
            </span>
          ) : null}
        </div>

        {errorLectura ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {errorLectura}
          </p>
        ) : null}

        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setMostrarManual((valor) => !valor)}
            aria-expanded={mostrarManual}
          >
            <Keyboard aria-hidden="true" />
            {mostrarManual ? 'Ocultar lectura manual' : 'Ingresar código manualmente'}
          </Button>

          {mostrarManual ? (
            <form className="flex items-end gap-2" onSubmit={enviarManual}>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="qr-codigo-manual" className="text-sm">
                  Contenido del código
                </Label>
                <Input
                  id="qr-codigo-manual"
                  value={codigoManual}
                  onChange={(evento) => {
                    setCodigoManual(evento.target.value)
                    setErrorLectura(null)
                  }}
                  placeholder="SESCO|123|12345678"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 font-mono text-base md:text-base"
                  disabled={procesando}
                />
              </div>
              <Button
                type="submit"
                className="h-10"
                disabled={procesando || !codigoManual.trim()}
              >
                <Camera aria-hidden="true" />
                Registrar
              </Button>
            </form>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCerrar}
            disabled={procesando}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Superposicion({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

/** Detiene la cámara sin lanzar si el lector aún no había arrancado. */
function detenerLector(lector: Html5Qrcode | null) {
  if (!lector) return
  try {
    void lector
      .stop()
      .then(() => {
        try {
          lector.clear()
        } catch {
          // El contenedor ya no existe: no hay nada que limpiar.
        }
      })
      .catch(() => {
        try {
          lector.clear()
        } catch {
          // El contenedor ya no existe: no hay nada que limpiar.
        }
      })
  } catch {
    try {
      lector.clear()
    } catch {
      // El contenedor ya no existe: no hay nada que limpiar.
    }
  }
}

/** Traduce los errores de `getUserMedia` a un mensaje para el docente. */
function mensajeDeCamara(error: unknown): string {
  const texto =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : ''

  const minusculas = texto.toLowerCase()

  if (minusculas.includes('notallowed') || minusculas.includes('permission')) {
    return 'El navegador bloqueó el acceso a la cámara. Habilítalo en los permisos del sitio y vuelve a intentarlo.'
  }
  if (minusculas.includes('notfound') || minusculas.includes('not found')) {
    return 'No se encontró una cámara disponible en este dispositivo. Puedes usar el registro manual.'
  }
  if (minusculas.includes('notreadable') || minusculas.includes('in use')) {
    return 'La cámara está siendo usada por otra aplicación. Ciérrala y vuelve a intentarlo.'
  }
  return 'No se pudo iniciar la cámara. Revisa los permisos del navegador o usa el registro manual.'
}
