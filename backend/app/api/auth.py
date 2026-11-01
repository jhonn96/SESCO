"""Router de autenticación.

Endpoints:
- ``POST /api/auth/login``: credenciales CI + contraseña -> JWT.
- ``GET  /api/auth/me``: datos del usuario autenticado (prueba del token).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.usuario import UsuarioResponse
from app.services.auth_service import (
    CuentaBloqueada,
    CuentaInactiva,
    CredencialesInvalidas,
    autenticar,
)

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Iniciar sesión",
    description=(
        "Valida la cédula y la contraseña. Tras "
        "5 intentos fallidos la cuenta se bloquea 15 minutos. "
        "El evento queda registrado en la bitácora."
    ),
    responses={
        401: {"description": "Credenciales inválidas"},
        403: {"description": "Cuenta inactiva"},
        429: {"description": "Demasiados intentos fallidos"},
    },
)
def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenResponse:
    ip = request.client.host if request.client else None
    try:
        sesion = autenticar(db, ci=payload.ci, password=payload.password, ip=ip)
    except CredencialesInvalidas as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except CuentaBloqueada as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos fallidos. Intente nuevamente más tarde.",
        ) from exc
    except CuentaInactiva as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc

    return TokenResponse(
        access_token=sesion.access_token,
        expires_in=sesion.expires_in,
        usuario=UsuarioResponse.model_validate(sesion.usuario),
    )


@router.get(
    "/me",
    response_model=UsuarioResponse,
    summary="Usuario autenticado",
    description="Devuelve el usuario dueño del token enviado en el header Authorization.",
)
def me(current_user: CurrentUser) -> UsuarioResponse:
    return UsuarioResponse.model_validate(current_user)
