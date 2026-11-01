import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Camera,
  CameraOff,
  Keyboard,
  LoaderCircle,
  QrCode,
  ScanLine,
} from 'lucide-react'

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

interface DeteccionCodigo {
  rawValue: string
}

interface DetectorCodigo {
  detect(fuente: CanvasImageSource): Promise<DeteccionCodigo[]>
}

type VentanaConDetector = Window & {
  BarcodeDetector?: new (opciones?: {
    formats?: string[]
  }) => DetectorCodigo
}

export interface QrScannerDialogProps {
  abierto: boolean
  onCambiarAbierto: (abierto: boolean) => void
  onDetectar: (contenido: string) => void
  /** Mientras se registra la asistencia se pausa la lectura de la cámara. */
  procesando?: boolean
  /** Error devuelto por el backend al intentar registrar el código. */
  error?: string | null
}

const PATRON_QR = /^SESCO\|\d+\|\d{8}$/

function describirErrorCamara(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'El permiso de cámara fue denegado. Habilítalo en el navegador o usa el ingreso manual.'
    }
    if (error.name === 'NotFoundError') {
      return 'No se encontró una cámara disponible en este equipo. Usa el ingreso manual.'
    }
  }
  return 'No se pudo iniciar la cámara. Usa el ingreso manual del contenido QR.'
}

/**
 * Lector de QR reutilizable para portería y docentes.
 *
 * Usa la API nativa `BarcodeDetector` cuando el navegador la soporta (Chrome,
 * Edge y derivados). Si no está disponible, la cámara no está permitida o el
 * equipo no tiene cámara, queda el ingreso manual del contenido
 * `SESCO|ID_ESTUDIANTE|CODIGO`.
 */
