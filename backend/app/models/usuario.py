"""Modelo ORM de la tabla ``usuario`` (cuentas del sistema).

Es la entidad central: estudiante, profesor y tutor comparten esta PK
(relación 1:1 por ``usuario_id``).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, SmallInteger, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.alerta import Alerta
    from app.models.asistencia import Asistencia
    from app.models.aviso import Aviso
    from app.models.aviso_destinatario import AvisoDestinatario
    from app.models.bitacora import Bitacora
    from app.models.estudiante import Estudiante
    from app.models.justificacion import Justificacion
    from app.models.notificacion import Notificacion
    from app.models.parametro_asistencia import ParametroAsistencia
    from app.models.profesor import Profesor
    from app.models.qr_uso import QrUso
    from app.models.rol import Rol
    from app.models.tutoria import Tutoria
    from app.models.tutor import Tutor


class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ci: Mapped[str] = mapped_column(String(15), nullable=False, unique=True)
    nombres: Mapped[str] = mapped_column(String(80), nullable=False)
    apellidos: Mapped[str] = mapped_column(String(80), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    rol_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("rol.id"), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    intentos_fallidos: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("0")
    )
    # Bloqueo temporal por intentos fallidos (política de seguridad)
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    # --- Relaciones ---
    # passive_deletes: al borrar el usuario, SQLAlchemy no intenta poner NULL en
    # las FKs de los hijos; PostgreSQL decide (RESTRICT) y se devuelve 409.
    rol: Mapped[Rol] = relationship(back_populates="usuarios")

    # Perfiles 1:1 según el rol asignado
    estudiante: Mapped[Estudiante | None] = relationship(
        back_populates="usuario", uselist=False, passive_deletes=True
    )
    profesor: Mapped[Profesor | None] = relationship(
        back_populates="usuario", uselist=False, passive_deletes=True
    )
    tutor: Mapped[Tutor | None] = relationship(
        back_populates="usuario", uselist=False, passive_deletes=True
    )

    asistencias_registradas: Mapped[list[Asistencia]] = relationship(
        back_populates="registrado_por_usuario",
        foreign_keys="Asistencia.registrado_por",
        passive_deletes=True,
    )
    justificaciones_revisadas: Mapped[list[Justificacion]] = relationship(
        back_populates="revisado_por_usuario",
        foreign_keys="Justificacion.revisado_por",
        passive_deletes=True,
    )
    alertas_atendidas: Mapped[list[Alerta]] = relationship(
        back_populates="atendida_por_usuario",
        foreign_keys="Alerta.atendida_por",
        passive_deletes=True,
    )
    notificaciones: Mapped[list[Notificacion]] = relationship(
        back_populates="usuario", passive_deletes=True
    )
    avisos_publicados: Mapped[list[Aviso]] = relationship(
        back_populates="autor", foreign_keys="Aviso.autor_id", passive_deletes=True
    )
    avisos_recibidos: Mapped[list[AvisoDestinatario]] = relationship(
        back_populates="usuario", passive_deletes=True
    )
    qr_usos_lector: Mapped[list[QrUso]] = relationship(
        back_populates="lector", foreign_keys="QrUso.lector_id", passive_deletes=True
    )
    parametros_actualizados: Mapped[list[ParametroAsistencia]] = relationship(
        back_populates="actualizado_por_usuario",
        foreign_keys="ParametroAsistencia.actualizado_por",
        passive_deletes=True,
    )
    tutorias_confirmadas: Mapped[list[Tutoria]] = relationship(
        back_populates="confirmado_por_usuario",
        foreign_keys="Tutoria.confirmado_por",
        passive_deletes=True,
    )
    bitacora: Mapped[list[Bitacora]] = relationship(
        back_populates="usuario", passive_deletes=True
    )
