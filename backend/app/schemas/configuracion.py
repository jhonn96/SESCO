"""DTOs de la configuración de asistencia (``parametro_asistencia``).

La tabla tiene una única fila (``CHECK id = 1``). El Director puede ajustar
las tolerancias con las que se clasifica la asistencia y los umbrales que
disparan las alertas.
"""

from __future__ import annotations

from datetime import datetime, time

from pydantic import Field, model_validator

from app.schemas.common import APIModel


class ParametroAsistenciaBase(APIModel):
    tolerancia_min: int = Field(
        ge=0,
        le=240,
        description="Minutos de retraso que todavía cuentan como presente",
        examples=[10],
    )
    limite_falta_min: int = Field(
        ge=1,
        le=480,
        description="Minutos de retraso a partir de los cuales ya es falta",
        examples=[30],
    )
    umbral_alerta_faltas: int = Field(
        ge=1,
        le=100,
        description="Faltas acumuladas que generan una alerta",
        examples=[3],
    )
    umbral_alerta_tardanzas: int = Field(
        ge=1,
        le=100,
        description="Tardanzas acumuladas que generan una alerta",
        examples=[5],
    )
    umbral_inasistencia_pct: float = Field(
        ge=0,
        le=100,
        description="Porcentaje de inasistencia que marca un curso en riesgo",
        examples=[15.0],
    )
    qr_ventana_seg: int = Field(
        default=30,
        ge=10,
        le=300,
        description="Segundos que permanece vigente cada código QR",
    )
    hora_cierre_dia: time | None = Field(
        default=None,
        description="Hora opcional de cierre de la jornada",
        examples=["18:30:00"],
    )


class ParametroAsistenciaUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados."""

    tolerancia_min: int | None = Field(default=None, ge=0, le=240)
    limite_falta_min: int | None = Field(default=None, ge=1, le=480)
    umbral_alerta_faltas: int | None = Field(default=None, ge=1, le=100)
    umbral_alerta_tardanzas: int | None = Field(default=None, ge=1, le=100)
    umbral_inasistencia_pct: float | None = Field(default=None, ge=0, le=100)
    qr_ventana_seg: int | None = Field(default=None, ge=10, le=300)
    hora_cierre_dia: time | None = None

    @model_validator(mode="after")
    def validar_tolerancias(self) -> "ParametroAsistenciaUpdate":
        if (
            self.tolerancia_min is not None
            and self.limite_falta_min is not None
            and self.limite_falta_min <= self.tolerancia_min
        ):
            raise ValueError(
                "limite_falta_min debe ser mayor que tolerancia_min"
            )
        return self


class ParametroAsistenciaResponse(ParametroAsistenciaBase):
    id: int
    actualizado_por: int | None = None
    actualizado_en: datetime
