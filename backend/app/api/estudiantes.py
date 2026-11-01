"""Router de estudiantes.

Listado y detalle: Director y Profesor. Mutaciones: solo Director.
``/mi-*``: solo el estudiante autenticado (resumen, historial, tutor, horario
y asistencias).
La respuesta nunca incluye ``secreto_qr`` (semilla TOTP).
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import (
    CurrentDirector,
    CurrentDirectorOProfesor,
    CurrentEstudiante,
    DbSession,
)
from app.models import Estudiante
from app.schemas.asistencia import (
    HistorialAsistenciaItem,
    ResumenAsistenciaResponse,
)
from app.schemas.enums import EstadoAsistencia
from app.schemas.estudiante import (
    EstudianteCreate,
    EstudianteResponse,
    EstudianteUpdate,
    TutorACargoResponse,
)
from app.schemas.horario import HorarioEstudianteResponse
from app.services import estudiante_service

router = APIRouter()


@router.get(
    "",
    response_model=list[EstudianteResponse],
    summary="Listar estudiantes (Director y Profesor)",
)
def listar_estudiantes(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    curso_id: int | None = Query(default=None, ge=1),
    q: str | None = Query(
        default=None, min_length=1, max_length=80, description="Busca por CI, nombres o apellidos"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Estudiante]:
    items, total = estudiante_service.listar(
        db, curso_id=curso_id, q=q, skip=skip, limit=limit
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/mi-resumen",
    response_model=ResumenAsistenciaResponse,
    summary="Resumen de asistencia del estudiante autenticado",
    description=(
        "Devuelve los KPIs del panel del estudiante: días con al menos un "
        "registro 'presente', cantidad de tardanzas y cantidad de faltas."
    ),
)
def mi_resumen(
    db: DbSession, estudiante: CurrentEstudiante
) -> ResumenAsistenciaResponse:
    datos = estudiante_service.resumen_asistencia(db, estudiante.id)
    return ResumenAsistenciaResponse(**datos)


@router.get(
    "/mi-historial",
    response_model=list[HistorialAsistenciaItem],
    summary="Historial reciente del estudiante autenticado",
    description=(
        "Devuelve los últimos registros de asistencia del estudiante, "
        "ordenados del más reciente al más antiguo, con su materia y estado."
    ),
)
def mi_historial(
    db: DbSession,
    estudiante: CurrentEstudiante,
    limite: int = Query(default=5, ge=1, le=50),
) -> list[HistorialAsistenciaItem]:
    datos = estudiante_service.historial_asistencia(db, estudiante.id, limite=limite)
    return [HistorialAsistenciaItem(**item) for item in datos]


@router.get(
    "/mi-tutor",
    response_model=TutorACargoResponse | None,
    summary="Tutor a cargo del estudiante autenticado",
    description=(
        "Devuelve el tutor principal con vínculo confirmado: nombre completo, "
        "CI y parentesco. Si aún no hay vínculo confirmado, devuelve ``null``."
    ),
)
def mi_tutor(
    db: DbSession, estudiante: CurrentEstudiante
) -> TutorACargoResponse | None:
    datos = estudiante_service.tutor_a_cargo(db, estudiante.id)
    return TutorACargoResponse(**datos) if datos else None


@router.get(
    "/mi-horario",
    response_model=HorarioEstudianteResponse,
    summary="Horario semanal del estudiante autenticado",
    description=(
        "Devuelve la grilla semanal del curso del estudiante: materia, día, "
        "hora de inicio y hora de fin de cada bloque."
    ),
)
def mi_horario(
    db: DbSession, estudiante: CurrentEstudiante
) -> HorarioEstudianteResponse:
    datos = estudiante_service.horario_estudiante(db, estudiante.id)
    return HorarioEstudianteResponse(**datos)


@router.get(
    "/mi-asistencias",
    response_model=list[HistorialAsistenciaItem],
    summary="Historial completo del estudiante autenticado",
    description=(
        "Historial paginado de asistencias, del más reciente al más antiguo, "
        "con filtros opcionales por mes (``YYYY-MM``) y por estado. El total "
        "de registros se expone en la cabecera ``X-Total-Count``."
    ),
)
def mis_asistencias(
    db: DbSession,
    estudiante: CurrentEstudiante,
    response: Response,
    mes: str | None = Query(
        default=None,
        pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
        description="Mes a filtrar en formato YYYY-MM",
        examples=["2026-10"],
    ),
    estado: EstadoAsistencia | None = Query(
        default=None, description="Estado de asistencia a filtrar"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[HistorialAsistenciaItem]:
    datos, total = estudiante_service.historial_completo(
        db,
        estudiante.id,
        mes=mes,
        estado=estado.value if estado else None,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [HistorialAsistenciaItem(**item) for item in datos]


@router.get(
    "/{usuario_id}",
    response_model=EstudianteResponse,
    summary="Obtener un estudiante (Director y Profesor)",
)
def obtener_estudiante(
    usuario_id: int, db: DbSession, _usuario: CurrentDirectorOProfesor
) -> Estudiante:
    return estudiante_service.obtener(db, usuario_id)


@router.post(
    "",
    response_model=EstudianteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un estudiante (solo Director)",
    description=(
        "El ``usuario_id`` debe corresponder a un usuario con rol 'estudiante'. "
        "La semilla TOTP se genera en el servidor y no se devuelve."
    ),
)
def crear_estudiante(
    datos: EstudianteCreate, db: DbSession, _director: CurrentDirector
) -> Estudiante:
    return estudiante_service.crear(db, datos)


@router.put(
    "/{usuario_id}",
    response_model=EstudianteResponse,
    summary="Actualizar un estudiante (solo Director)",
    description=(
        "Acepta PUT y PATCH con actualización parcial. Los campos "
        "``nombres``, ``apellidos`` y ``ci`` se guardan en la cuenta asociada."
    ),
)
@router.patch(
    "/{usuario_id}",
    response_model=EstudianteResponse,
    summary="Actualizar un estudiante (solo Director)",
    include_in_schema=False,
)
def actualizar_estudiante(
    usuario_id: int,
    datos: EstudianteUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Estudiante:
    return estudiante_service.actualizar(db, usuario_id, datos)


@router.delete(
    "/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un estudiante (solo Director)",
)
def eliminar_estudiante(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> None:
    estudiante_service.eliminar(db, usuario_id)
