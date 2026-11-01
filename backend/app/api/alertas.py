"""Router de alertas automáticas (RF-06).

Todas las operaciones son exclusivas del Director. La generación es idempotente:
puede invocarse desde una tarea programada (cron) sin duplicar avisos del mismo
día.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Request, Response, status

from app.api.deps import CurrentDirector, DbSession
from app.models import Alerta
from app.schemas.alerta import AlertaResponse, GeneracionAlertasResponse
from app.schemas.enums import TipoAlerta
from app.services import alerta_service

router = APIRouter()


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post(
    "/generar",
    response_model=GeneracionAlertasResponse,
    status_code=status.HTTP_200_OK,
    summary="Generar alertas y reportes pendientes (solo Director)",
    description=(
        "Revisa las asistencias y crea: (1) alertas por 3 faltas consecutivas "
        "o 5 tardanzas en el mes en el primer bloque, y (2) reportes de curso "
        "cuando la inasistencia semanal supera el umbral configurado. "
        "Es idempotente: repetir la llamada el mismo día no duplica avisos. "
        "Puede programarse como tarea diaria."
    ),
)
def generar_alertas(
    db: DbSession,
    director: CurrentDirector,
    request: Request,
    periodo_id: int | None = Query(
        default=None,
        ge=1,
        description="Acota la revisión a los cursos de un periodo (útil para pruebas y cron)",
    ),
    fecha: date | None = Query(
        default=None,
        description="Fecha de corte; por defecto, hoy en la zona del colegio",
    ),
) -> GeneracionAlertasResponse:
    resultado = alerta_service.generar(
        db,
        periodo_id=periodo_id,
        fecha=fecha,
        usuario_id=director.id,
        ip=_ip(request),
    )
    return GeneracionAlertasResponse(
        alertas_creadas=len(resultado.alertas),
        alertas=[AlertaResponse.model_validate(a) for a in resultado.alertas],
        cursos_evaluados=resultado.cursos_evaluados,
        reportes=resultado.reportes,
        notificaciones_creadas=resultado.notificaciones_creadas,
        semana_inicio=resultado.semana_inicio,
        semana_fin=resultado.semana_fin,
        umbral_inasistencia_pct=resultado.umbral_inasistencia_pct,
    )


@router.get(
    "",
    response_model=list[AlertaResponse],
    summary="Listar alertas (solo Director)",
)
def listar_alertas(
    db: DbSession,
    _director: CurrentDirector,
    response: Response,
    estudiante_id: int | None = Query(default=None, ge=1),
    tipo: TipoAlerta | None = Query(default=None),
    atendida: bool | None = Query(default=None),
    desde: date | None = Query(default=None, description="Día de generación mínimo"),
    hasta: date | None = Query(default=None, description="Día de generación máximo"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Alerta]:
    items, total = alerta_service.listar(
        db,
        estudiante_id=estudiante_id,
        tipo=tipo,
        atendida=atendida,
        desde=desde,
        hasta=hasta,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.patch(
    "/{alerta_id}/atender",
    response_model=AlertaResponse,
    summary="Marcar una alerta como atendida (solo Director)",
)
def atender_alerta(
    alerta_id: int,
    db: DbSession,
    director: CurrentDirector,
    request: Request,
) -> Alerta:
    return alerta_service.atender(
        db,
        alerta_id=alerta_id,
        usuario_id=director.id,
        ip=_ip(request),
    )
