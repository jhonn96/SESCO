"""Modelo ORM de la tabla ``curso`` (nivel + grado + paralelo en un periodo)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    CHAR,
    BigInteger,
    CheckConstraint,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.estudiante import Estudiante
    from app.models.horario import Horario
    from app.models.periodo import Periodo
    from app.models.profesor_curso import ProfesorCurso


class Curso(Base):
    __tablename__ = "curso"
    __table_args__ = (
        CheckConstraint(
            "nivel IN ('inicial','primaria','secundaria')", name="ck_curso_nivel"
        ),
        CheckConstraint("grado BETWEEN 1 AND 6", name="ck_curso_grado"),
        CheckConstraint("turno IN ('manana','tarde','noche')", name="ck_curso_turno"),
        UniqueConstraint(
            "nivel", "grado", "paralelo", "periodo_id", name="uq_curso_nivel_grado_paralelo_periodo"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nivel: Mapped[str] = mapped_column(String(12), nullable=False)
    grado: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    paralelo: Mapped[str] = mapped_column(CHAR(1), nullable=False)  # char(1) en el DDL
    turno: Mapped[str] = mapped_column(String(10), nullable=False)
    periodo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("periodo.id"), nullable=False)

    periodo: Mapped[Periodo] = relationship(back_populates="cursos")
    estudiantes: Mapped[list[Estudiante]] = relationship(
        back_populates="curso", passive_deletes=True
    )
    horarios: Mapped[list[Horario]] = relationship(
        back_populates="curso", passive_deletes=True
    )
    profesor_cursos: Mapped[list[ProfesorCurso]] = relationship(
        back_populates="curso", passive_deletes=True
    )