export function QrScannerDialog({
  abierto,
  onCambiarAbierto,
  onDetectar,
  procesando = false,
  error = null,
}: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervaloRef = useRef<number | null>(null)
  const ultimoRef = useRef<{ contenido: string; momento: number } | null>(null)
  const onDetectarRef = useRef(onDetectar)
  const procesandoRef = useRef(procesando)

  const [iniciando, setIniciando] = useState(false)
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [mensajeCamara, setMensajeCamara] = useState<string | null>(null)
  const [textoManual, setTextoManual] = useState('')
  const [errorManual, setErrorManual] = useState<string | null>(null)

  useEffect(() => {
    onDetectarRef.current = onDetectar
  }, [onDetectar])

  useEffect(() => {
    procesandoRef.current = procesando
  }, [procesando])

  useEffect(() => {
    if (!abierto) return

    const video = videoRef.current
    const Detector = (window as VentanaConDetector).BarcodeDetector
    let cancelado = false

    if (!Detector || !navigator.mediaDevices?.getUserMedia || !video) {
      setMensajeCamara(
        'Este navegador no permite escanear con la cámara. Ingresa el contenido del QR manualmente.',
      )
      return
    }

    setIniciando(true)
    setMensajeCamara(null)

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        video.srcObject = stream
        void video.play().catch(() => {
          if (!cancelado) {
            setMensajeCamara(
              'La cámara se activó pero el navegador bloqueó la vista previa. Usa el ingreso manual.',
            )
          }
        })
        setCamaraActiva(true)
        setIniciando(false)

        const detector = new Detector({ formats: ['qr_code'] })

        intervaloRef.current = window.setInterval(() => {
          if (!video || video.readyState < 2 || procesandoRef.current) return

          void detector
            .detect(video)
            .then((detecciones) => {
              const contenido = detecciones[0]?.rawValue?.trim()
              if (!contenido) return

              const ahora = Date.now()
              const ultimo = ultimoRef.current
              if (
                ultimo &&
                ultimo.contenido === contenido &&
                ahora - ultimo.momento < 3000
              ) {
                return
              }

              ultimoRef.current = { contenido, momento: ahora }
              onDetectarRef.current(contenido)
            })
            .catch(() => {
              // Un frame borroso puede fallar; se reintenta en el siguiente ciclo.
            })
        }, 350)
      })
      .catch((error: unknown) => {
        if (cancelado) return
        setIniciando(false)
        setCamaraActiva(false)
        setMensajeCamara(describirErrorCamara(error))
      })

    return () => {
      cancelado = true
      const stream = streamRef.current
      streamRef.current = null
      stream?.getTracks().forEach((track) => track.stop())

      if (intervaloRef.current !== null) {
        window.clearInterval(intervaloRef.current)
        intervaloRef.current = null
      }

      if (video) video.srcObject = null
      setCamaraActiva(false)
      setIniciando(false)
    }
  }, [abierto])

  function cerrar() {
    setTextoManual('')
    setErrorManual(null)
    onCambiarAbierto(false)
  }

  function enviarManual(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const contenido = textoManual.trim()

    if (!contenido) {
      setErrorManual('Ingresa el contenido del código QR.')
      return
    }
    if (!PATRON_QR.test(contenido)) {
      setErrorManual(
        'El contenido debe tener el formato SESCO|ID_ESTUDIANTE|CODIGO (8 dígitos).',
      )
      return
    }

    setErrorManual(null)
    onDetectar(contenido)
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) cerrar()
        else onCambiarAbierto(true)
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" aria-hidden="true" />
            Escanear QR de asistencia
          </DialogTitle>
          <DialogDescription>
            Apunta la cámara al código dinámico del estudiante. El registro se
            clasifica automáticamente según la hora de ingreso.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            playsInline
            muted
            aria-label="Vista previa de la cámara"
          />

          {camaraActiva ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="relative size-40 max-w-[60%] rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                <span className="absolute -top-0.5 -left-0.5 size-4 rounded-tl border-t-4 border-l-4 border-primary" />
                <span className="absolute -top-0.5 -right-0.5 size-4 rounded-tr border-t-4 border-r-4 border-primary" />
                <span className="absolute -bottom-0.5 -left-0.5 size-4 rounded-bl border-b-4 border-l-4 border-primary" />
                <span className="absolute -right-0.5 -bottom-0.5 size-4 rounded-br border-r-4 border-b-4 border-primary" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/80">
              {iniciando ? (
                <>
                  <LoaderCircle
                    className="size-7 animate-spin"
                    aria-hidden="true"
                  />
                  <p className="text-sm">Iniciando cámara…</p>
                </>
              ) : (
                <>
                  <CameraOff className="size-7" aria-hidden="true" />
                  <p className="max-w-sm text-sm">
                    {mensajeCamara ??
                      'La cámara no está activa. Puedes ingresar el código manualmente.'}
                  </p>
                </>
              )}
            </div>
          )}

          {camaraActiva ? (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              <Camera className="size-3.5" aria-hidden="true" />
              Cámara activa
            </span>
          ) : null}
        </div>

        {error ? (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          <span className="inline-flex items-center gap-1.5">
            <Keyboard className="size-3.5" aria-hidden="true" />
            Ingreso manual
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="space-y-2" onSubmit={enviarManual}>
          <Label htmlFor="contenido-qr">Contenido del QR</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <QrCode
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="contenido-qr"
                value={textoManual}
                onChange={(evento) => {
                  setTextoManual(evento.target.value)
                  setErrorManual(null)
                }}
                placeholder="SESCO|123|12345678"
                autoComplete="off"
                spellCheck={false}
                className="h-10 pl-9 font-mono text-base md:text-base"
                aria-invalid={Boolean(errorManual)}
                aria-describedby={
                  errorManual ? 'error-contenido-qr' : 'ayuda-contenido-qr'
                }
              />
            </div>
            <Button
              type="submit"
              className="h-10"
              disabled={procesando || textoManual.trim() === ''}
            >
              {procesando ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ScanLine aria-hidden="true" />
              )}
              Registrar
            </Button>
          </div>
          {errorManual ? (
            <p
              id="error-contenido-qr"
              className="text-sm text-destructive"
              role="alert"
            >
              {errorManual}
            </p>
          ) : (
            <p id="ayuda-contenido-qr" className="text-xs text-muted-foreground">
              Formato esperado: SESCO, el id del estudiante y el código TOTP de
              8 dígitos.
            </p>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
