"""Router de notificaciones (RF-05).

El usuario autenticado consulta su propia cola y marca sus mensajes como
leídos. No se exponen notificaciones de otros usuarios.

También expone el canal WebSocket ``/api/notificaciones/ws``: el tutor recibe
las faltas, tardanzas y salidas en tiempo real, sin esperar el sondeo de 30 s.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.database import SessionLocal
from app.core.realtime import gestor
from app.core.security import TIPO_TOKEN_ACCESO, TokenError, decode_token
from app.models import Notificacion, Usuario
from app.schemas.notificacion import NotificacionResponse
from app.services import notificacion_service

router = APIRouter()


@router.get(
    "",
    response_model=list[NotificacionResponse],
    summary="Listar mis notificaciones",
    description=(
        "Devuelve la cola del usuario autenticado, de la más reciente a la "
        "más antigua. El total se expone en la cabecera ``X-Total-Count``."
    ),
)
def listar_notificaciones(
    db: DbSession,
    usuario: CurrentUser,
    response: Response,
    solo_no_leidas: bool = Query(
        default=False, description="Restringe a las notificaciones sin leer"
    ),
    tipo: str | None = Query(
        default=None, max_length=20, description="Filtra por tipo de notificación"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Notificacion]:
    items, total = notificacion_service.listar(
        db,
        usuario.id,
        solo_no_leidas=solo_no_leidas,
        tipo=tipo,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.patch(
    "/{notificacion_id}/leer",
    response_model=NotificacionResponse,
    summary="Marcar una notificación como leída",
    description="Solo el destinatario de la notificación puede marcarla.",
)
def marcar_notificacion_leida(
    notificacion_id: int, db: DbSession, usuario: CurrentUser
) -> Notificacion:
    return notificacion_service.marcar_leida(
        db, notificacion_id, usuario_id=usuario.id
    )


def _usuario_id_desde_token(token: str) -> int | None:
    """Autentica el handshake del WebSocket y devuelve el usuario activo."""
    try:
        payload = decode_token(token)
    except TokenError:
        return None

    if payload.get("tipo") != TIPO_TOKEN_ACCESO:
        return None
    try:
        usuario_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        return None

    db = SessionLocal()
    try:
        usuario = db.scalar(select(Usuario).where(Usuario.id == usuario_id))
        if usuario is None or not usuario.activo:
            return None
        if usuario.bloqueado_hasta is not None and usuario.bloqueado_hasta > (
            datetime.now(timezone.utc)
        ):
            return None
        return usuario.id
    finally:
        db.close()


@router.websocket("/ws")
async def notificaciones_ws(websocket: WebSocket, token: str = Query(...)) -> None:
    """Canal en tiempo real de la cola personal de notificaciones.

    El navegador no permite enviar cabeceras ``Authorization`` al abrir un
    WebSocket, por eso el JWT viaja en la cadena de consulta. Solo se aceptan
    conexiones de usuarios activos y cada conexión recibe únicamente sus
    propias notificaciones.
    """
    usuario_id = await asyncio.to_thread(_usuario_id_desde_token, token)
    if usuario_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await gestor.conectar(usuario_id, websocket)
    try:
        await websocket.send_json(
            {"evento": "conectado", "data": {"usuario_id": usuario_id}}
        )
        while True:
            # El cliente envía "ping" periódicamente para mantener viva la conexión.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await gestor.desconectar(usuario_id, websocket)
