"""Router de profesores (perfil 1:1 de usuario).

El listado, el detalle y las mutaciones son exclusivos del Director.
``/mis-estudiantes`` y ``/bloques-vigentes`` trabajan sobre el profesor
autenticado (sus cursos en ``profesor_curso``).
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentProfesor, DbSession
from app.models import Estudiante, Horario, Profesor
from app.schemas.estudiante import EstudianteResponse
from app.schemas.horario import HorarioResponse
from app.schemas.profesor import ProfesorCreate, ProfesorResponse, ProfesorUpdate
from app.services import estudiante_service, horario_service, profesor_service

router = APIRouter()


@router.get(
    "",
    response_model=list[ProfesorResponse],
    summary="Listar profesores (solo Director)",
)
def listar_profesores(
    db: DbSession,
    _director: CurrentDirector,
    response: Response,
    q: str | None = Query(
        default=None,
        min_length=1,
        max_length=80,
        description="Busca por CI, nombres, apellidos, teléfono o dirección",
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Profesor]:
    items, total = profesor_service.listar(db, q=q, skip=skip, limit=limit)
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/mis-estudiantes",
    response_model=list[EstudianteResponse],
    summary="Listar estudiantes de mis cursos (solo Profesor)",
    description=(
        "Devuelve únicamente los estudiantes cuyo ``curso_id`` está asignado al "
        "profesor autenticado en ``profesor_curso``. Acepta búsqueda por CI, "
        "nombres o apellidos."
    ),
)
def listar_mis_estudiantes(
    db: DbSession,
    profesor: CurrentProfesor,
    response: Response,
    curso_id: int | None = Query(default=None, ge=1),
    q: str | None = Query(
        default=None,
        min_length=1,
        max_length=80,
        description="Busca por CI, nombres o apellidos",
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Estudiante]:
    items, total = estudiante_service.listar(
        db,
        profesor_id=profesor.id,
        curso_id=curso_id,
        q=q,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/bloques-vigentes",
    response_model=list[HorarioResponse],
    summary="Bloques de clase en curso (solo Profesor)",
    description=(
        "Bloques del día actual que están en curso en los cursos asignados al "
        "profesor autenticado. Sirve para avisar antes de abrir el registro manual."
    ),
)
def listar_bloques_vigentes(
    db: DbSession, profesor: CurrentProfesor
) -> list[Horario]:
    return horario_service.bloques_vigentes_de_profesor(db, profesor.id)


@router.get(
    "/{usuario_id}",
    response_model=ProfesorResponse,
    summary="Obtener un profesor (solo Director)",
)
def obtener_profesor(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> Profesor:
    return profesor_service.obtener(db, usuario_id)


@router.post(
    "",
    response_model=ProfesorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear el perfil de profesor (solo Director)",
    description="El ``usuario_id`` debe corresponder a un usuario con rol 'profesor'.",
)
def crear_profesor(
    datos: ProfesorCreate, db: DbSession, _director: CurrentDirector
) -> Profesor:
    return profesor_service.crear(db, datos)


@router.put(
    "/{usuario_id}",
    response_model=ProfesorResponse,
    summary="Actualizar un profesor (solo Director)",
    description=(
        "Acepta PUT y PATCH con actualización parcial. Los campos "
        "``nombres``, ``apellidos`` y ``ci`` se guardan en la cuenta asociada."
    ),
)
@router.patch(
    "/{usuario_id}",
    response_model=ProfesorResponse,
    summary="Actualizar un profesor (solo Director)",
    include_in_schema=False,
)
def actualizar_profesor(
    usuario_id: int,
    datos: ProfesorUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Profesor:
    return profesor_service.actualizar(db, usuario_id, datos)


@router.delete(
    "/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un profesor (solo Director)",
)
def eliminar_profesor(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> None:
    profesor_service.eliminar(db, usuario_id)
