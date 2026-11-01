"""DTOs de ``rol`` (catálogo de roles).

``rol.id`` no es autogenerado: el esquema fija 1=director, 2=profesor,
3=estudiante y 4=tutor.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import APIModel


class RolBase(APIModel):
    nombre: str = Field(min_length=1, max_length=20, examples=["director"])


class RolCreate(RolBase):
    id: int = Field(
        ge=1,
        le=32767,
        description=(
            "Los ids 1..4 están reservados por el esquema: "
            "1=director, 2=profesor, 3=estudiante, 4=tutor"
        ),
    )


class RolUpdate(APIModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=20)


class RolResponse(RolBase):
    id: int
