"""Router de avisos y citaciones (RF-10).

- Publicar, editar y eliminar: Director y Profesor (el autor gestiona lo suyo;
  el Director puede gestionar cualquier aviso).
- Listar y ver: Director, Profesor y Tutor. El Tutor solo recibe los avisos
  dirigidos a él.
- Marcar leído / confirmar lectura: destinatarios (Tutores y Profesores).
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response, status

from app.api.deps import (
    CurrentDirectorOProfesor,
    CurrentStaffOTutor,
    DbSession,
)
from app.models import AvisoDestinatario
from app.schemas.aviso import (
    AvisoCreate,
    AvisoDestinatarioResponse,
    AvisoResponse,
    AvisoUpdate,
)
from app.schemas.enums import TipoAviso
from app.services import aviso_service

router = APIRouter()


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get(
    "",
    response_model=list[AvisoResponse],
    summary="Listar avisos (Director, Profesor y Tutor)",
    description=(
        "El Tutor solo ve los avisos dirigidos a él. Director y Profesor ven "
        "todos y pueden usar ``solo_mios`` para revisar su propia bandeja."
    ),
)
def listar_avisos(
    db: DbSession,
    usuario: CurrentStaffOTutor,
    response: Response,
    tipo: TipoAviso | None = Query(default=None),
    importante: bool | None = Query(default=None),
    solo_mios: bool = Query(
        default=False, description="Restringe a los avisos dirigidos a mí"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[AvisoResponse]:
    items, total = aviso_service.listar(
        db,
        usuario=usuario,
        tipo=tipo,
        importante=importante,
        solo_mios=solo_mios,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.post(
    "",
    response_model=AvisoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publicar un aviso (Director y Profesor)",
    description=(
        "Si no se indican ``destinatarios``, el aviso se difunde a todos los "
        "tutores y profesores activos. Las citaciones exigen destinatarios."
    ),
)
def crear_aviso(
    datos: AvisoCreate,
    db: DbSession,
    autor: CurrentDirectorOProfesor,
    request: Request,
) -> AvisoResponse:
    return aviso_service.crear(db, datos=datos, autor=autor, ip=_ip(request))


@router.get(
    "/{aviso_id}",
    response_model=AvisoResponse,
    summary="Obtener un aviso con su estado de entrega (Director, Profesor y Tutor)",
)
def obtener_aviso(
    aviso_id: int,
    db: DbSession,
    usuario: CurrentStaffOTutor,
) -> AvisoResponse:
    return aviso_service.obtener(db, aviso_id, usuario=usuario)


@router.patch(
    "/{aviso_id}",
    response_model=AvisoResponse,
    summary="Actualizar un aviso (autor o Director)",
)
def actualizar_aviso(
    aviso_id: int,
    datos: AvisoUpdate,
    db: DbSession,
    usuario: CurrentDirectorOProfesor,
    request: Request,
) -> AvisoResponse:
    return aviso_service.actualizar(
        db, aviso_id=aviso_id, datos=datos, usuario=usuario, ip=_ip(request)
    )


@router.delete(
    "/{aviso_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un aviso (autor o Director)",
)
def eliminar_aviso(
    aviso_id: int,
    db: DbSession,
    usuario: CurrentDirectorOProfesor,
    request: Request,
) -> None:
    aviso_service.eliminar(
        db, aviso_id=aviso_id, usuario=usuario, ip=_ip(request)
    )


@router.patch(
    "/{aviso_id}/leer",
    response_model=AvisoDestinatarioResponse,
    summary="Marcar un aviso como leído (destinatario)",
)
def marcar_leido(
    aviso_id: int,
    db: DbSession,
    usuario: CurrentStaffOTutor,
) -> AvisoDestinatario:
    return aviso_service.marcar_leido(db, aviso_id=aviso_id, usuario_id=usuario.id)


@router.patch(
    "/{aviso_id}/confirmar",
    response_model=AvisoDestinatarioResponse,
    summary="Confirmar la lectura de un aviso (destinatario)",
    description=(
        "Registra ``confirmado_en`` (y ``leido_en`` si aún no estaba leído). "
        "Es idempotente: repetir la confirmación no cambia la marca original."
    ),
)
def confirmar_aviso(
    aviso_id: int,
    db: DbSession,
    usuario: CurrentStaffOTutor,
    request: Request,
) -> AvisoDestinatario:
    return aviso_service.confirmar(
        db, aviso_id=aviso_id, usuario_id=usuario.id, ip=_ip(request)
    )
