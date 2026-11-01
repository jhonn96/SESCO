"""Router de cursos.

Listado y detalle: Director y Profesor. Mutaciones: solo Director.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentDirectorOProfesor, DbSession
from app.models import Curso
from app.schemas.curso import CursoCreate, CursoResponse, CursoUpdate
from app.schemas.enums import NivelCurso
from app.services import curso_service

router = APIRouter()


@router.get(
    "",
    response_model=list[CursoResponse],
    summary="Listar cursos (Director y Profesor)",
)
def listar_cursos(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    periodo_id: int | None = Query(default=None, ge=1),
    nivel: NivelCurso | None = Query(default=None),
    grado: int | None = Query(default=None, ge=1, le=6),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Curso]:
    items, total = curso_service.listar(
        db, periodo_id=periodo_id, nivel=nivel, grado=grado, skip=skip, limit=limit
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{curso_id}",
    response_model=CursoResponse,
    summary="Obtener un curso (Director y Profesor)",
)
def obtener_curso(
    curso_id: int, db: DbSession, _usuario: CurrentDirectorOProfesor
) -> Curso:
    return curso_service.obtener(db, curso_id)


@router.post(
    "",
    response_model=CursoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un curso (solo Director)",
)
def crear_curso(
    datos: CursoCreate, db: DbSession, _director: CurrentDirector
) -> Curso:
    return curso_service.crear(db, datos)


@router.put(
    "/{curso_id}",
    response_model=CursoResponse,
    summary="Actualizar un curso (solo Director)",
    description="Acepta PUT y PATCH con actualización parcial.",
)
@router.patch(
    "/{curso_id}",
    response_model=CursoResponse,
    summary="Actualizar un curso (solo Director)",
    include_in_schema=False,
)
def actualizar_curso(
    curso_id: int, datos: CursoUpdate, db: DbSession, _director: CurrentDirector
) -> Curso:
    return curso_service.actualizar(db, curso_id, datos)


@router.delete(
    "/{curso_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un curso (solo Director)",
)
def eliminar_curso(curso_id: int, db: DbSession, _director: CurrentDirector) -> None:
    curso_service.eliminar(db, curso_id)
