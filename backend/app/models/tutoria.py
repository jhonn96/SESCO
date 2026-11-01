"""Modelo ORM de la tabla ``tutoria`` (vínculo estudiante - tutor).

Clave primaria compuesta ``(estudiante_id, tutor_id)``.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.estudiante import Estudiante
    from app.models.tutor import Tutor
    from app.models.usuario import Usuario


class Tutoria(Base):
    __tablename__ = "tutoria"
    __table_args__ = (
        CheckConstraint(
            "parentesco IN ('Padre','Madre','Abuelo/a','Tutor legal')",
            name="ck_tutoria_parentesco",
        ),
        CheckConstraint(
            "estado IN ('pendiente','confirmada','baja')", name="ck_tutoria_estado"
        ),
        Index("ix_tutoria_tutor", "tutor_id"),
    )

    estudiante_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("estudiante.usuario_id"), primary_key=True, autoincrement=False
    )
    tutor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tutor.usuario_id"), primary_key=True, autoincrement=False
    )
    parentesco: Mapped[str] = mapped_column(String(20), nullable=False)
    es_principal: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    estado: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default=text("'pendiente'")
    )
    confirmado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    confirmado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    estudiante: Mapped[Estudiante] = relationship(back_populates="tutorias")
    tutor: Mapped[Tutor] = relationship(back_populates="tutorias")
    confirmado_por_usuario: Mapped[Usuario | None] = relationship(
        back_populates="tutorias_confirmadas", foreign_keys=[confirmado_por]
    )
