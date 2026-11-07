import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import type { Notificacion } from '@/services/notificaciones'

const PING_MS = 25_000
const REINTENTO_MAX_MS = 30_000

interface EventoConectado {
  evento: 'conectado'
  data: { usuario_id: number }
}

interface EventoNotificacion {
  evento: 'notificacion'
  data: Notificacion
}

type EventoRealtime = EventoConectado | EventoNotificacion

/**
 * Canal WebSocket de notificaciones (RF-05).
 *
 * Mantiene abierta una conexión con el backend mientras haya sesión y, al
 * recibir una falta, tardanza o salida, refresca la bandeja del tutor al
 * instante (sin esperar el sondeo de 30 segundos). Se reconecta solo con
 * retroceso exponencial y envía un ping para conservar la conexión viva.
 */
export function useNotificacionesRealtime(): void {
  const { token, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!token || !isAuthenticated) return

    const tokenActual = token
    let socket: WebSocket | null = null
    let temporizadorReintento: number | undefined
    let temporizadorPing: number | undefined
    let reintentos = 0
    let cerrado = false

    function detenerPing() {
      if (temporizadorPing !== undefined) {
        window.clearInterval(temporizadorPing)
        temporizadorPing = undefined
      }
    }

    function manejarMensaje(evento: MessageEvent<string>) {
      let mensaje: EventoRealtime
      try {
        mensaje = JSON.parse(evento.data) as EventoRealtime
      } catch {
        return
      }
      if (mensaje.evento !== 'notificacion') return

      const notificacion = mensaje.data
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'notificaciones'],
      })
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'hijos'] })
      void queryClient.invalidateQueries({
        queryKey: ['tutor', 'historial-hoy'],
      })

      toast.info(notificacion.mensaje, {
        description: 'Notificación en tiempo real',
      })
    }

    function conectar() {
      if (cerrado) return

      const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${protocolo}//${window.location.host}/api/notificaciones/ws?token=${encodeURIComponent(tokenActual)}`

      socket = new WebSocket(url)

      socket.onopen = () => {
        reintentos = 0
        detenerPing()
        temporizadorPing = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
        }, PING_MS)
      }

      socket.onmessage = manejarMensaje

      socket.onerror = () => socket?.close()

      socket.onclose = () => {
        detenerPing()
        if (cerrado) return
        const espera = Math.min(REINTENTO_MAX_MS, 1000 * 2 ** reintentos)
        reintentos += 1
        temporizadorReintento = window.setTimeout(conectar, espera)
      }
    }

    conectar()

    return () => {
      cerrado = true
      if (temporizadorReintento !== undefined) {
        window.clearTimeout(temporizadorReintento)
      }
      detenerPing()
      socket?.close()
      socket = null
    }
  }, [token, isAuthenticated, queryClient])
}
