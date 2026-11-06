"""Router de horarios (bloques de clase).

Lectura: Director y Profesor. Escritura: **solo Director** (el profesor no
puede alterar la grilla con la que se calcula la asistencia).

Validaciones de negocio en el servicio:
- ``hora_fin > hora_inicio``.
- Sin solapamientos dentro del mismo curso **y día**.
- Un único ``es_ultimo_bloque`` por curso y día.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentDirectorOProfesor, DbSession
from app.models import Horario
from app.schemas.enums import DiaSemana
from app.schemas.horario import HorarioCreate, HorarioResponse, HorarioUpdate
from app.services import horario_service

router = APIRouter()


@router.get(
    "",
    response_model=list[HorarioResponse],
    summary="Listar horarios (Director y Profesor)",
)
def listar_horarios(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    curso_id: int | None = Query(default=None, ge=1),
    materia_id: int | None = Query(default=None, ge=1),
    profesor_id: int | None = Query(default=None, ge=1),
    dia_semana: DiaSemana | None = Query(
        default=None, description="Filtra la grilla semanal por día"
    ),
    es_ultimo_bloque: bool | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[Horario]:
    items, total = horario_service.listar(
        db,
        curso_id=curso_id,
        materia_id=materia_id,
        profesor_id=profesor_id,
        dia_semana=dia_semana,
        es_ultimo_bloque=es_ultimo_bloque,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{horario_id}",
    response_model=HorarioResponse,
    summary="Obtener un horario (Director y Profesor)",
)
def obtener_horario(
    horario_id: int, db: DbSession, _usuario: CurrentDirectorOProfesor
) -> Horario:
    return horario_service.obtener(db, horario_id)


@router.post(
    "",
    response_model=HorarioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un bloque de horario (solo Director)",
    description=(
        "Rechaza solapamientos dentro del mismo curso y día, un segundo "
        "bloque de cierre (es_ultimo_bloque) para ese día y choques de "
        "agenda del profesor con otro curso a la misma hora."
    ),
)
def crear_horario(
    datos: HorarioCreate, db: DbSession, _director: CurrentDirector
) -> Horario:
    return horario_service.crear(db, datos)


@router.put(
    "/{horario_id}",
    response_model=HorarioResponse,
    summary="Actualizar un horario (solo Director)",
    description="Acepta PUT y PATCH con actualización parcial.",
)
@router.patch(
    "/{horario_id}",
    response_model=HorarioResponse,
    summary="Actualizar un horario (solo Director)",
    include_in_schema=False,
)
def actualizar_horario(
    horario_id: int,
    datos: HorarioUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Horario:
    return horario_service.actualizar(db, horario_id, datos)


@router.delete(
    "/{horario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un horario (solo Director)",
)
def eliminar_horario(
    horario_id: int, db: DbSession, _director: CurrentDirector
) -> None:
    horario_service.eliminar(db, horario_id)
