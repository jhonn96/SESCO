"""DTOs de ``periodo`` (gestión + trimestre lectivo)."""

from __future__ import annotations

from datetime import date

from pydantic import Field, model_validator

from app.schemas.common import APIModel


class PeriodoBase(APIModel):
    gestion: int = Field(ge=1900, le=2200, examples=[2026])
    trimestre: int = Field(ge=1, le=3, examples=[3])
    fecha_ini: date = Field(examples=["2026-08-03"])
    fecha_fin: date = Field(examples=["2026-11-30"])

    @model_validator(mode="after")
    def validar_fechas(self) -> "PeriodoBase":
        if self.fecha_fin <= self.fecha_ini:
            raise ValueError("fecha_fin debe ser posterior a fecha_ini")
        return self


class PeriodoCreate(PeriodoBase):
    pass


class PeriodoUpdate(APIModel):
    """Actualización parcial; el servicio revalida el rango completo."""

    gestion: int | None = Field(default=None, ge=1900, le=2200)
    trimestre: int | None = Field(default=None, ge=1, le=3)
    fecha_ini: date | None = None
    fecha_fin: date | None = None


class PeriodoResponse(PeriodoBase):
    id: int
