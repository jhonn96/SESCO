"""Modelo ORM de la tabla ``asistencia`` (registro diario por bloque).

Estados válidos (según ``sesco_db.sql``): ``presente``, ``tardanza``,
``falta`` y ``justificada``. La clasificación se calcula con
``parametro_asistencia.tolerancia_min`` y ``limite_falta_min``.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.estudiante import Estudiante
    from app.models.horario import Horario
    from app.models.justificacion import Justificacion
    from app.models.notificacion import Notificacion
    from app.models.usuario import Usuario


class Asistencia(Base):
    __tablename__ = "asistencia"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('presente','tardanza','falta','justificada')",
            name="ck_asistencia_estado",
        ),
        CheckConstraint("origen IN ('qr','manual')", name="ck_asistencia_origen"),
        CheckConstraint(
            "hora_salida IS NULL OR hora_ingreso IS NULL OR hora_salida >= hora_ingreso",
            name="ck_asistencia_horas",
        ),
        UniqueConstraint(
            "estudiante_id", "fecha", "horario_id", name="uq_asistencia_estudiante_fecha_horario"
        ),
        Index("ix_asistencia_fecha", "fecha"),
        Index("ix_asistencia_estado", "estado", "fecha"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    estudiante_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("estudiante.usuario_id"), nullable=False
    )
    horario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("horario.id"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    hora_ingreso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hora_salida: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    minutos_retraso: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    estado: Mapped[str] = mapped_column(String(12), nullable=False)
    origen: Mapped[str] = mapped_column(String(6), nullable=False)
    registrado_por: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("usuario.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    estudiante: Mapped[Estudiante] = relationship(back_populates="asistencias")
    horario: Mapped[Horario] = relationship(back_populates="asistencias")
    registrado_por_usuario: Mapped[Usuario | None] = relationship(
        back_populates="asistencias_registradas", foreign_keys=[registrado_por]
    )
    justificacion: Mapped[Justificacion | None] = relationship(
        back_populates="asistencia", uselist=False, passive_deletes=True
    )
    notificaciones: Mapped[list[Notificacion]] = relationship(
        back_populates="asistencia", passive_deletes=True
    )
