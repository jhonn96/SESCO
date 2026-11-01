"""Modelo ORM de la tabla ``periodo`` (gestión + trimestre lectivo)."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, Date, SmallInteger, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.curso import Curso


class Periodo(Base):
    __tablename__ = "periodo"
    __table_args__ = (
        CheckConstraint("trimestre BETWEEN 1 AND 3", name="ck_periodo_trimestre"),
        CheckConstraint("fecha_fin > fecha_ini", name="ck_periodo_fechas"),
        UniqueConstraint("gestion", "trimestre", name="uq_periodo_gestion_trimestre"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    gestion: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    trimestre: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    fecha_ini: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)

    cursos: Mapped[list[Curso]] = relationship(
        back_populates="periodo", passive_deletes=True
    )
