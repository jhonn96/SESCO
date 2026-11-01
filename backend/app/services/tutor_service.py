"""Capa de negocio de tutores (perfil 1:1 de usuario).

La gestión del perfil es exclusiva del Director, tal como el resto de las
cuentas. El **panel del tutor** reutiliza este módulo para que el apoderado
consulte únicamente a sus hijos con vínculo confirmado (RD-02).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import (
    Conflicto,
    NoEncontrado,
    Prohibido,
    ReglaNegocio,
    traducir_integridad,
)
from app.core.orden import orden_persona
from app.models import (
    Asistencia,
    Curso,
    Estudiante,
    Horario,
    Justificacion,
    Notificacion,
    Tutoria,
    Tutor,
    Usuario,
)
from app.schemas.enums import IDS_ROL, RolNombre
from app.schemas.tutor import TutorCreate, TutorUpdate
from app.services import qr_service


def _cargar(db: Session, usuario_id: int) -> Tutor | None:
    return db.scalar(
        select(Tutor)
        .options(joinedload(Tutor.usuario).joinedload(Usuario.rol))
        .where(Tutor.usuario_id == usuario_id)
    )


def listar(
    db: Session,
    *,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Tutor], int]:
    condiciones = []
    if q:
        patron = f"%{q.strip()}%"
        condiciones.append(
            or_(
                Usuario.ci.ilike(patron),
                Usuario.nombres.ilike(patron),
                Usuario.apellidos.ilike(patron),
                Tutor.telefono.ilike(patron),
            )
        )

    total = (
        db.scalar(
            select(func.count())
            .select_from(Tutor)
            .join(Usuario, Usuario.id == Tutor.usuario_id)
            .where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(Tutor)
            .join(Usuario, Usuario.id == Tutor.usuario_id)
            .options(joinedload(Tutor.usuario).joinedload(Usuario.rol))
            .where(*condiciones)
            .order_by(*orden_persona())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, usuario_id: int) -> Tutor:
    tutor = _cargar(db, usuario_id)
    if tutor is None:
        raise NoEncontrado(f"No existe el tutor {usuario_id}")
    return tutor


def crear(db: Session, datos: TutorCreate) -> Tutor:
    usuario = db.get(Usuario, datos.usuario_id)
    if usuario is None:
        raise NoEncontrado(f"No existe el usuario {datos.usuario_id}")
    if usuario.rol_id != IDS_ROL[RolNombre.TUTOR]:
        raise ReglaNegocio("El usuario debe tener rol 'tutor' para crear su perfil")
    if db.get(Tutor, datos.usuario_id) is not None:
        raise Conflicto("Ese usuario ya tiene perfil de tutor")

    tutor = Tutor(usuario_id=datos.usuario_id, telefono=datos.telefono)
    db.add(tutor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ese usuario ya tiene perfil de tutor",
            referencia="El usuario indicado no existe",
        ) from exc
    return obtener(db, datos.usuario_id)


def actualizar(db: Session, usuario_id: int, datos: TutorUpdate) -> Tutor:
    tutor = obtener(db, usuario_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    for campo, valor in cambios.items():
        setattr(tutor, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Datos duplicados",
            referencia="Los datos del tutor no son válidos",
        ) from exc
    return obtener(db, usuario_id)


def eliminar(db: Session, usuario_id: int) -> None:
    tutor = obtener(db, usuario_id)
    db.delete(tutor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El tutor tiene vínculos de tutoría o justificaciones asociadas; "
            "no puede eliminarse"
        ) from exc


# --------------------------------------------------------------------------
# Panel del tutor autenticado
# --------------------------------------------------------------------------


def validar_hijo(db: Session, tutor_id: int, estudiante_id: int) -> Estudiante:
    """Exige un vínculo **confirmado** antes de exponer datos del estudiante.

    Un vínculo ``pendiente`` (RD-02) todavía no habilita al tutor a ver la
    asistencia de ese estudiante.
    """
    tutoria = db.get(Tutoria, (estudiante_id, tutor_id))
    if tutoria is None or tutoria.estado != "confirmada":
        raise Prohibido(
            "Solo el tutor confirmado del estudiante puede consultar su asistencia"
        )

    estudiante = db.get(Estudiante, estudiante_id)
    if estudiante is None:
        raise NoEncontrado(f"No existe el estudiante {estudiante_id}")
    return estudiante


def mis_estudiantes(db: Session, tutor_id: int) -> list[dict[str, Any]]:
    """Hijos del tutor autenticado (solo vínculos confirmados).

    Se ordenan por apellidos para que el selector sea estable entre consultas.
    Cada hijo incluye dos señales para el panel: notificaciones de asistencia
    sin leer y faltas/tardanzas de los últimos siete días.
    """
    filas = db.execute(
        select(Tutoria, Usuario, Curso)
        .join(Estudiante, Estudiante.usuario_id == Tutoria.estudiante_id)
        .join(Usuario, Usuario.id == Estudiante.usuario_id)
        .outerjoin(Curso, Curso.id == Estudiante.curso_id)
        .where(Tutoria.tutor_id == tutor_id, Tutoria.estado == "confirmada")
        .order_by(*orden_persona())
    ).all()

    if not filas:
        return []

    ids = [usuario.id for _, usuario, _ in filas]
    hoy = qr_service.ahora_local().date()
    desde = hoy - timedelta(days=6)

    pendientes = dict(
        db.execute(
            select(Asistencia.estudiante_id, func.count(Notificacion.id))
            .join(Asistencia, Asistencia.id == Notificacion.asistencia_id)
            .where(
                Notificacion.usuario_id == tutor_id,
                Notificacion.leida_en.is_(None),
                Asistencia.estudiante_id.in_(ids),
            )
            .group_by(Asistencia.estudiante_id)
        ).all()
    )
    recientes = dict(
        db.execute(
            select(Asistencia.estudiante_id, func.count(Asistencia.id))
            .where(
                Asistencia.estudiante_id.in_(ids),
                Asistencia.fecha >= desde,
                Asistencia.fecha <= hoy,
                Asistencia.estado.in_(("falta", "tardanza")),
            )
            .group_by(Asistencia.estudiante_id)
        ).all()
    )

    return [
        {
            "usuario_id": usuario.id,
            "nombres": usuario.nombres,
            "apellidos": usuario.apellidos,
            "ci": usuario.ci,
            "parentesco": tutoria.parentesco,
            "es_principal": tutoria.es_principal,
            "curso": curso,
            "notificaciones_pendientes": int(pendientes.get(usuario.id, 0)),
            "faltas_recientes": int(recientes.get(usuario.id, 0)),
        }
        for tutoria, usuario, curso in filas
    ]


def historial_hijo(
    db: Session,
    tutor_id: int,
    estudiante_id: int,
    *,
    mes: str | None = None,
    estado: str | None = None,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """Historial paginado del hijo, con filtros de mes (``YYYY-MM``) y estado.

    Solo se consideran fechas ya ocurridas: el seed contiene registros
    cargados con antelación y no tiene sentido mostrarle al tutor una
    asistencia del futuro.
    """
    validar_hijo(db, tutor_id, estudiante_id)

    condiciones: list[Any] = [
        Asistencia.estudiante_id == estudiante_id,
        Asistencia.fecha <= qr_service.ahora_local().date(),
    ]

    if mes:
        anio, numero_mes = (int(parte) for parte in mes.split("-"))
        inicio = date(anio, numero_mes, 1)
        siguiente = (
            date(anio + 1, 1, 1)
            if numero_mes == 12
            else date(anio, numero_mes + 1, 1)
        )
        condiciones.extend(
            [Asistencia.fecha >= inicio, Asistencia.fecha < siguiente]
        )

    if estado:
        condiciones.append(Asistencia.estado == estado)

    total = (
        db.scalar(
            select(func.count()).select_from(Asistencia).where(*condiciones)
        )
        or 0
    )
    filas = db.execute(
        select(Asistencia, Justificacion)
        .options(joinedload(Asistencia.horario).joinedload(Horario.materia))
        .outerjoin(Justificacion, Justificacion.asistencia_id == Asistencia.id)
        .where(*condiciones)
        .order_by(Asistencia.fecha.desc(), Asistencia.id.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    items = [
        {
            "id": asistencia.id,
            "fecha": asistencia.fecha,
            "estado": asistencia.estado,
            "origen": asistencia.origen,
            "materia": (
                asistencia.horario.materia.nombre
                if asistencia.horario and asistencia.horario.materia
                else None
            ),
            "hora_inicio": (
                asistencia.horario.hora_inicio if asistencia.horario else None
            ),
            "hora_fin": asistencia.horario.hora_fin if asistencia.horario else None,
            "hora_ingreso": asistencia.hora_ingreso,
            "minutos_retraso": asistencia.minutos_retraso,
            "justificacion": justificacion,
        }
        for asistencia, justificacion in filas
    ]
    return items, total
