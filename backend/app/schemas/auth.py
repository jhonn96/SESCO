"""DTOs de autenticación."""

from __future__ import annotations

from typing import Literal

from pydantic import AliasChoices, Field

from app.schemas.common import APIModel
from app.schemas.usuario import UsuarioResponse


class LoginRequest(APIModel):
    """Credenciales de acceso.

    ``ci`` es el identificador de usuario en SESCO (cédula de identidad). Se
    acepta también ``username`` o ``usuario`` como alias para comodidad del
    frontend.
    """

    ci: str = Field(
        min_length=1,
        max_length=15,
        validation_alias=AliasChoices("ci", "username", "usuario"),
        serialization_alias="ci",
        examples=["11630815"],
    )
    password: str = Field(min_length=1, max_length=72, examples=["Sesco2026!"])


class TokenResponse(APIModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Segundos de vigencia del token")
    usuario: UsuarioResponse
