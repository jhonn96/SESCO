"""Utilidades compartidas por los esquemas Pydantic.

``APIModel`` centraliza la configuración común: lectura desde atributos ORM
(``from_attributes``) y limpieza de espacios en los campos de texto.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    """Base para todos los DTO de la API."""

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        extra="forbid",
    )


class HealthResponse(BaseModel):
    """Respuesta del endpoint ``/health``."""

    status: Literal["ok", "error"]
    app: str
    version: str
    environment: str
    database: str
