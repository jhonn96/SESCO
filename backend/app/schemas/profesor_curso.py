"""DTOs de ``profesor_curso`` (asignación de un profesor a un curso)."""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.curso import CursoResponse
from app.schemas.profesor import ProfesorResponse


class ProfesorCursoBase(APIModel):
    profesor_id: int = Field(gt=0)
    curso_id: int = Field(gt=0)
    es_asesor: bool = Field(
        default=False,
        description="Profesor guía del curso; solo puede haber uno por curso",
    )


class ProfesorCursoCreate(ProfesorCursoBase):
    pass


class ProfesorCursoResponse(ProfesorCursoBase):
    profesor: ProfesorResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
    curso: CursoResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
