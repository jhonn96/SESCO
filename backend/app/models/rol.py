"""Modelo ORM de la tabla ``rol`` (catálogo de roles del sistema).

``id``: 1=director, 2=profesor, 3=estudiante, 4=tutor.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class Rol(Base):
    __tablename__ = "rol"

    id: Mapped[int] = mapped_column(
        SmallInteger,
        primary_key=True,
        autoincrement=False,
        comment="1=director, 2=profesor, 3=estudiante, 4=tutor",
    )
    nombre: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)

    usuarios: Mapped[list[Usuario]] = relationship(
        back_populates="rol", passive_deletes=True
    )
