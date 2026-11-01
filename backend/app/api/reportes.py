"""Router de reportes y panel de asistencia en tiempo real (RF-08).

Solo el Director puede consultar la situación global por curso.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentDirector, DbSession
from app.schemas.reporte import (
    PanelAsistenciaResponse,
    ReporteEstudiantesResponse,
)
from app.services import reporte_service
from app.services.qr_service import ahora_local

router = APIRouter()


@router.get(
    "/panel",
    response_model=PanelAsistenciaResponse,
    summary="Panel de asistencia por curso (solo Director)",
    description=(
        "Devuelve el total de estudiantes, la serie diaria de la semana en "
        "curso y, por curso, los conteos del día y de la semana (lunes → fecha "
        "consultada) junto con el porcentaje de inasistencia semanal. Marca "
        "con ``supera_umbral`` los cursos que exceden el porcentaje "
        "configurado en ``parametro_asistencia``."
    ),
)
def panel_asistencia(
    db: DbSession,
    _director: CurrentDirector,
    fecha: date | None = Query(
        default=None,
        description="Fecha de corte; por defecto, hoy en la zona del colegio",
    ),
    periodo_id: int | None = Query(
        default=None, ge=1, description="Filtra los cursos de un periodo"
    ),
) -> PanelAsistenciaResponse:
    return reporte_service.panel(db, fecha=fecha, periodo_id=periodo_id)


@router.get(
    "/estudiantes",
    response_model=ReporteEstudiantesResponse,
    summary="Reporte de asistencia por estudiante (solo Director)",
    description=(
        "Totales de días presente, tardanza, falta y justificados por "
        "estudiante en un rango de fechas. El porcentaje de asistencia resta "
        "las faltas a los registros totales."
    ),
)
def reporte_estudiantes(
    db: DbSession,
    _director: CurrentDirector,
    desde: date | None = Query(
        default=None, description="Inicio del rango (por defecto, el mes actual)"
    ),
    hasta: date | None = Query(
        default=None, description="Fin del rango (por defecto, hoy)"
    ),
    curso_id: int | None = Query(
        default=None, ge=1, description="Filtra por un curso específico"
    ),
) -> ReporteEstudiantesResponse:
    hoy = ahora_local().date()
    inicio = desde or hoy.replace(day=1)
    fin = hasta or hoy
    return reporte_service.reporte_estudiantes(
        db,
        desde=inicio,
        hasta=fin,
        curso_id=curso_id,
    )
