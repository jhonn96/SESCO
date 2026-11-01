"""Router de asignaciones profesor - curso.

Lectura: Director y Profesor. Altas y bajas: solo Director.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentDirectorOProfesor, DbSession
from app.models import ProfesorCurso
from app.schemas.profesor_curso import ProfesorCursoCreate, ProfesorCursoResponse
from app.services import profesor_curso_service

router = APIRouter()


@router.get(
    "",
    response_model=list[ProfesorCursoResponse],
    summary="Listar asignaciones profesor-curso (Director y Profesor)",
)
def listar_asignaciones(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    curso_id: int | None = Query(default=None, ge=1),
    profesor_id: int | None = Query(default=None, ge=1),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[ProfesorCurso]:
    items, total = profesor_curso_service.listar(
        db,
        curso_id=curso_id,
        profesor_id=profesor_id,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.post(
    "",
    response_model=ProfesorCursoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Asignar un profesor a un curso (solo Director)",
    description=(
        "Si ``es_asesor`` es true, el profesor pasa a ser el asesor del curso "
        "y se desmarca al asesor anterior."
    ),
)
def crear_asignacion(
    datos: ProfesorCursoCreate, db: DbSession, _director: CurrentDirector
) -> ProfesorCurso:
    return profesor_curso_service.crear(db, datos)


@router.delete(
    "/{profesor_id}/{curso_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Quitar un profesor de un curso (solo Director)",
)
def eliminar_asignacion(
    profesor_id: int,
    curso_id: int,
    db: DbSession,
    _director: CurrentDirector,
) -> None:
    profesor_curso_service.eliminar(db, profesor_id, curso_id)
