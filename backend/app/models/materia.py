"""Modelo ORM de la tabla ``materia`` (catálogo de asignaturas)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.horario import Horario


class Materia(Base):
    __tablename__ = "materia"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)

    horarios: Mapped[list[Horario]] = relationship(
        back_populates="materia", passive_deletes=True
    )
