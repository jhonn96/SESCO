"""Utilidades de auditoría compartidas por los servicios.

``bitacora.ip`` es de tipo ``INET``: un valor no parseable (por ejemplo el
``testclient`` de Starlette) hace fallar el INSERT, así que se descarta.
"""

from __future__ import annotations

import ipaddress
from typing import Any

from sqlalchemy.orm import Session

from app.models import Bitacora


def ip_valida(valor: str | None) -> str | None:
    """Devuelve la IP solo si es parseable; en caso contrario ``None``."""
    if not valor:
        return None
    try:
        ipaddress.ip_address(valor)
    except ValueError:
        return None
    return valor


def registrar(
    db: Session,
    *,
    usuario_id: int | None,
    accion: str,
    entidad: str,
    entidad_id: int | None = None,
    detalle: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Añade una fila a la bitácora dentro de la transacción en curso."""
    db.add(
        Bitacora(
            usuario_id=usuario_id,
            accion=accion,
            entidad=entidad,
            entidad_id=entidad_id,
            detalle=detalle,
            ip=ip_valida(ip),
        )
    )
