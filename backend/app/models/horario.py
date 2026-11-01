"""Modelo ORM de la tabla ``horario`` (bloque de clase de un curso).

``dia_semana`` ubica el bloque en la grilla semanal (lunes a viernes).
``es_ultimo_bloque`` identifica el bloque que cierra la jornada de ese día; se
usa para calcular la hora de salida y el cierre del día.
"""

from __future__ import annotations

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    Time,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.asistencia import Asistencia
    from app.models.curso import Curso
    from app.models.materia import Materia


class Horario(Base):
    __tablename__ = "horario"
    __table_args__ = (
        CheckConstraint("hora_fin > hora_inicio", name="ck_horario_horas"),
        CheckConstraint(
            "dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes')",
            name="ck_horario_dia_semana",
        ),
        Index("ix_horario_curso", "curso_id"),
        Index("ix_horario_curso_dia", "curso_id", "dia_semana"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    curso_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("curso.id"), nullable=False)
    materia_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("materia.id"), nullable=False)
    dia_semana: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'lunes'")
    )
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time, nullable=False)
    es_ultimo_bloque: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    curso: Mapped[Curso] = relationship(back_populates="horarios")
    materia: Mapped[Materia] = relationship(back_populates="horarios")
    asistencias: Mapped[list[Asistencia]] = relationship(
        back_populates="horario", passive_deletes=True
    )
