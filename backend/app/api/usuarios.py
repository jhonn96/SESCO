"""Router de usuarios.

Todas las operaciones son exclusivas del Director: los datos personales y la
gestión de cuentas no se exponen a otros roles. El propio usuario consulta su
perfil en ``GET /api/auth/me``.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, DbSession
from app.models import Usuario
from app.schemas.usuario import (
    DisponibilidadCI,
    UsuarioCreate,
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
    _director: CurrentDirector,
) -> Usuario:
    return usuario_service.actualizar(db, usuario_id, datos)


@router.delete(
    "/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un usuario (solo Director)",
)
def eliminar_usuario(
    usuario_id: int, db: DbSession, director: CurrentDirector
) -> None:
    usuario_service.eliminar(db, usuario_id, current_user_id=director.id)
