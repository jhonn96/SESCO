"""Router de asistencia: QR dinámico, escaneo, registro manual y cierre.

Permisos:
- ``GET /qr``: solo el estudiante autenticado (su propio código).
- ``POST /escanear``: Director y Profesor (portería y docentes).
- ``POST /manual`` y ``POST /cerrar-bloque``: Director y Profesor.
- Listado y detalle: Director y Profesor.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Request, Response, status

from app.api.deps import (
    CurrentDirectorOProfesor,
    CurrentEstudiante,
    DbSession,
)
from app.models import Asistencia
from app.schemas.asistencia import (
    AsistenciaManualCreate,
    AsistenciaRegistroResponse,
    AsistenciaResponse,
    CierreBloqueRequest,
    CierreBloqueResponse,
    EscaneoRequest,
    QrResponse,
)
from app.schemas.enums import EstadoAsistencia, RolNombre
from app.services import asistencia_service

router = APIRouter()


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _respuesta(resultado: asistencia_service.ResultadoRegistro) -> dict:
    base = AsistenciaResponse.model_validate(resultado.asistencia).model_dump()
    base["notificacion_encolada"] = resultado.notificacion_encolada
    return base


@router.get(
    "/qr",
    response_model=QrResponse,
    summary="Obtener el QR vigente (solo Estudiante)",
    description=(
        "Genera un TOTP de 8 dígitos con el secreto del estudiante autenticado. "
        "La ventana se toma de ``parametro_asistencia.qr_ventana_seg``. "
        "Solo está disponible durante un bloque del curso del estudiante "
        "(10 minutos de tolerancia antes del inicio y después del fin); "
        "fuera de horario responde 403."
    ),
    responses={
        403: {"description": "El estudiante no tiene una clase en curso"}
    },
)
def obtener_qr(db: DbSession, estudiante: CurrentEstudiante) -> QrResponse:
    resultado = asistencia_service.generar_qr(db, estudiante.id)
    return QrResponse.model_validate(resultado.codigo).model_copy(
        update={
            "materia": resultado.materia,
            "profesor": resultado.profesor,
            "hora_inicio": resultado.hora_inicio,
            "hora_fin": resultado.hora_fin,
        }
    )


@router.post(
    "/escanear",
    response_model=AsistenciaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar asistencia escaneando el QR (Director y Profesor)",
    description=(
        "Valida el TOTP con una ventana de tolerancia, comprueba que el "
        "estudiante pertenezca al curso del bloque y clasifica la asistencia. "
        "El mismo código no puede usarse dos veces (tabla ``qr_uso``)."
    ),
)
def escanear(
    datos: EscaneoRequest,
    db: DbSession,
    usuario: CurrentDirectorOProfesor,
    request: Request,
) -> dict:
    resultado = asistencia_service.registrar_escaneo(
        db,
        contenido=datos.contenido,
        profesor_id=usuario.id,
        horario_id=datos.horario_id,
        ip=_ip(request),
    )
    return _respuesta(resultado)


@router.post(
    "/manual",
    response_model=AsistenciaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar asistencia manual (Director y Profesor)",
    description=(
        "Para estudiantes sin celular. Guarda ``origen='manual'``, registra "
        "quién lo hizo y deja constancia en la bitácora. Si el usuario es "
        "profesor, el estudiante debe pertenecer a sus cursos y debe haber un "
        "bloque de clase vigente."
    ),
)
def registrar_manual(
    datos: AsistenciaManualCreate,
    db: DbSession,
    usuario: CurrentDirectorOProfesor,
    request: Request,
) -> dict:
    resultado = asistencia_service.registrar_manual(
        db,
        datos=datos,
        profesor_id=usuario.id,
        es_profesor=usuario.rol.nombre == RolNombre.PROFESOR.value,
        ip=_ip(request),
    )
    return _respuesta(resultado)


@router.post(
    "/cerrar-bloque",
    response_model=CierreBloqueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cerrar un bloque y marcar ausentes (Director y Profesor)",
    description=(
        "Al finalizar el bloque, los estudiantes del curso sin registro quedan "
        "como ``falta`` y se encola el aviso a su tutor principal."
    ),
)
def cerrar_bloque(
    datos: CierreBloqueRequest,
    db: DbSession,
    usuario: CurrentDirectorOProfesor,
    request: Request,
) -> CierreBloqueResponse:
    resultado = asistencia_service.cerrar_bloque(
        db,
        horario_id=datos.horario_id,
        fecha=datos.fecha,
        profesor_id=usuario.id,
        es_profesor=usuario.rol.nombre == RolNombre.PROFESOR.value,
        ip=_ip(request),
    )
    return CierreBloqueResponse.model_validate(resultado)


@router.get(
    "",
    response_model=list[AsistenciaResponse],
    summary="Listar asistencias (Director y Profesor)",
)
def listar_asistencias(
    db: DbSession,
    _usuario: CurrentDirectorOProfesor,
    response: Response,
    fecha: date | None = Query(default=None),
    curso_id: int | None = Query(default=None, ge=1),
    estudiante_id: int | None = Query(default=None, ge=1),
    horario_id: int | None = Query(default=None, ge=1),
    estado: EstadoAsistencia | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Asistencia]:
    items, total = asistencia_service.listar(
        db,
        fecha=fecha,
        curso_id=curso_id,
        estudiante_id=estudiante_id,
        horario_id=horario_id,
        estado=estado,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get(
    "/{asistencia_id}",
    response_model=AsistenciaResponse,
    summary="Obtener una asistencia (Director y Profesor)",
)
def obtener_asistencia(
    asistencia_id: int, db: DbSession, _usuario: CurrentDirectorOProfesor
) -> Asistencia:
    return asistencia_service.obtener(db, asistencia_id)
