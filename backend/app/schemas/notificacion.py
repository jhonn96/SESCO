"""DTOs de la cola de notificaciones del usuario (RF-05)."""

from __future__ import annotations

from datetime import datetime

from app.schemas.common import APIModel


class NotificacionResponse(APIModel):
    """Mensaje encolado para el usuario autenticado."""

    id: int
    usuario_id: int
    asistencia_id: int | None = None
    alerta_id: int | None = None
    justificacion_id: int | None = None
    tipo: str
    canal: str
    mensaje: str
    intentos: int
    creada_en: datetime
    entregada_en: datetime | None = None
    leida_en: datetime | None = None
