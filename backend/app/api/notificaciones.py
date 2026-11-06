"""Router de notificaciones (RF-05).

El usuario autenticado consulta su propia cola y marca sus mensajes como
leídos. No se exponen notificaciones de otros usuarios.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.models import Notificacion
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
