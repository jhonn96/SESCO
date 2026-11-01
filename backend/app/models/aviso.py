"""Modelo ORM de la tabla ``aviso`` (comunicados publicados por el colegio).

Los destinatarios concretos se guardan en ``aviso_destinatario``; un aviso de
tipo ``general`` se difunde a todos.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.aviso_destinatario import AvisoDestinatario
    from app.models.usuario import Usuario


class Aviso(Base):
    __tablename__ = "aviso"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('general','citacion','urgente')", name="ck_aviso_tipo"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    autor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("usuario.id"), nullable=False)
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    contenido: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    importante: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    # Solo para avisos de tipo 'citacion'
    fecha_cita: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    publicado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    autor: Mapped[Usuario] = relationship(
        back_populates="avisos_publicados", foreign_keys=[autor_id]
    )
    destinatarios: Mapped[list[AvisoDestinatario]] = relationship(
        back_populates="aviso", passive_deletes=True
    )
