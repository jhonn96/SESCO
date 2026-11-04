"""DTOs de auditoría (tabla ``bitacora``).

El Director consulta quién realizó cada acción, sobre qué entidad, cuándo y
desde qué IP. ``usuario_id`` es nullable: las acciones del sistema o de cuentas
eliminadas se muestran con ``usuario=null``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.schemas.common import APIModel
from app.schemas.rol import RolResponse


class BitacoraUsuarioResponse(APIModel):
    """Resumen de la cuenta que generó el evento."""

    id: int
    ci: str
    nombres: str
    apellidos: str
    rol: RolResponse | None = None


class BitacoraResponse(APIModel):
    """Registro de auditoría listo para la vista del Director."""

    id: int
    usuario_id: int | None = None
    accion: str
    entidad: str
    entidad_id: int | None = None
    detalle: dict[str, Any] | None = None
    ip: str | None = None
    momento: datetime
    usuario: BitacoraUsuarioResponse | None = None
