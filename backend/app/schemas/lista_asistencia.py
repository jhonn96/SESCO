"""DTOs de la lista mensual de asistencia del profesor."""

from __future__ import annotations

from datetime import date

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.curso import CursoResponse
from app.schemas.enums import EstadoAsistencia
from app.schemas.materia import MateriaResponse


class DiaListaAsistencia(APIModel):
    fecha: date
    dia: int = Field(ge=1, le=31)
    dia_semana: str
    es_clase: bool


class EstudianteListaAsistencia(APIModel):
    usuario_id: int
    nombres: str
    apellidos: str
    ci: str
    estados: dict[str, EstadoAsistencia] = Field(default_factory=dict)


class ListaAsistenciaResponse(APIModel):
    mes: str = Field(examples=["2026-11"])
    curso: CursoResponse
    materia: MateriaResponse
    dias: list[DiaListaAsistencia]
    estudiantes: list[EstudianteListaAsistencia]
