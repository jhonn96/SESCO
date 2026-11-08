"""DTOs del módulo de alertas (RF-06/RF-07)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.curso import CursoResponse
from app.schemas.enums import TipoAlerta
from app.schemas.estudiante import EstudianteResumen, TutorACargoResponse


class AlertaResponse(APIModel):
    id: int
    estudiante_id: int | None = None
    curso_id: int | None = None
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
    curso: CursoResponse | None = Field(
        default=None,
        description="Curso afectado; se usa en las alertas de tipo curso_sin_registro",
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
    cursos_sin_registro: list[str] = Field(
        default_factory=list,
        description="Cursos que no tuvieron ningún registro de asistencia en el día",
    )
    reportes: list[ReporteInasistenciaResponse]
    notificaciones_creadas: int
    semana_inicio: date
    semana_fin: date
    umbral_inasistencia_pct: float


class EstudianteRiesgoResponse(APIModel):
    """Estudiante que alcanza los umbrales de alerta en los cursos del docente."""

    estudiante_id: int
    nombres: str
    apellidos: str
    ci: str
    curso_id: int
    curso: CursoResponse
    faltas_consecutivas: int
    tardanzas_mes: int
    umbral_faltas: int
    umbral_tardanzas: int
    motivos: list[str] = Field(default_factory=list)
    tutor: TutorACargoResponse | None = None
    notificado_hoy: bool = False


class RiesgoProfesorResponse(APIModel):
    """Estudiantes en riesgo de los cursos asignados al profesor autenticado."""

    generado_en: datetime
    fecha: date
    umbral_faltas: int
    umbral_tardanzas: int
    total_estudiantes: int
    estudiantes: list[EstudianteRiesgoResponse] = Field(default_factory=list)


class NotificacionTutorResponse(APIModel):
    """Resultado del aviso manual del profesor al tutor principal."""

    notificacion_id: int
    estudiante_id: int
    tutor_id: int
    tutor_nombre: str
    mensaje: str
    creada: bool
