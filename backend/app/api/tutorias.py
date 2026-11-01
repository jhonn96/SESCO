"""Router de tutorías (vínculo estudiante - tutor).

- Listado y detalle: Director y Profesor.
- Crear, modificar, confirmar y dar de baja: solo Director.
- RD-02: la confirmación del vínculo es competencia exclusiva del Director.
- ``DELETE`` es baja lógica (``estado='baja'``); el vínculo no se borra.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentDirectorOProfesor, DbSession
from app.models import Tutoria
from app.schemas.enums import EstadoTutoria
from app.schemas.tutoria import TutoriaCreate, TutoriaResponse, TutoriaUpdate
from app.services import tutoria_service

router = APIRouter()


@router.get(
    "",
    response_model=list[TutoriaResponse],
    summary="Listar vínculos (Director y Profesor)",
)
def listar_tutorias(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    estudiante_id: int | None = Query(default=None, ge=1),
    tutor_id: int | None = Query(default=None, ge=1),
    estado: EstadoTutoria | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Tutoria]:
    items = tutoria_service.listar(
        db,
        estudiante_id=estudiante_id,
        tutor_id=tutor_id,
        estado=estado.value if estado else None,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(len(items))
    return items


@router.get(
    "/{estudiante_id}/{tutor_id}",
    response_model=TutoriaResponse,
    summary="Obtener un vínculo (Director y Profesor)",
)
def obtener_tutoria(
    estudiante_id: int,
    tutor_id: int,
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
) -> Tutoria:
    return tutoria_service.obtener(db, estudiante_id, tutor_id)


@router.post(
    "",
    response_model=TutoriaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un vínculo en estado pendiente (solo Director)",
)
def crear_tutoria(
    datos: TutoriaCreate, db: DbSession, _director: CurrentDirector
) -> Tutoria:
    return tutoria_service.crear(db, datos)


@router.patch(
    "/{estudiante_id}/{tutor_id}",
    response_model=TutoriaResponse,
    summary="Actualizar parentesco o tutor principal (solo Director)",
)
def actualizar_tutoria(
    estudiante_id: int,
    tutor_id: int,
    datos: TutoriaUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Tutoria:
    return tutoria_service.actualizar(db, estudiante_id, tutor_id, datos)


@router.post(
    "/{estudiante_id}/{tutor_id}/confirmar",
    response_model=TutoriaResponse,
    summary="Confirmar el vínculo (solo Director, RD-02)",
)
def confirmar_tutoria(
    estudiante_id: int,
    tutor_id: int,
    db: DbSession,
    director: CurrentDirector,
) -> Tutoria:
    return tutoria_service.confirmar(
        db, estudiante_id, tutor_id, director_id=director.id
    )


@router.delete(
    "/{estudiante_id}/{tutor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Dar de baja el vínculo (solo Director)",
)
def dar_de_baja_tutoria(
    estudiante_id: int,
    tutor_id: int,
    db: DbSession,
    _director: CurrentDirector,
) -> None:
    tutoria_service.dar_de_baja(db, estudiante_id, tutor_id)
