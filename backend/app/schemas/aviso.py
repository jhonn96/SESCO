"""DTOs de ``aviso`` y ``aviso_destinatario`` (RF-10).

Un aviso puede ser ``general``, ``urgente`` o ``citacion``. La audiencia son
tutores y profesores activos: si ``destinatarios`` se omite se difunde a todos
(salvo las citaciones, que exigen destinatarios explícitos).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.common import APIModel
from app.schemas.enums import TipoAviso
from app.schemas.usuario import UsuarioResponse


class AvisoBase(APIModel):
    titulo: str = Field(min_length=3, max_length=120)
    contenido: str = Field(min_length=10)
    tipo: TipoAviso = TipoAviso.GENERAL
    importante: bool = False
    fecha_cita: datetime | None = Field(
        default=None, description="Obligatoria cuando el tipo es 'citacion'"
    )

    @model_validator(mode="after")
    def validar_citacion(self) -> "AvisoBase":
        if self.tipo == TipoAviso.CITACION and self.fecha_cita is None:
            raise ValueError("Una citación requiere fecha_cita")
        return self


class AvisoCreate(AvisoBase):
    destinatarios: list[int] = Field(
        default_factory=list,
        max_length=2000,
        description=(
            "Ids de usuarios (tutores o profesores). Si se omite, el aviso se "
            "difunde a todos los tutores y profesores activos."
        ),
    )


class AvisoUpdate(APIModel):
    """Actualización parcial; la audiencia no se modifica."""

    titulo: str | None = Field(default=None, min_length=3, max_length=120)
    contenido: str | None = Field(default=None, min_length=10)
    tipo: TipoAviso | None = None
    importante: bool | None = None
    fecha_cita: datetime | None = None


class AvisoDestinatarioResponse(APIModel):
    aviso_id: int
    usuario_id: int
    entregado_en: datetime | None = None
    leido_en: datetime | None = None
    confirmado_en: datetime | None = None
    usuario: UsuarioResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


class AvisoResponse(APIModel):
    id: int
    autor_id: int
    titulo: str
    contenido: str
    tipo: TipoAviso
    importante: bool
    fecha_cita: datetime | None = None
    publicado_en: datetime
    autor: UsuarioResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
    destinatarios: list[AvisoDestinatarioResponse] = Field(default_factory=list)
    total_destinatarios: int = 0
    leidos: int = 0
    confirmados: int = 0
