"""Modelo ORM de la tabla ``justificacion`` (descargo de una falta/tardanza).

Relación 1:1 con ``asistencia``: una asistencia admite como máximo una
justificación (columna ``asistencia_id`` UNIQUE).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.asistencia import Asistencia
    from app.models.notificacion import Notificacion
    from app.models.tutor import Tutor
    from app.models.usuario import Usuario


class Justificacion(Base):
    __tablename__ = "justificacion"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('pendiente','aprobada','rechazada')", name="ck_justificacion_estado"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asistencia_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("asistencia.id"), nullable=False, unique=True
    )
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor.usuario_id"), nullable=False
    )
    motivo: Mapped[str] = mapped_column(String(500), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'pendiente'")
    )
    revisado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    revisado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comentario_resolucion: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    asistencia: Mapped[Asistencia] = relationship(back_populates="justificacion")
    tutor: Mapped[Tutor] = relationship(back_populates="justificaciones")
    revisado_por_usuario: Mapped[Usuario | None] = relationship(
        back_populates="justificaciones_revisadas", foreign_keys=[revisado_por]
    )
    notificaciones: Mapped[list[Notificacion]] = relationship(
        back_populates="justificacion", passive_deletes=True
    )
