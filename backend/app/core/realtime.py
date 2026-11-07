"""Notificaciones en tiempo real por WebSocket (RF-05).

El tutor recibe las faltas, tardanzas y salidas en menos de un segundo, sin
esperar el sondeo periódico del frontend.

Arquitectura
------------
- ``GestorConexiones`` mantiene una conexión por usuario autenticado.
- Los servicios siguen escribiendo en la tabla ``notificacion`` sin cambios:
  un evento de SQLAlchemy (``after_flush`` + ``after_commit``) detecta las
  notificaciones nuevas y las difunde solo cuando la transacción confirma.
- Los servicios son síncronos (FastAPI los ejecuta en un hilo aparte), por lo
  que el envío se agenda en el event loop con ``run_coroutine_threadsafe``.

Es una solución en memoria: funciona con un único proceso de Uvicorn, que es
el despliegue previsto para el colegio. Con varios workers haría falta un
bus compartido (Redis pub/sub).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import Notificacion
from app.schemas.notificacion import NotificacionResponse

logger = logging.getLogger(__name__)

_CLAVE_PENDIENTES = "sesco_notificaciones_pendientes"


class GestorConexiones:
    """Conexiones WebSocket activas agrupadas por ``usuario_id``."""

    def __init__(self) -> None:
        self._por_usuario: dict[int, set[WebSocket]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def vincular_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def desvincular_loop(self) -> None:
        self._loop = None

    async def conectar(self, usuario_id: int, websocket: WebSocket) -> None:
        self._por_usuario.setdefault(usuario_id, set()).add(websocket)

    async def desconectar(self, usuario_id: int, websocket: WebSocket) -> None:
        conexiones = self._por_usuario.get(usuario_id)
        if conexiones is None:
            return
        conexiones.discard(websocket)
        if not conexiones:
            self._por_usuario.pop(usuario_id, None)

    async def enviar(self, usuario_id: int, payload: dict[str, Any]) -> None:
        conexiones = list(self._por_usuario.get(usuario_id, ()))
        if not conexiones:
            return

        texto = json.dumps(payload, default=str)
        for websocket in conexiones:
            try:
                await websocket.send_text(texto)
            except Exception:  # conexión cerrada por el cliente
                await self.desconectar(usuario_id, websocket)

    def enviar_desde_hilo(self, usuario_id: int, payload: dict[str, Any]) -> None:
        """Agenda el envío desde un hilo de trabajo sin bloquearlo."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self.enviar(usuario_id, payload), loop)
        except RuntimeError:  # el loop se cerró entre la comprobación y el envío
            logger.debug("No se pudo agendar la notificación en tiempo real")


gestor = GestorConexiones()


def _payload(notificacion: Notificacion) -> dict[str, Any]:
    datos = NotificacionResponse.model_validate(notificacion).model_dump(mode="json")
    return {"evento": "notificacion", "data": datos}


@event.listens_for(Session, "after_flush")
def _recoger_notificaciones(session: Session, _flush_context: object) -> None:
    nuevas = [obj for obj in session.new if isinstance(obj, Notificacion)]
    if nuevas:
        session.info.setdefault(_CLAVE_PENDIENTES, []).extend(nuevas)


@event.listens_for(Session, "after_commit")
def _difundir_notificaciones(session: Session) -> None:
    pendientes = session.info.pop(_CLAVE_PENDIENTES, [])
    for notificacion in pendientes:
        try:
            payload = _payload(notificacion)
        except Exception:  # la fila pudo eliminarse antes de confirmar
            logger.exception("No se pudo serializar una notificación en tiempo real")
            continue
        gestor.enviar_desde_hilo(payload["data"]["usuario_id"], payload)


@event.listens_for(Session, "after_rollback")
def _descartar_pendientes(session: Session) -> None:
    session.info.pop(_CLAVE_PENDIENTES, None)
