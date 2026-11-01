"""Modelo ORM de la tabla ``estudiante`` (perfil 1:1 de ``usuario``).

``secreto_qr`` guarda la semilla TOTP (RFC 6238) con la que se valida el QR
dinámico; nunca debe exponerse en la API.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, ForeignKey, Index, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.alerta import Alerta
    from app.models.asistencia import Asistencia
    from app.models.curso import Curso
    from app.models.qr_uso import QrUso
    from app.models.tutoria import Tutoria
    from app.models.usuario import Usuario


class Estudiante(Base):
    __tablename__ = "estudiante"
    __table_args__ = (Index("ix_estudiante_curso", "curso_id"),)

    usuario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("usuario.id"), primary_key=True, autoincrement=False
    )
    curso_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("curso.id"), nullable=False)
    fecha_nac: Mapped[date] = mapped_column(Date, nullable=False)
    secreto_qr: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)  # bytea

    usuario: Mapped[Usuario] = relationship(back_populates="estudiante")
    curso: Mapped[Curso] = relationship(back_populates="estudiantes")
    asistencias: Mapped[list[Asistencia]] = relationship(
        back_populates="estudiante", passive_deletes=True
    )
    qr_usos: Mapped[list[QrUso]] = relationship(
        back_populates="estudiante", passive_deletes=True
    )
    alertas: Mapped[list[Alerta]] = relationship(
        back_populates="estudiante", passive_deletes=True
    )
    tutorias: Mapped[list[Tutoria]] = relationship(
        back_populates="estudiante", passive_deletes=True
    )
