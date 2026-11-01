"""Hashing de contraseñas y emisión/validación de tokens JWT.

- Contraseñas: bcrypt vía passlib.
- Tokens: JWT firmados con HS256 (``python-jose``), con claims ``sub``,
  ``rol``, ``tipo``, ``iat`` y ``exp``.

Los errores de token se exponen como ``TokenError`` (``TokenExpirado`` /
``TokenInvalido``) para que la capa API decida el código HTTP sin acoplarse a
``python-jose``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

from app.core.config import settings

# passlib 1.7.4 intenta leer ``bcrypt.__about__`` (eliminado en bcrypt >= 4.1)
# y registra un traceback inofensivo al inicializar el backend. Se silencia
# ese logger concreto; los errores reales de hashing siguen propagándose.
logging.getLogger("passlib.handlers.bcrypt").setLevel(logging.ERROR)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ISSUER = "sesco-api"
TIPO_TOKEN_ACCESO = "access"

# bcrypt solo procesa los primeros 72 bytes de la contraseña.
MAX_BCRYPT_BYTES = 72


def _limitar_a_bcrypt(password: str) -> str:
    """Recorta a 72 bytes sin partir caracteres multibyte (UTF-8)."""
    return password.encode("utf-8")[:MAX_BCRYPT_BYTES].decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    """Devuelve el hash bcrypt de ``password`` (con salt aleatorio)."""
    if not password:
        raise ValueError("La contraseña no puede estar vacía")
    return pwd_context.hash(_limitar_a_bcrypt(password))


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Comprueba una contraseña contra un hash bcrypt.

    Devuelve ``False`` ante hashes corruptos o de otro esquema en lugar de
    lanzar excepciones, para no filtrar detalles al cliente.
    """
    if not plain_password or not password_hash:
        return False
    try:
        return pwd_context.verify(_limitar_a_bcrypt(plain_password), password_hash)
    except (ValueError, TypeError, UnknownHashError):
        return False


def password_necesita_rehash(password_hash: str) -> bool:
    """Indica si el hash usa parámetros obsoletos y conviene regenerarlo."""
    try:
        return pwd_context.needs_update(password_hash)
    except (ValueError, TypeError, UnknownHashError):
        return True


def dummy_verify() -> None:
    """Quema tiempo similar a una verificación real.

    Se usa cuando el usuario no existe, para que el tiempo de respuesta no
    revele qué cédulas están registradas (ataques de enumeración).
    """
    try:
        pwd_context.dummy_verify()
    except (ValueError, TypeError, UnknownHashError):  # pragma: no cover
        pass


class TokenError(Exception):
    """Error base de emisión/validación de tokens."""


class TokenExpirado(TokenError):
    """El token superó su fecha de expiración."""


class TokenInvalido(TokenError):
    """Firma incorrecta, formato inválido o claims obligatorios ausentes."""


def create_access_token(
    subject: int | str,
    rol: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Genera un JWT de acceso para ``subject`` (id de usuario).

    ``rol`` viaja como claim para que el frontend pueda ajustar la UI sin
    llamadas extra; la autorización real siempre se revalida contra la BD.
    """
    ahora = datetime.now(timezone.utc)
    expira = ahora + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "rol": rol,
        "tipo": TIPO_TOKEN_ACCESO,
        "iss": JWT_ISSUER,
        "iat": int(ahora.timestamp()),
        "nbf": int(ahora.timestamp()),
        "exp": int(expira.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Valida firma, expiración, issuer y ``sub``; devuelve los claims."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=JWT_ISSUER,
            options={"require_exp": True, "require_sub": True},
        )
    except ExpiredSignatureError as exc:
        raise TokenExpirado("El token ha expirado") from exc
    except JWTError as exc:
        raise TokenInvalido("El token no es válido") from exc
