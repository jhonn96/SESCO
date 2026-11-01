"""Router de materias.

Lectura: Director y Profesor. Mutaciones: solo Director.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentDirectorOProfesor, DbSession
from app.models import Materia
from app.schemas.materia import MateriaCreate, MateriaResponse, MateriaUpdate
from app.services import materia_service

router = APIRouter()


@router.get(
    "",
    response_model=list[MateriaResponse],
    summary="Listar materias (Director y Profesor)",
)
def listar_materias(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    q: str | None = Query(default=None, min_length=1, max_length=80),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[Materia]:
    items, total = materia_service.listar(db, q=q, skip=skip, limit=limit)
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{materia_id}",
    response_model=MateriaResponse,
    summary="Obtener una materia (Director y Profesor)",
)
def obtener_materia(
    materia_id: int, db: DbSession, _usuario: CurrentDirectorOProfesor
) -> Materia:
    return materia_service.obtener(db, materia_id)


@router.post(
    "",
    response_model=MateriaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una materia (solo Director)",
)
def crear_materia(
    datos: MateriaCreate, db: DbSession, _director: CurrentDirector
) -> Materia:
    return materia_service.crear(db, datos)


@router.patch(
    "/{materia_id}",
    response_model=MateriaResponse,
    summary="Actualizar una materia (solo Director)",
)
def actualizar_materia(
    materia_id: int,
    datos: MateriaUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Materia:
    return materia_service.actualizar(db, materia_id, datos)


@router.delete(
    "/{materia_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una materia (solo Director)",
)
def eliminar_materia(
    materia_id: int, db: DbSession, _director: CurrentDirector
) -> None:
    materia_service.eliminar(db, materia_id)
