"""Modelo ORM de la tabla ``alerta`` (avisos automáticos por inasistencia).

``tipo`` se calcula con los umbrales de ``parametro_asistencia``: faltas
acumuladas, tardanzas acumuladas, porcentaje de inasistencia o un curso sin
registro de asistencia (``curso_sin_registro``). En este último caso la alerta
apunta al curso (``curso_id``) y no a un estudiante.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.curso import Curso
    from app.models.estudiante import Estudiante
    from app.models.notificacion import Notificacion
    from app.models.usuario import Usuario


class Alerta(Base):
    __tablename__ = "alerta"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('faltas','tardanzas','inasistencia','curso_sin_registro')",
            name="ck_alerta_tipo",
        ),
        Index("ix_alerta_estudiante", "estudiante_id", "atendida"),
        Index("ix_alerta_curso", "curso_id", "atendida"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    estudiante_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("estudiante.usuario_id")
    )
    curso_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("curso.id"))
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text)
    generada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    dia: Mapped[date | None] = mapped_column(Date)
    atendida: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    atendida_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    atendida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    estudiante: Mapped[Estudiante | None] = relationship(back_populates="alertas")
    curso: Mapped[Curso | None] = relationship()
    atendida_por_usuario: Mapped[Usuario | None] = relationship(
        back_populates="alertas_atendidas", foreign_keys=[atendida_por]
    )
    notificaciones: Mapped[list[Notificacion]] = relationship(
        back_populates="alerta", passive_deletes=True
    )
