"""Capa de negocio: autenticación de usuarios.

Concentra la política de seguridad (verificación de contraseña, bloqueo por
intentos fallidos, rehash y bitácora) para que el router solo traduzca el
resultado a HTTP.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.core.audit import ip_valida
from app.core.config import settings
from app.core.security import (
    create_access_token,
    dummy_verify,
    hash_password,
    password_necesita_rehash,
    verify_password,
)
from app.models import Bitacora, Usuario

logger = logging.getLogger(__name__)

MAX_INTENTOS_FALLIDOS = 5
MINUTOS_BLOQUEO = 15


class ErrorAutenticacion(Exception):
    """Error base del proceso de login."""


class CredencialesInvalidas(ErrorAutenticacion):
    """CI inexistente o contraseña incorrecta (mismo mensaje para ambos)."""


class CuentaInactiva(ErrorAutenticacion):
    """El usuario existe y la contraseña es correcta, pero está dado de baja."""


class CuentaBloqueada(ErrorAutenticacion):
    """Bloqueo temporal vigente por intentos fallidos."""


@dataclass(frozen=True)
class SesionIniciada:
    usuario: Usuario
    access_token: str
    expires_in: int


def _auditar(
    db: Session,
    *,
    usuario_id: int | None,
    exito: bool,
    ip: str | None,
    motivo: str,
) -> None:
    db.add(
        Bitacora(
            usuario_id=usuario_id,
            accion="LOGIN" if exito else "LOGIN_FALLIDO",
            entidad="usuario",
            entidad_id=usuario_id,
            detalle={"resultado": "exito" if exito else "fallido", "motivo": motivo},
            ip=ip_valida(ip),
        )
    )


def _commit_auditoria(db: Session) -> None:
    """Persiste la bitácora sin enmascarar el error de autenticación."""
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("No se pudo guardar el registro de auditoría del login")


def _registrar_fallo(db: Session, usuario: Usuario, ip: str | None) -> None:
    usuario.intentos_fallidos = min(usuario.intentos_fallidos + 1, MAX_INTENTOS_FALLIDOS)
    if usuario.intentos_fallidos >= MAX_INTENTOS_FALLIDOS:
        usuario.bloqueado_hasta = datetime.now(timezone.utc) + timedelta(
            minutes=MINUTOS_BLOQUEO
        )
    _auditar(
        db,
        usuario_id=usuario.id,
        exito=False,
        ip=ip,
        motivo="password_incorrecta",
    )
    _commit_auditoria(db)


def autenticar(
    db: Session,
    *,
    ci: str,
    password: str,
    ip: str | None = None,
) -> SesionIniciada:
    """Valida credenciales y devuelve el token de acceso.

    Reglas:
    - 5 intentos fallidos consecutivos bloquean la cuenta 15 minutos.
    - El mensaje de error es idéntico para CI inexistente y contraseña mala.
    - El evento queda en ``bitacora`` (sin guardar nunca la contraseña).
    """
    identificador = ci.strip()
    usuario = db.scalar(
        select(Usuario)
        .options(joinedload(Usuario.rol))
        .where(Usuario.ci == identificador)
    )
    ahora = datetime.now(timezone.utc)

    # Bloqueo vigente: no se comprueba la contraseña.
    if usuario is not None and usuario.bloqueado_hasta is not None:
        if usuario.bloqueado_hasta > ahora:
            raise CuentaBloqueada("Cuenta bloqueada temporalmente")
        # Bloqueo vencido: se reinicia la ventana de intentos.
        usuario.intentos_fallidos = 0
        usuario.bloqueado_hasta = None

    if usuario is None:
        dummy_verify()
        _auditar(db, usuario_id=None, exito=False, ip=ip, motivo="ci_inexistente")
        _commit_auditoria(db)
        raise CredencialesInvalidas("Credenciales inválidas")

    if not verify_password(password, usuario.password_hash):
        _registrar_fallo(db, usuario, ip)
        raise CredencialesInvalidas("Credenciales inválidas")

    if not usuario.activo:
        _auditar(db, usuario_id=usuario.id, exito=False, ip=ip, motivo="cuenta_inactiva")
        _commit_auditoria(db)
        raise CuentaInactiva("La cuenta está inactiva")

    # Login correcto: se limpian los contadores y se rehashea si hace falta.
    if password_necesita_rehash(usuario.password_hash):
        usuario.password_hash = hash_password(password)
    usuario.intentos_fallidos = 0
    usuario.bloqueado_hasta = None
    usuario.ultimo_acceso = ahora

    _auditar(db, usuario_id=usuario.id, exito=True, ip=ip, motivo="password")
    db.commit()

    extra: dict[str, Any] = {"ci": usuario.ci}
    token = create_access_token(
        subject=usuario.id,
        rol=usuario.rol.nombre,
        extra_claims=extra,
    )
    return SesionIniciada(
        usuario=usuario,
        access_token=token,
        expires_in=settings.access_token_expire_minutes * 60,
    )
