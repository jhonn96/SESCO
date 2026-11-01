"""Modelo ORM de la tabla ``profesor`` (perfil 1:1 de ``usuario``)."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.profesor_curso import ProfesorCurso
    from app.models.usuario import Usuario


class Profesor(Base):
    __tablename__ = "profesor"

    usuario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), primary_key=True, autoincrement=False
    )
    fecha_ingreso: Mapped[date] = mapped_column(Date, nullable=False)
    direccion: Mapped[str] = mapped_column(String(150), nullable=False)
    telefono: Mapped[str] = mapped_column(String(20), nullable=False)

    usuario: Mapped[Usuario] = relationship(back_populates="profesor")
    profesor_cursos: Mapped[list[ProfesorCurso]] = relationship(
        back_populates="profesor", passive_deletes=True
    )
