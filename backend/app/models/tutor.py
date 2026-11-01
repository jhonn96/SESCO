"""Modelo ORM de la tabla ``tutor`` (padre/madre/apoderado, 1:1 con ``usuario``)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.justificacion import Justificacion
    from app.models.tutoria import Tutoria
    from app.models.usuario import Usuario


class Tutor(Base):
    __tablename__ = "tutor"

    usuario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), primary_key=True, autoincrement=False
    )
    telefono: Mapped[str] = mapped_column(String(20), nullable=False)

    usuario: Mapped[Usuario] = relationship(back_populates="tutor")
    tutorias: Mapped[list[Tutoria]] = relationship(
        back_populates="tutor", passive_deletes=True
    )
    justificaciones: Mapped[list[Justificacion]] = relationship(
        back_populates="tutor", passive_deletes=True
    )
