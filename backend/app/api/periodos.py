"""Router de periodos lectivos.

Lectura: Director y Profesor. Mutaciones: solo Director.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentDirector, CurrentDirectorOProfesor, DbSession
from app.models import Periodo
from app.schemas.periodo import PeriodoCreate, PeriodoResponse, PeriodoUpdate
from app.services import periodo_service

router = APIRouter()


@router.get(
    "",
    response_model=list[PeriodoResponse],
    summary="Listar periodos (Director y Profesor)",
)
def listar_periodos(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    gestion: int | None = Query(default=None, ge=1900, le=2200),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[Periodo]:
    items, total = periodo_service.listar(
        db, gestion=gestion, skip=skip, limit=limit
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{periodo_id}",
    response_model=PeriodoResponse,
    summary="Obtener un periodo (Director y Profesor)",
)
def obtener_periodo(
    periodo_id: int, db: DbSession, _usuario: CurrentDirectorOProfesor
) -> Periodo:
    return periodo_service.obtener(db, periodo_id)


@router.post(
    "",
    response_model=PeriodoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un periodo (solo Director)",
)
def crear_periodo(
    datos: PeriodoCreate, db: DbSession, _director: CurrentDirector
) -> Periodo:
    return periodo_service.crear(db, datos)


@router.patch(
    "/{periodo_id}",
    response_model=PeriodoResponse,
    summary="Actualizar un periodo (solo Director)",
)
def actualizar_periodo(
    periodo_id: int,
    datos: PeriodoUpdate,
    db: DbSession,
    _director: CurrentDirector,
) -> Periodo:
    return periodo_service.actualizar(db, periodo_id, datos)


@router.delete(
    "/{periodo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un periodo (solo Director)",
)
def eliminar_periodo(
    periodo_id: int, db: DbSession, _director: CurrentDirector
) -> None:
    periodo_service.eliminar(db, periodo_id)
