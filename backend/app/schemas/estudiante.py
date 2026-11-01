"""DTOs de ``estudiante``.

El campo ``secreto_qr`` (semilla TOTP, ``bytea``) **nunca** forma parte de
ningún esquema: lo genera el backend al crear el estudiante y debe quedar
solo en la base de datos.
"""

from __future__ import annotations

from datetime import date

from pydantic import Field, field_validator

from app.schemas.common import APIModel
from app.schemas.curso import CursoResponse
from app.schemas.usuario import UsuarioResponse


def _validar_fecha_nacimiento(valor: date) -> date:
    if valor >= date.today():
        raise ValueError("La fecha de nacimiento debe ser anterior a hoy")
    return valor


class EstudianteBase(APIModel):
    curso_id: int = Field(gt=0)
    fecha_nac: date = Field(examples=["2012-04-18"])

    @field_validator("fecha_nac")
    @classmethod
    def validar_fecha_nac(cls, valor: date) -> date:
        return _validar_fecha_nacimiento(valor)


class EstudianteCreate(EstudianteBase):
    usuario_id: int = Field(
        gt=0, description="Usuario existente con rol 'estudiante' (relación 1:1)"
    )


class EstudianteUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados.

    Los campos personales (``nombres``, ``apellidos`` y ``ci``) viven en
    ``usuario``; el servicio los redirige a esa tabla.
    """

    nombres: str | None = Field(default=None, min_length=1, max_length=80)
    apellidos: str | None = Field(default=None, min_length=1, max_length=80)
    ci: str | None = Field(default=None, min_length=1, max_length=15)
    curso_id: int | None = Field(default=None, gt=0)
    fecha_nac: date | None = None

    @field_validator("fecha_nac")
    @classmethod
    def validar_fecha_nac(cls, valor: date | None) -> date | None:
        if valor is None:
            return None
        return _validar_fecha_nacimiento(valor)


class EstudianteResumen(APIModel):
    """Versión compacta para anidar en otros DTO (p. ej. asistencia)."""

    usuario_id: int
    curso_id: int


class EstudianteResponse(EstudianteResumen):
    fecha_nac: date
    usuario: UsuarioResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
    curso: CursoResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


class TutorACargoResponse(APIModel):
    """Tutor principal del estudiante (vínculo ``confirmada``)."""

    tutor_id: int
    nombres: str
    apellidos: str
    ci: str
    parentesco: str = Field(examples=["Madre"])
    telefono: str | None = Field(
        default=None, description="Teléfono de contacto del tutor"
    )
    es_principal: bool = False
