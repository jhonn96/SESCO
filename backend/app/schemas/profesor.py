"""DTOs de ``profesor`` (perfil 1:1 de ``usuario`` con rol profesor)."""

from __future__ import annotations

from datetime import date

from pydantic import Field, field_validator

from app.schemas.common import APIModel
from app.schemas.usuario import UsuarioResponse


def _validar_fecha_ingreso(valor: date) -> date:
    if valor > date.today():
        raise ValueError("La fecha de ingreso no puede ser futura")
    return valor


class ProfesorBase(APIModel):
    fecha_ingreso: date = Field(examples=["2024-02-05"])
    direccion: str = Field(min_length=1, max_length=150, examples=["Av. 6 de Agosto #1234"])
    telefono: str = Field(
        min_length=7,
        max_length=20,
        pattern=r"^[0-9+\-\s()]+$",
        examples=["71234567"],
    )

    @field_validator("fecha_ingreso")
    @classmethod
    def validar_fecha_ingreso(cls, valor: date) -> date:
        return _validar_fecha_ingreso(valor)


class ProfesorCreate(ProfesorBase):
    usuario_id: int = Field(
        gt=0, description="Usuario existente con rol 'profesor' (relación 1:1)"
    )


class ProfesorUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados.

    Los campos personales (``nombres``, ``apellidos`` y ``ci``) viven en
    ``usuario``; el servicio los redirige a esa tabla.
    """

    nombres: str | None = Field(default=None, min_length=1, max_length=80)
    apellidos: str | None = Field(default=None, min_length=1, max_length=80)
    ci: str | None = Field(default=None, min_length=1, max_length=15)
    fecha_ingreso: date | None = None
    direccion: str | None = Field(default=None, min_length=1, max_length=150)
    telefono: str | None = Field(
        default=None, min_length=7, max_length=20, pattern=r"^[0-9+\-\s()]+$"
    )

    @field_validator("fecha_ingreso")
    @classmethod
    def validar_fecha_ingreso(cls, valor: date | None) -> date | None:
        if valor is None:
            return None
        return _validar_fecha_ingreso(valor)


class ProfesorResponse(ProfesorBase):
    usuario_id: int
    usuario: UsuarioResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
