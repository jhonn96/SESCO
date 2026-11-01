"""Router de justificaciones (RF-09).

- ``POST``: solo el Tutor, únicamente el mismo día de la falta/tardanza.
- ``GET``: el Tutor ve las suyas; Director y Profesor ven todas.
- ``PATCH /{id}/resolver``: Director o Profesor aprueban o rechazan.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Request, Response, status

from app.api.deps import (
    CurrentDirectorOProfesor,
    CurrentStaffOTutor,
    CurrentTutor,
    DbSession,
)
from app.models import Justificacion
from app.schemas.enums import IDS_ROL, EstadoJustificacion, RolNombre
from app.schemas.justificacion import (
    JustificacionCreate,
    JustificacionResolucion,
    JustificacionResponse,
)
from app.services import justificacion_service

router = APIRouter()


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get(
    "",
    response_model=list[JustificacionResponse],
    summary="Listar justificaciones (Director, Profesor y Tutor)",
    description=(
        "El Tutor solo ve sus propias justificaciones; Director y Profesor "
        "pueden filtrar por estudiante, estado y fecha de la asistencia."
    ),
)
def listar_justificaciones(
    db: DbSession,
    usuario: CurrentStaffOTutor,
    response: Response,
    estudiante_id: int | None = Query(default=None, ge=1),
    estado: EstadoJustificacion | None = Query(default=None),
    fecha: date | None = Query(default=None, description="Fecha de la asistencia"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Justificacion]:
    tutor_id = (
        usuario.id if usuario.rol_id == IDS_ROL[RolNombre.TUTOR] else None
    )
    items, total = justificacion_service.listar(
        db,
        tutor_id=tutor_id,
        estudiante_id=estudiante_id,
        estado=estado,
        fecha=fecha,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{justificacion_id}",
    response_model=JustificacionResponse,
    summary="Obtener una justificación (Director, Profesor y Tutor)",
)
def obtener_justificacion(
    justificacion_id: int,
    db: DbSession,
    usuario: CurrentStaffOTutor,
) -> Justificacion:
    justificacion = justificacion_service.obtener(db, justificacion_id)
    if usuario.rol_id == IDS_ROL[RolNombre.TUTOR]:
        justificacion_service.validar_visibilidad(
            justificacion, usuario_id=usuario.id
        )
    return justificacion


@router.post(
    "",
    response_model=JustificacionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar una justificación (solo Tutor)",
    description=(
        "Solo el tutor confirmado del estudiante puede justificar una falta o "
        "tardanza **el mismo día**. La justificación nace en estado 'pendiente'."
    ),
)
def enviar_justificacion(
    datos: JustificacionCreate,
    db: DbSession,
    tutor: CurrentTutor,
    request: Request,
) -> Justificacion:
    return justificacion_service.crear(
        db,
        datos=datos,
        tutor_id=tutor.id,
        ip=_ip(request),
    )


@router.patch(
    "/{justificacion_id}/resolver",
    response_model=JustificacionResponse,
    summary="Aprobar o rechazar una justificación (Director y Profesor)",
    description=(
        "Al aprobarla, la asistencia pasa a 'justificada' (y las demás faltas "
        "del mismo día del estudiante). El tutor recibe una notificación con "
        "el resultado."
    ),
)
def resolver_justificacion(
    justificacion_id: int,
    datos: JustificacionResolucion,
    db: DbSession,
    revisor: CurrentDirectorOProfesor,
    request: Request,
) -> Justificacion:
    return justificacion_service.resolver(
        db,
        justificacion_id=justificacion_id,
        datos=datos,
        revisor_id=revisor.id,
        ip=_ip(request),
    )
