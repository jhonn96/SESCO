"""Dependencias compartidas por los routers de la API.

- ``get_db``: sesión de SQLAlchemy por request.
- ``get_current_user``: usuario autenticado a partir del JWT.
- ``require_role``: fábrica de dependencias para restringir por rol.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import TIPO_TOKEN_ACCESO, TokenError, decode_token
from app.models import Usuario
from app.schemas.enums import RolNombre

# auto_error=False para devolver un 401 con WWW-Authenticate propio
# en lugar del 403 por defecto de FastAPI.
bearer_scheme = HTTPBearer(
    auto_error=False,
    description="Token JWT obtenido en POST /api/auth/login",
)

DbSession = Annotated[Session, Depends(get_db)]


def _credenciales_invalidas(detalle: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detalle,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    db: DbSession,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
) -> Usuario:
    """Decodifica el JWT y devuelve el usuario activo asociado.

    Revalida contra la base de datos en cada request: si el usuario fue
    desactivado o bloqueado, el token deja de servir aunque siga vigente.
    """
    if credentials is None or not credentials.credentials:
        raise _credenciales_invalidas("Se requiere un token de acceso")

    try:
        payload = decode_token(credentials.credentials)
    except TokenError as exc:
        raise _credenciales_invalidas(str(exc)) from exc

    if payload.get("tipo") != TIPO_TOKEN_ACCESO:
        raise _credenciales_invalidas("Tipo de token no admitido")

    sub = payload.get("sub")
    try:
        usuario_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise _credenciales_invalidas("Token sin identificador de usuario válido") from exc

    usuario = db.scalar(
        select(Usuario).options(joinedload(Usuario.rol)).where(Usuario.id == usuario_id)
    )
    if usuario is None:
        raise _credenciales_invalidas("El usuario del token no existe")

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="La cuenta está inactiva"
        )

    if usuario.bloqueado_hasta is not None and usuario.bloqueado_hasta > datetime.now(
        timezone.utc
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta está bloqueada temporalmente",
        )

    return usuario


CurrentUser = Annotated[Usuario, Depends(get_current_user)]


def _nombres_de_rol(roles: Iterable[str | RolNombre]) -> set[str]:
    return {rol.value if isinstance(rol, RolNombre) else str(rol) for rol in roles}


def require_role(
    *roles: str | RolNombre | Iterable[str | RolNombre],
) -> Callable[..., Usuario]:
    """Fábrica de dependencias que exige al menos uno de los roles dados.

    Acepta ambas formas::

        Depends(require_role("director"))
        Depends(require_role(RolNombre.DIRECTOR, RolNombre.PROFESOR))
        Depends(require_role(["director", "profesor"]))
    """
    if len(roles) == 1 and not isinstance(roles[0], (str, RolNombre)):
        permitidos = _nombres_de_rol(roles[0])
    else:
        permitidos = _nombres_de_rol(roles)  # type: ignore[arg-type]

    if not permitidos:
        raise ValueError("require_role necesita al menos un rol")

    def verificar_rol(current_user: CurrentUser) -> Usuario:
        if current_user.rol.nombre not in permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para realizar esta acción",
            )
        return current_user

    return verificar_rol


#: Alias reutilizables en los routers.
CurrentDirector = Annotated[Usuario, Depends(require_role(RolNombre.DIRECTOR))]
CurrentDirectorOProfesor = Annotated[
    Usuario, Depends(require_role(RolNombre.DIRECTOR, RolNombre.PROFESOR))
]
CurrentProfesor = Annotated[Usuario, Depends(require_role(RolNombre.PROFESOR))]
CurrentEstudiante = Annotated[Usuario, Depends(require_role(RolNombre.ESTUDIANTE))]
CurrentTutor = Annotated[Usuario, Depends(require_role(RolNombre.TUTOR))]
#: Personal del colegio o tutor (lectores de avisos y justificaciones).
CurrentStaffOTutor = Annotated[
    Usuario,
    Depends(require_role(RolNombre.DIRECTOR, RolNombre.PROFESOR, RolNombre.TUTOR)),
]
