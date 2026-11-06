"""DTOs de reportes y panel de asistencia (RF-08)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.curso import CursoResponse
from app.schemas.estudiante import TutorACargoResponse


class ResumenEstados(APIModel):
    """Conteo de asistencias por estado."""

    registros: int = 0
    presentes: int = 0
    tardanzas: int = 0
    faltas: int = 0
    justificadas: int = 0


class SerieDia(ResumenEstados):
    """Conteo de asistencias de un día de la semana en curso."""

    fecha: date


class CursoPanel(APIModel):
    curso_id: int
    nivel: str
    grado: int
    paralelo: str
    turno: str
    periodo_id: int
    estudiantes: int
    hoy: ResumenEstados
    semana: ResumenEstados
    inasistencia_pct: float
    supera_umbral: bool


class PanelAsistenciaResponse(APIModel):
    generado_en: datetime
    fecha: date
    semana_inicio: date
    semana_fin: date
    umbral_inasistencia_pct: float
    total_estudiantes: int = 0
    totales_hoy: ResumenEstados
    totales_semana: ResumenEstados
    inasistencia_pct: float
    serie_semana: list[SerieDia] = Field(default_factory=list)
    cursos: list[CursoPanel]


class MesAsistencia(ResumenEstados):
    """Conteo de asistencias de un mes dentro de un periodo lectivo."""

    mes: date
    porcentaje_asistencia: float = 0.0


class ComparacionMensualResponse(APIModel):
    generado_en: datetime
    periodo_id: int
    gestion: int
    trimestre: int
    desde: date
    hasta: date
    totales: ResumenEstados
    porcentaje_asistencia: float = 0.0
    meses: list[MesAsistencia] = Field(default_factory=list)


class EstudianteReporte(APIModel):
    """Totales de asistencia de un estudiante en el rango consultado."""

    usuario_id: int
    apellido_paterno: str
    apellido_materno: str
    nombres: str
    apellidos: str
    ci: str
    curso_id: int
    curso: CursoResponse | None = None
    registros: int = 0
    presentes: int = 0
    tardanzas: int = 0
    faltas: int = 0
    justificadas: int = 0
    porcentaje_asistencia: float = 0.0


class ReporteEstudiantesResponse(APIModel):
    generado_en: datetime
    desde: date
    hasta: date
    curso_id: int | None = None
    total_estudiantes: int = 0
    totales: ResumenEstados
    estudiantes: list[EstudianteReporte] = Field(default_factory=list)


class RankingInasistenciaItem(APIModel):
    """Estudiante dentro del ranking mensual de inasistencias."""

    usuario_id: int
    nombres: str
    apellidos: str
    ci: str
    curso_id: int
    curso: CursoResponse | None = None
    faltas: int = 0
    tardanzas: int = 0
    tutor: TutorACargoResponse | None = None
    tutor_nombre: str | None = None


class RankingInasistenciasResponse(APIModel):
    generado_en: datetime
    desde: date
    hasta: date
    total_estudiantes: int = 0
    estudiantes: list[RankingInasistenciaItem] = Field(default_factory=list)
