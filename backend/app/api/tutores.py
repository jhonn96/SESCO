"""Router de tutores (perfil 1:1 de usuario).

- Gestión del perfil: exclusiva del Director (incluye datos de contacto).
- Panel del tutor: el tutor autenticado consulta sus hijos confirmados, su
  resumen y su historial de asistencia.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentTutor, DbSession
from app.models import Tutor
from app.schemas.asistencia import ResumenAsistenciaResponse
from app.schemas.enums import EstadoAsistencia
from app.schemas.tutor import (
    HijoResponse,
    HistorialTutorItem,
    TutorCreate,
    TutorResponse,
    TutorUpdate,
)
from app.services import estudiante_service, tutor_service

router = APIRouter()


# --------------------------------------------------------------------------
# Panel del tutor autenticado
# --------------------------------------------------------------------------


@router.get(
    "/mis-estudiantes",
    response_model=list[HijoResponse],
    summary="Hijos del tutor autenticado",
    description=(
        "Devuelve los estudiantes con vínculo **confirmado** con el tutor. "
        "Los vínculos pendientes no se incluyen (RD-02)."
    ),
)
def mis_estudiantes(db: DbSession, tutor: CurrentTutor) -> list[HijoResponse]:
    filas = tutor_service.mis_estudiantes(db, tutor.id)
    return [HijoResponse(**fila) for fila in filas]


@router.get(
    "/estudiantes/{estudiante_id}/resumen",
    response_model=ResumenAsistenciaResponse,
    summary="Resumen de asistencia de un hijo",
    description=(
        "KPIs del hijo: días con al menos un registro 'presente', tardanzas y "
        "faltas. Solo para el tutor confirmado del estudiante."
    ),
)
def resumen_hijo(
    estudiante_id: int, db: DbSession, tutor: CurrentTutor
) -> ResumenAsistenciaResponse:
    tutor_service.validar_hijo(db, tutor.id, estudiante_id)
    datos = estudiante_service.resumen_asistencia(db, estudiante_id)
    return ResumenAsistenciaResponse(**datos)


@router.get(
    "/estudiantes/{estudiante_id}/historial",
    response_model=list[HistorialTutorItem],
    summary="Historial de asistencia de un hijo",
    description=(
        "Historial paginado de asistencia del hijo con su materia, horario, "
        "origen y la justificación asociada (si ya existe). Filtros opcionales "
        "por mes (``YYYY-MM``) y estado. El total se expone en la cabecera "
        "``X-Total-Count``. Solo para el tutor confirmado."
    ),
)
def historial_hijo(
    estudiante_id: int,
    db: DbSession,
    tutor: CurrentTutor,
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
) -> list[HistorialTutorItem]:
    filas, total = tutor_service.historial_hijo(
        db,
        tutor.id,
        estudiante_id,
        mes=mes,
        estado=estado.value if estado else None,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [HistorialTutorItem(**fila) for fila in filas]


# --------------------------------------------------------------------------
# Gestión del perfil (solo Director)
# --------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[TutorResponse],
    summary="Listar tutores (solo Director)",
)
def listar_tutores(
    db: DbSession,
    _director: CurrentDirector,
    response: Response,
    q: str | None = Query(
        default=None, min_length=1, max_length=80, description="Busca por CI, nombres, apellidos o teléfono"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Tutor]:
    items, total = tutor_service.listar(db, q=q, skip=skip, limit=limit)
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{usuario_id}",
    response_model=TutorResponse,
    summary="Obtener un tutor (solo Director)",
)
def obtener_tutor(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> Tutor:
    return tutor_service.obtener(db, usuario_id)


@router.post(
    "",
    response_model=TutorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear el perfil de tutor (solo Director)",
    description="El ``usuario_id`` debe corresponder a un usuario con rol 'tutor'.",
)
def crear_tutor(
    datos: TutorCreate, db: DbSession, _director: CurrentDirector
) -> Tutor:
    return tutor_service.crear(db, datos)


@router.patch(
    "/{usuario_id}",
    response_model=TutorResponse,
    summary="Actualizar un tutor (solo Director)",
)
def actualizar_tutor(
    usuario_id: int,
    datos: TutorUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Tutor:
    return tutor_service.actualizar(db, usuario_id, datos)


@router.delete(
    "/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un tutor (solo Director)",
)
def eliminar_tutor(
    usuario_id: int, db: DbSession, _director: CurrentDirector
) -> None:
    tutor_service.eliminar(db, usuario_id)
