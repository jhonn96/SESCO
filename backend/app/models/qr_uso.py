"""Modelo ORM de la tabla ``qr_uso`` (control anti-replay del QR dinámico).

``ventana`` es el contador TOTP (``int(time.time() // ventana_seg)``). La PK
compuesta impide que el mismo estudiante use dos veces la misma ventana.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.estudiante import Estudiante
    from app.models.usuario import Usuario


class QrUso(Base):
    __tablename__ = "qr_uso"

    estudiante_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("estudiante.usuario_id"), primary_key=True, autoincrement=False
    )
    ventana: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    # Quién escaneó el QR (profesor o personal de portería)
    lector_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    usado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    estudiante: Mapped[Estudiante] = relationship(back_populates="qr_usos")
    lector: Mapped[Usuario | None] = relationship(
        back_populates="qr_usos_lector", foreign_keys=[lector_id]
    )
