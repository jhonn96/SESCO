"""Modelo ORM de la tabla ``notificacion`` (cola de mensajes al usuario).

Puede originarse en una asistencia, una alerta o una justificación; los tres
vínculos son opcionales e independientes.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.alerta import Alerta
    from app.models.asistencia import Asistencia
    from app.models.justificacion import Justificacion
    from app.models.usuario import Usuario


class Notificacion(Base):
    __tablename__ = "notificacion"
    __table_args__ = (Index("ix_notificacion_usuario", "usuario_id", "leida_en"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("usuario.id"), nullable=False)
    asistencia_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("asistencia.id"))
    alerta_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("alerta.id"))
    justificacion_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("justificacion.id")
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    canal: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'app'")
    )
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    intentos: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    creada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    entregada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    leida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    usuario: Mapped[Usuario] = relationship(back_populates="notificaciones")
    asistencia: Mapped[Asistencia | None] = relationship(back_populates="notificaciones")
    alerta: Mapped[Alerta | None] = relationship(back_populates="notificaciones")
    justificacion: Mapped[Justificacion | None] = relationship(
        back_populates="notificaciones"
    )
