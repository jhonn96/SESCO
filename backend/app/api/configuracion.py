"""Router de configuración de asistencia (solo Director).

Expone la fila única de ``parametro_asistencia`` para que el Director ajuste
tolerancias, umbrales de alerta y el porcentaje de inasistencia sin tocar la
base de datos.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import CurrentDirector, DbSession
from app.schemas.configuracion import (
    ParametroAsistenciaResponse,
    ParametroAsistenciaUpdate,
)
from app.services import configuracion_service

router = APIRouter()


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get(
    "/parametros-asistencia",
    response_model=ParametroAsistenciaResponse,
    summary="Obtener la configuración de asistencia (solo Director)",
)
def obtener_parametros(
    db: DbSession, _director: CurrentDirector
) -> ParametroAsistenciaResponse:
    return configuracion_service.obtener(db)


@router.put(
    "/parametros-asistencia",
    response_model=ParametroAsistenciaResponse,
    summary="Actualizar la configuración de asistencia (solo Director)",
    description=(
        "Actualización parcial de ``parametro_asistencia``. ``limite_falta_min`` "
        "debe ser mayor que ``tolerancia_min``. Cada cambio queda en la bitácora."
    ),
)
def actualizar_parametros(
    datos: ParametroAsistenciaUpdate,
    db: DbSession,
    director: CurrentDirector,
    request: Request,
) -> ParametroAsistenciaResponse:
    return configuracion_service.actualizar(
        db,
        datos=datos,
        usuario_id=director.id,
        ip=_ip(request),
    )
