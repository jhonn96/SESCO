"""Modelo ORM de la tabla ``profesor_curso`` (asignación profesor - curso).

Clave primaria compuesta ``(profesor_id, curso_id)``; ``es_asesor`` marca al
profesor guía del curso.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.curso import Curso
    from app.models.profesor import Profesor


class ProfesorCurso(Base):
    __tablename__ = "profesor_curso"

    profesor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("profesor.usuario_id"), primary_key=True, autoincrement=False
    )
    curso_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("curso.id"), primary_key=True, autoincrement=False
    )
    es_asesor: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    profesor: Mapped[Profesor] = relationship(back_populates="profesor_cursos")
    curso: Mapped[Curso] = relationship(back_populates="profesor_cursos")
