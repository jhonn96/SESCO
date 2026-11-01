"""DTOs de ``usuario`` (cuentas del sistema).

``password_hash`` e ``intentos_fallidos`` nunca se exponen: la contraseña
entra en claro solo en ``Create``/``Update`` y la capa de servicio la hashea.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.rol import RolResponse


class UsuarioBase(APIModel):
    ci: str = Field(min_length=1, max_length=15, examples=["12345678"])
    nombres: str = Field(min_length=1, max_length=80, examples=["Ana"])
    apellidos: str = Field(min_length=1, max_length=80, examples=["Quispe Mamani"])
    rol_id: int = Field(
        ge=1, le=4, description="1=director, 2=profesor, 3=estudiante, 4=tutor"
    )


class UsuarioCreate(UsuarioBase):
    # bcrypt solo considera los primeros 72 bytes de la contraseña
    password: str = Field(
        min_length=8,
        max_length=72,
        description="Contraseña en claro; se hashea antes de persistir",
    )


class UsuarioUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados."""

    ci: str | None = Field(default=None, min_length=1, max_length=15)
    nombres: str | None = Field(default=None, min_length=1, max_length=80)
    apellidos: str | None = Field(default=None, min_length=1, max_length=80)
    rol_id: int | None = Field(default=None, ge=1, le=4)
    password: str | None = Field(default=None, min_length=8, max_length=72)
    activo: bool | None = None


class UsuarioResponse(UsuarioBase):
    id: int
    activo: bool
    bloqueado_hasta: datetime | None = None
    ultimo_acceso: datetime | None = None
    creado_en: datetime
    rol: RolResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


class DisponibilidadCI(APIModel):
    """Resultado de comprobar si una cédula ya está registrada."""

    ci: str
    disponible: bool
