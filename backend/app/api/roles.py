"""Router de roles (catálogo).

Lectura para cualquier usuario autenticado (el frontend la necesita para
mostrar etiquetas); mutaciones exclusivas del Director.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentDirector, CurrentUser, DbSession
from app.models import Rol
from app.schemas.rol import RolCreate, RolResponse, RolUpdate
from app.services import rol_service

router = APIRouter()


@router.get("", response_model=list[RolResponse], summary="Listar roles")
def listar_roles(db: DbSession, _usuario: CurrentUser) -> list[Rol]:
    return rol_service.listar(db)


@router.get("/{rol_id}", response_model=RolResponse, summary="Obtener un rol")
def obtener_rol(rol_id: int, db: DbSession, _usuario: CurrentUser) -> Rol:
    return rol_service.obtener(db, rol_id)


@router.post(
    "",
    response_model=RolResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un rol (solo Director)",
)
def crear_rol(datos: RolCreate, db: DbSession, _director: CurrentDirector) -> Rol:
    return rol_service.crear(db, datos)


@router.patch(
    "/{rol_id}",
    response_model=RolResponse,
    summary="Actualizar un rol (solo Director)",
)
def actualizar_rol(
    rol_id: int, datos: RolUpdate, db: DbSession, _director: CurrentDirector
) -> Rol:
    return rol_service.actualizar(db, rol_id, datos)


@router.delete(
    "/{rol_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un rol (solo Director)",
)
def eliminar_rol(rol_id: int, db: DbSession, _director: CurrentDirector) -> None:
    rol_service.eliminar(db, rol_id)
