"""DTOs de ``curso``.

``paralelo`` es ``char(1)`` en PostgreSQL; se normaliza a mayúscula para que
``A`` y ``a`` no generen cursos distintos.
"""

from __future__ import annotations

from pydantic import Field, field_validator

from app.schemas.common import APIModel
from app.schemas.enums import NivelCurso, Turno


class CursoBase(APIModel):
    nivel: NivelCurso = Field(examples=["secundaria"])
    grado: int = Field(ge=1, le=6, examples=[6])
    paralelo: str = Field(min_length=1, max_length=1, examples=["B"])
    turno: Turno = Field(examples=["manana"])
    periodo_id: int = Field(gt=0)

    @field_validator("paralelo")
    @classmethod
    def validar_paralelo(cls, valor: str) -> str:
        valor = valor.strip().upper()
        if not valor.isalpha():
            raise ValueError("El paralelo debe ser una sola letra")
        return valor


class CursoCreate(CursoBase):
    pass


class CursoUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados."""

    nivel: NivelCurso | None = None
    grado: int | None = Field(default=None, ge=1, le=6)
    paralelo: str | None = Field(default=None, min_length=1, max_length=1)
    turno: Turno | None = None
    periodo_id: int | None = Field(default=None, gt=0)

    @field_validator("paralelo")
    @classmethod
    def validar_paralelo(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        valor = valor.strip().upper()
        if not valor.isalpha():
            raise ValueError("El paralelo debe ser una sola letra")
        return valor


class CursoResponse(CursoBase):
    id: int
