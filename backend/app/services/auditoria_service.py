"""Capa de negocio de auditoría (tabla ``bitacora``).

Solo lectura: el Director consulta los eventos registrados por los servicios.
Los filtros de fecha se interpretan como días completos en la zona horaria del
colegio (UTC-4), igual que el resto de reportes.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import Bitacora, Usuario
from app.services import qr_service


def _condiciones(
    *,
    usuario: str | None,
    usuario_id: int | None,
    accion: str | None,
    entidad: str | None,
    desde: date | None,
    hasta: date | None,
) -> list[Any]:
    condiciones: list[Any] = []

    if usuario_id is not None:
        condiciones.append(Bitacora.usuario_id == usuario_id)

    if usuario:
        patron = f"%{usuario.strip()}%"
        condiciones.append(
            Bitacora.usuario.has(
                or_(
                    Usuario.nombres.ilike(patron),
                    Usuario.apellidos.ilike(patron),
                    Usuario.ci.ilike(patron),
                )
            )
        )

    if accion:
        condiciones.append(Bitacora.accion == accion.strip().upper())

    if entidad:
        condiciones.append(Bitacora.entidad == entidad.strip())

    if desde is not None:
        inicio = datetime.combine(desde, time.min, tzinfo=qr_service.ZONA_HORARIA)
        condiciones.append(Bitacora.momento >= inicio)

    if hasta is not None:
        fin = datetime.combine(
            hasta + timedelta(days=1), time.min, tzinfo=qr_service.ZONA_HORARIA
        )
        condiciones.append(Bitacora.momento < fin)

    return condiciones


def listar(
    db: Session,
    *,
    usuario: str | None = None,
    usuario_id: int | None = None,
    accion: str | None = None,
    entidad: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Bitacora], int]:
    """Devuelve los eventos más recientes y el total sin paginar."""
    condiciones = _condiciones(
        usuario=usuario,
        usuario_id=usuario_id,
        accion=accion,
        entidad=entidad,
        desde=desde,
        hasta=hasta,
    )

    total = (
        db.scalar(select(func.count()).select_from(Bitacora).where(*condiciones))
        or 0
    )
    items = list(
        db.scalars(
            select(Bitacora)
            .options(joinedload(Bitacora.usuario).joinedload(Usuario.rol))
            .where(*condiciones)
            .order_by(Bitacora.momento.desc(), Bitacora.id.desc())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def acciones_distintas(db: Session) -> list[str]:
    """Acciones presentes en la bitácora, para el selector de filtros."""
    return list(
        db.scalars(select(Bitacora.accion).distinct().order_by(Bitacora.accion))
    )
