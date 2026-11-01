"""Modelo ORM de la tabla ``bitacora`` (auditoría de acciones).

``usuario_id`` es nullable para registrar acciones del sistema o de usuarios
ya eliminados. ``detalle`` es JSONB y ``ip`` es INET (PostgreSQL).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class Bitacora(Base):
    __tablename__ = "bitacora"
    __table_args__ = (Index("ix_bitacora_momento", "momento"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    accion: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad: Mapped[str] = mapped_column(String(30), nullable=False)
    entidad_id: Mapped[int | None] = mapped_column(BigInteger)
    detalle: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(INET)
    momento: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    usuario: Mapped[Usuario | None] = relationship(back_populates="bitacora")
