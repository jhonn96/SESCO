"""DTOs del módulo de alertas (RF-06/RF-07)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.enums import TipoAlerta
from app.schemas.estudiante import EstudianteResumen


class AlertaResponse(APIModel):
    id: int
    estudiante_id: int
    tipo: TipoAlerta
    detalle: str | None = None
    generada_en: datetime
    dia: date | None = None
    atendida: bool
    atendida_por: int | None = None
    atendida_en: datetime | None = None
    estudiante: EstudianteResumen | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


class ReporteInasistenciaResponse(APIModel):
    """Reporte automático de un curso que superó el umbral semanal."""

    curso_id: int
    curso: str
    registros: int
    faltas: int
    inasistencia_pct: float
    notificaciones_creadas: int


class GeneracionAlertasResponse(APIModel):
    alertas_creadas: int
    alertas: list[AlertaResponse]
    cursos_evaluados: int
    reportes: list[ReporteInasistenciaResponse]
    notificaciones_creadas: int
    semana_inicio: date
    semana_fin: date
    umbral_inasistencia_pct: float
