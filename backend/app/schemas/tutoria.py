"""DTOs de ``tutoria`` (vínculo estudiante - tutor).

RD-02: el vínculo se crea en estado ``pendiente`` y solo el Director puede
confirmarlo. La baja es lógica (``estado='baja'``).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.enums import EstadoTutoria, Parentesco


class TutoriaCreate(APIModel):
    estudiante_id: int = Field(gt=0)
    tutor_id: int = Field(gt=0)
    parentesco: Parentesco
    es_principal: bool = Field(
        default=False, description="Si es True, desplaza al tutor principal anterior"
    )


class TutoriaUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados."""

    parentesco: Parentesco | None = None
    es_principal: bool | None = None


class TutoriaResponse(APIModel):
    estudiante_id: int
    tutor_id: int
    parentesco: Parentesco
    es_principal: bool
    estado: EstadoTutoria
    confirmado_por: int | None = None
    confirmado_en: datetime | None = None
