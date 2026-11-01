"""DTOs de ``materia`` (catálogo de asignaturas)."""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import APIModel


class MateriaBase(APIModel):
    nombre: str = Field(min_length=1, max_length=80, examples=["Matemática"])


class MateriaCreate(MateriaBase):
    pass


class MateriaUpdate(APIModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)


class MateriaResponse(MateriaBase):
    id: int
