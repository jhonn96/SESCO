"""Modelo ORM de la tabla ``aviso_destinatario`` (estado de entrega por aviso).

Clave primaria compuesta ``(aviso_id, usuario_id)``; registra la trazabilidad
de entrega, lectura y confirmación de cada comunicado.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.aviso import Aviso
    from app.models.usuario import Usuario


class AvisoDestinatario(Base):
    __tablename__ = "aviso_destinatario"

    aviso_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("aviso.id"), primary_key=True, autoincrement=False
    )
    usuario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), primary_key=True, autoincrement=False
    )
    entregado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    leido_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    aviso: Mapped[Aviso] = relationship(back_populates="destinatarios")
    usuario: Mapped[Usuario] = relationship(back_populates="avisos_recibidos")
