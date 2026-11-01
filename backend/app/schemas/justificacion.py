"""DTOs de ``justificacion`` (RF-09).

El tutor envía el descargo el mismo día de la falta; el Director o el Profesor
lo aprueban o rechazan. Una asistencia admite una única justificación
(``asistencia_id`` es UNIQUE en el esquema).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.asistencia import AsistenciaResponse
from app.schemas.common import APIModel
from app.schemas.enums import EstadoJustificacion


class JustificacionCreate(APIModel):
    asistencia_id: int = Field(gt=0)
    motivo: str = Field(
        min_length=10,
        max_length=500,
        examples=["Cita médica programada en el Hospital del Niño"],
    )


class JustificacionResolucion(APIModel):
    """Resolución del Director o Profesor sobre una justificación pendiente."""

    estado: EstadoJustificacion = Field(examples=["aprobada"])
    comentario_resolucion: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validar_resolucion(self) -> "JustificacionResolucion":
        if self.estado == EstadoJustificacion.PENDIENTE:
            raise ValueError("Solo se puede aprobar o rechazar una justificación")
        if (
            self.estado == EstadoJustificacion.RECHAZADA
            and not (self.comentario_resolucion or "").strip()
        ):
            raise ValueError("Debe indicar el motivo del rechazo")
        return self


class JustificacionResponse(APIModel):
    id: int
    asistencia_id: int
    tutor_id: int
    motivo: str
    estado: EstadoJustificacion
    revisado_por: int | None = None
    revisado_en: datetime | None = None
    comentario_resolucion: str | None = None
    creado_en: datetime
    asistencia: AsistenciaResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
