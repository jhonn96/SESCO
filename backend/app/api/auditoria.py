"""Router de auditoría (RNF-02 / RD-02).

Solo el Director puede consultar la bitácora. El endpoint es de solo lectura:
los eventos los escriben los servicios mediante ``core.audit.registrar``.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentDirector, DbSession
from app.models import Bitacora
from app.schemas.auditoria import BitacoraResponse
from app.services import auditoria_service

router = APIRouter()


@router.get(
    "/acciones",
    response_model=list[str],
    summary="Acciones registradas en la bitácora (solo Director)",
    description=(
        "Devuelve los tipos de acción distintos presentes en la bitácora para "
        "construir el selector de filtros de la vista de Auditoría."
    ),
)
def listar_acciones(db: DbSession, _director: CurrentDirector) -> list[str]:
    return auditoria_service.acciones_distintas(db)


@router.get(
    "",
    response_model=list[BitacoraResponse],
    summary="Listar la bitácora de auditoría (solo Director)",
    description=(
        "Devuelve los registros de la tabla ``bitacora`` ordenados del más "
        "reciente al más antiguo. Permite buscar por nombre, apellidos o CI "
        "del usuario, filtrar por tipo de acción, entidad y rango de fechas."
    ),
)
def listar_auditoria(
    db: DbSession,
    _director: CurrentDirector,
    response: Response,
    usuario: str | None = Query(
        default=None,
        min_length=1,
        max_length=80,
        description="Busca por nombres, apellidos o CI del usuario",
    ),
    usuario_id: int | None = Query(default=None, ge=1),
    accion: str | None = Query(
        default=None, max_length=40, description="Ej.: LOGIN, REGISTRAR_ASISTENCIA"
    ),
    entidad: str | None = Query(default=None, max_length=30),
    desde: date | None = Query(default=None, description="Día inicial inclusive"),
    hasta: date | None = Query(default=None, description="Día final inclusive"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Bitacora]:
    items, total = auditoria_service.listar(
        db,
        usuario=usuario,
        usuario_id=usuario_id,
        accion=accion,
        entidad=entidad,
        desde=desde,
        hasta=hasta,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items
