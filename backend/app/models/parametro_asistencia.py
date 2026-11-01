"""Modelo ORM de la tabla ``parametro_asistencia`` (configuración única).

Fila única garantizada por ``CHECK (id = 1)``. Define las tolerancias con las
que se clasifica la asistencia y la ventana de validez del QR.
"""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    Time,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.usuario import Usuario


class ParametroAsistencia(Base):
    __tablename__ = "parametro_asistencia"
    __table_args__ = (CheckConstraint("id = 1", name="ck_parametro_asistencia_id_unico"),)

    id: Mapped[int] = mapped_column(
        SmallInteger, primary_key=True, autoincrement=False, server_default=text("1")
    )
    tolerancia_min: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("10")
    )
    limite_falta_min: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("30")
    )
    umbral_alerta_faltas: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("3")
    )
    umbral_alerta_tardanzas: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("5")
    )
    umbral_inasistencia_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("15.0")
    )
    # Ventana de validez del código TOTP (el esquema la fija en 30 s)
    qr_ventana_seg: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("30")
    )
    hora_cierre_dia: Mapped[time | None] = mapped_column(Time)
    actualizado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    actualizado_por_usuario: Mapped[Usuario | None] = relationship(
        back_populates="parametros_actualizados", foreign_keys=[actualizado_por]
    )
