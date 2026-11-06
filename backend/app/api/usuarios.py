"""Router de usuarios.

La gestión de cuentas es exclusiva del Director. Cualquier usuario
autenticado puede cambiar su propia contraseña en ``PUT /mi-password``; su
perfil se consulta en ``GET /api/auth/me``.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentUser, DbSession
from app.models import Usuario
from app.schemas.usuario import (
    DisponibilidadCI,
    PasswordActualizadaResponse,
    PasswordRestablecidaResponse,
    UsuarioCreate,
    UsuarioEstadoUpdate,
    UsuarioPasswordUpdate,
    UsuarioResponse,
    UsuarioUpdate,
)
from app.services import usuario_service

router = APIRouter()


@router.get(
    "",
    response_model=list[UsuarioResponse],
    summary="Listar usuarios (solo Director)",
)
def listar_usuarios(
    db: DbSession,
    _director: CurrentDirector,
    response: Response,
    rol_id: int | None = Query(default=None, ge=1),
    activo: bool | None = Query(default=None),
    q: str | None = Query(
        default=None, min_length=1, max_length=80, description="Busca por CI, nombres o apellidos"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Usuario]:
    items, total = usuario_service.listar(
        db, rol_id=rol_id, activo=activo, q=q, skip=skip, limit=limit
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/verificar-ci",
    response_model=DisponibilidadCI,
    summary="Comprobar si una cédula ya está registrada (solo Director)",
)
def verificar_ci(
    db: DbSession,
    _director: CurrentDirector,
    ci: str = Query(min_length=1, max_length=15, description="Cédula de identidad"),
) -> DisponibilidadCI:
    return DisponibilidadCI(
        ci=ci.strip(), disponible=usuario_service.ci_disponible(db, ci)
    )


@router.put(
    "/mi-password",
    response_model=PasswordActualizadaResponse,
    summary="Cambiar la contraseña propia",
    description=(
        "Verifica la contraseña vigente y guarda la nueva hasheada. "
        "Disponible para cualquier usuario autenticado."
    ),
)
def cambiar_mi_password(
    datos: UsuarioPasswordUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> PasswordActualizadaResponse:
    usuario_service.cambiar_password(db, current_user.id, datos)
    return PasswordActualizadaResponse(
        mensaje="Contraseña actualizada correctamente"
    )


@router.get(
    "/{usuario_id}",
    response_model=UsuarioResponse,
    summary="Obtener un usuario (solo Director)",
)
def obtener_usuario(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> Usuario:
    return usuario_service.obtener(db, usuario_id)


@router.post(
    "",
    response_model=UsuarioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un usuario (solo Director)",
)
def crear_usuario(
    datos: UsuarioCreate, db: DbSession, _director: CurrentDirector
) -> Usuario:
    return usuario_service.crear(db, datos)


@router.patch(
    "/{usuario_id}",
    response_model=UsuarioResponse,
    summary="Actualizar un usuario (solo Director)",
)
def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioUpdate,
    db: DbSession,
    director: CurrentDirector,
) -> Usuario:
    return usuario_service.actualizar(
        db, usuario_id, datos, current_user_id=director.id
    )


@router.patch(
    "/{usuario_id}/estado",
    response_model=UsuarioResponse,
    summary="Activar, desactivar o desbloquear una cuenta (solo Director)",
    description=(
        "Permite cambiar ``activo`` y ``bloqueado_hasta``. Enviar "
        "``bloqueado_hasta: null`` desbloquea la cuenta y reinicia "
        "``intentos_fallidos`` a 0. No se puede desactivar la propia cuenta "
        "ni al último director activo."
    ),
)
def cambiar_estado_usuario(
    usuario_id: int,
    datos: UsuarioEstadoUpdate,
    db: DbSession,
    director: CurrentDirector,
) -> Usuario:
    return usuario_service.cambiar_estado(
        db, usuario_id, datos, current_user_id=director.id
    )


@router.patch(
    "/{usuario_id}/desbloquear",
    response_model=UsuarioResponse,
    summary="Desbloquear una cuenta (solo Director)",
    description=(
        "Pone ``bloqueado_hasta`` en null y reinicia ``intentos_fallidos`` a 0. "
        "Se usa cuando la cuenta quedó bloqueada por intentos fallidos."
    ),
)
def desbloquear_usuario(
    usuario_id: int,
    db: DbSession,
    director: CurrentDirector,
) -> Usuario:
    return usuario_service.cambiar_estado(
        db,
        usuario_id,
        UsuarioEstadoUpdate(bloqueado_hasta=None),
        current_user_id=director.id,
    )


@router.patch(
    "/{usuario_id}/reset-password",
    response_model=PasswordRestablecidaResponse,
    summary="Restablecer la contraseña de una cuenta (solo Director)",
    description=(
        "Asigna la contraseña temporal ``Sesco2026!`` sin cambiar el estado "
        "de la cuenta. La respuesta incluye la contraseña para comunicarla."
    ),
)
def restablecer_password_usuario(
    usuario_id: int,
    db: DbSession,
    _director: CurrentDirector,
) -> PasswordRestablecidaResponse:
    usuario, password_temporal = usuario_service.restablecer_password(
        db, usuario_id
    )
    return PasswordRestablecidaResponse(
        usuario=UsuarioResponse.model_validate(usuario),
        password_temporal=password_temporal,
    )


@router.delete(
    "/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un usuario (solo Director)",
)
def eliminar_usuario(
    usuario_id: int, db: DbSession, director: CurrentDirector
) -> None:
    usuario_service.eliminar(db, usuario_id, current_user_id=director.id)
