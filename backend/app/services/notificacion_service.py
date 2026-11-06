"""Capa de negocio de notificaciones (RF-05).

Cada usuario consulta únicamente su propia cola. Las notificaciones las crean
los módulos de asistencia, alertas y justificaciones; aquí solo se listan y se
marca su lectura.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NoEncontrado
from app.models import Notificacion


def listar(
    db: Session,
    usuario_id: int,
    *,
    solo_no_leidas: bool = False,
    tipo: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Notificacion], int]:
    """Notificaciones del usuario, de la más reciente a la más antigua."""
    condiciones = [Notificacion.usuario_id == usuario_id]
    if solo_no_leidas:
        condiciones.append(Notificacion.leida_en.is_(None))
    if tipo:
        condiciones.append(Notificacion.tipo == tipo)

    total = (
        db.scalar(
            select(func.count()).select_from(Notificacion).where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(Notificacion)
            .where(*condiciones)
            .order_by(Notificacion.creada_en.desc(), Notificacion.id.desc())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def marcar_leida(
    db: Session, notificacion_id: int, *, usuario_id: int
) -> Notificacion:
    """Marca la notificación como leída; solo su destinatario puede hacerlo."""
    notificacion = db.get(Notificacion, notificacion_id)
    if notificacion is None or notificacion.usuario_id != usuario_id:
        raise NoEncontrado(f"No existe la notificación {notificacion_id}")

    if notificacion.leida_en is None:
        ahora = datetime.now(timezone.utc)
        notificacion.leida_en = ahora
        if notificacion.entregada_en is None:
            notificacion.entregada_en = ahora
        db.commit()
        db.refresh(notificacion)
    return notificacion
