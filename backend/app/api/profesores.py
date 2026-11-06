"""Router de profesores (perfil 1:1 de usuario).

El listado, el detalle y las mutaciones son exclusivos del Director.
``/mis-estudiantes`` y ``/bloques-vigentes`` trabajan sobre el profesor
autenticado (sus cursos en ``profesor_curso``).
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentProfesor, DbSession
from app.models import Asistencia, Curso, Estudiante, Horario, Profesor
from app.schemas.asistencia import AsistenciaResponse
from app.schemas.curso import CursoResponse
from app.schemas.estudiante import EstudianteResponse
from app.schemas.horario import ClaseActualResponse, HorarioResponse
from app.schemas.lista_asistencia import ListaAsistenciaResponse
from app.schemas.profesor import ProfesorCreate, ProfesorResponse, ProfesorUpdate
from app.services import (
    asistencia_service,
    estudiante_service,
    horario_service,
    profesor_curso_service,
    profesor_service,
)

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
    "/mis-cursos",
    response_model=list[CursoResponse],
    summary="Cursos asignados al profesor autenticado (solo Profesor)",
    description=(
        "Devuelve todos los cursos del docente autenticado según "
        "``profesor_curso``, sin importar si tienen clase hoy. Se usa para "
        "el selector de curso del panel de registros."
    ),
)
def listar_mis_cursos(
    db: DbSession, profesor: CurrentProfesor
) -> list[Curso]:
    return profesor_curso_service.cursos_de_profesor(db, profesor.id)


@router.get(
    "/mi-horario",
    response_model=list[HorarioResponse],
    summary="Horario semanal del profesor autenticado (solo Profesor)",
    description=(
        "Devuelve todos los bloques de la semana asignados al docente "
        "autenticado, ordenados por día y hora. Se usa en la vista "
        "«Mi horario»."
    ),
)
def listar_mi_horario(
    db: DbSession, profesor: CurrentProfesor
) -> list[Horario]:
    return horario_service.bloques_de_profesor(db, profesor.id)


@router.get(
    "/bloques-vigentes",
    response_model=list[HorarioResponse],
    summary="Bloques de clase en curso (solo Profesor)",
    description=(
        "Bloques del día actual que están en curso y asignados al profesor "
        "autenticado. Sirve para avisar antes de abrir el registro manual."
    ),
)
def listar_bloques_vigentes(
    db: DbSession, profesor: CurrentProfesor
) -> list[Horario]:
    return horario_service.bloques_vigentes_de_profesor(db, profesor.id)


@router.get(
    "/bloques-hoy",
    response_model=list[HorarioResponse],
    summary="Bloques de hoy del profesor (solo Profesor)",
    description=(
        "Devuelve los bloques del día actual (según el día de la semana) "
        "asignados al docente autenticado. Se usa para construir los filtros "
        "por curso y materia sin depender de que ya existan registros de "
        "asistencia."
    ),
)
def listar_bloques_hoy(
    db: DbSession, profesor: CurrentProfesor
) -> list[Horario]:
    return horario_service.bloques_hoy_de_profesor(db, profesor.id)


@router.get(
    "/clase-actual",
    response_model=ClaseActualResponse,
    summary="Clase que dicta el profesor en este momento (solo Profesor)",
    description=(
        "Toma la hora actual del servidor y devuelve el bloque de horario que "
        "el docente autenticado tiene en curso, con su curso y materia. Si no "
        "tiene clase, responde ``en_clase=false`` y ``bloque=null``."
    ),
)
def obtener_clase_actual(
    db: DbSession, profesor: CurrentProfesor
) -> ClaseActualResponse:
    bloque, registrados, total = horario_service.clase_actual_de_profesor(
        db, profesor.id
    )
    return ClaseActualResponse(
        en_clase=bloque is not None,
        bloque=HorarioResponse.model_validate(bloque) if bloque else None,
        registrados=registrados,
        total_estudiantes=total,
    )


@router.get(
    "/mis-registros-hoy",
    response_model=list[AsistenciaResponse],
    summary="Registros de asistencia de hoy de mis cursos (solo Profesor)",
    description=(
        "Devuelve todos los registros del día actual de los cursos asignados "
        "al docente autenticado. Se puede acotar por ``curso_id`` o "
        "``materia_id``. La relación docente-bloque se resuelve con "
        "``horario.profesor_id``."
    ),
)
def listar_mis_registros_hoy(
    db: DbSession,
    profesor: CurrentProfesor,
    response: Response,
    curso_id: int | None = Query(default=None, ge=1),
    materia_id: int | None = Query(default=None, ge=1),
) -> list[Asistencia]:
    items = asistencia_service.listar_hoy_de_profesor(
        db,
        profesor.id,
        curso_id=curso_id,
        materia_id=materia_id,
    )
    response.headers["X-Total-Count"] = str(len(items))
    return items


@router.get(
    "/lista-asistencia",
    response_model=ListaAsistenciaResponse,
    summary="Lista mensual de asistencia de un curso y materia (solo Profesor)",
    description=(
        "Devuelve la matriz del mes para un curso y materia que el docente "
        "autenticado tenga asignados en su horario. Incluye todos los "
        "estudiantes del curso ordenados por apellidos y los estados de "
        "asistencia por día."
    ),
)
def obtener_lista_asistencia(
    db: DbSession,
    profesor: CurrentProfesor,
    curso_id: int = Query(ge=1),
    materia_id: int = Query(ge=1),
    mes: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> ListaAsistenciaResponse:
    return asistencia_service.lista_mensual_de_profesor(
        db,
        profesor.id,
        curso_id=curso_id,
        materia_id=materia_id,
        mes=mes,
    )


@router.get(
    "/{usuario_id}/horario",
    response_model=list[HorarioResponse],
    summary="Horario semanal de un profesor (solo Director)",
    description=(
        "Devuelve todos los bloques de la semana asignados al profesor "
        "indicado en ``horario.profesor_id``. Se usa en la acción rápida "
        "«Ver Horario» del directorio docente."
    ),
)
def listar_horario_de_profesor(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> list[Horario]:
    profesor = profesor_service.obtener(db, usuario_id)
    return horario_service.bloques_de_profesor(db, profesor.usuario_id)


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
