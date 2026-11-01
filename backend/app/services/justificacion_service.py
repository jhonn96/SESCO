"""Capa de negocio de justificaciones (RF-09).

Reglas
------
- Solo el **tutor confirmado** del estudiante puede justificar.
- Solo el **mismo día** de la falta/tardanza (zona horaria del colegio).
- La asistencia debe estar en ``falta`` o ``tardanza`` y no tener ya una
  justificación (``asistencia_id`` es UNIQUE).
- Nace en ``pendiente``; el Director o el Profesor la aprueban o rechazan.
- Al aprobar, la asistencia pasa a ``justificada`` y —como en el dataset— se
  cubren también las demás faltas/tardanzas del estudiante de ese mismo día.
- El tutor recibe una notificación con el resultado.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core import audit
from app.core.exceptions import (
    Conflicto,
    NoEncontrado,
    Prohibido,
    ReglaNegocio,
    traducir_integridad,
)
from app.models import (
    Asistencia,
    Estudiante,
    Horario,
    Justificacion,
    Notificacion,
    Tutoria,
)
from app.schemas.enums import EstadoAsistencia, EstadoJustificacion
from app.schemas.justificacion import JustificacionCreate, JustificacionResolucion
from app.services import qr_service

ESTADOS_JUSTIFICABLES = (
    EstadoAsistencia.FALTA.value,
    EstadoAsistencia.TARDANZA.value,
)


def _opciones() -> tuple[Any, ...]:
    return (
        joinedload(Justificacion.asistencia)
        .joinedload(Asistencia.estudiante)
        .joinedload(Estudiante.usuario),
        joinedload(Justificacion.asistencia)
        .joinedload(Asistencia.horario)
        .joinedload(Horario.materia),
        joinedload(Justificacion.asistencia)
        .joinedload(Asistencia.horario)
        .joinedload(Horario.curso),
    )


def _cargar(db: Session, justificacion_id: int) -> Justificacion:
    justificacion = db.scalar(
        select(Justificacion)
        .options(*_opciones())
        .where(Justificacion.id == justificacion_id)
    )
    if justificacion is None:
        raise NoEncontrado(f"No existe la justificación {justificacion_id}")
    return justificacion


def _cargar_asistencia(db: Session, asistencia_id: int) -> Asistencia:
    asistencia = db.scalar(
        select(Asistencia)
        .options(
            joinedload(Asistencia.estudiante).joinedload(Estudiante.usuario),
            joinedload(Asistencia.horario).joinedload(Horario.materia),
            joinedload(Asistencia.horario).joinedload(Horario.curso),
        )
        .where(Asistencia.id == asistencia_id)
    )
    if asistencia is None:
        raise NoEncontrado(f"No existe la asistencia {asistencia_id}")
    return asistencia


def _validar_tutor(db: Session, estudiante_id: int, tutor_id: int) -> None:
    tutoria = db.get(Tutoria, (estudiante_id, tutor_id))
    if tutoria is None or tutoria.estado != "confirmada":
        raise Prohibido(
            "Solo el tutor principal confirmado del estudiante puede justificar "
            "su asistencia"
        )


def _nombre_estudiante(estudiante: Estudiante) -> str:
    return f"{estudiante.usuario.nombres} {estudiante.usuario.apellidos}".strip()


def crear(
    db: Session,
    *,
    datos: JustificacionCreate,
    tutor_id: int,
    ip: str | None = None,
) -> Justificacion:
    asistencia = _cargar_asistencia(db, datos.asistencia_id)
    if asistencia.estado not in ESTADOS_JUSTIFICABLES:
        raise ReglaNegocio(
            "Solo se pueden justificar asistencias en estado 'falta' o 'tardanza'"
        )

    hoy = qr_service.ahora_local().date()
    if asistencia.fecha != hoy:
        raise ReglaNegocio(
            "Solo se puede enviar la justificación el mismo día de la falta "
            f"(fecha de la asistencia: {asistencia.fecha.isoformat()}, hoy: {hoy.isoformat()})"
        )

    _validar_tutor(db, asistencia.estudiante_id, tutor_id)

    if db.scalar(
        select(Justificacion.id).where(Justificacion.asistencia_id == asistencia.id)
    ) is not None:
        raise Conflicto("La asistencia ya tiene una justificación registrada")

    justificacion = Justificacion(
        asistencia_id=asistencia.id,
        tutor_id=tutor_id,
        motivo=datos.motivo,
        estado=EstadoJustificacion.PENDIENTE.value,
    )
    db.add(justificacion)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="La asistencia ya tiene una justificación registrada",
            referencia="La asistencia o el tutor indicado no existe",
        ) from exc

    audit.registrar(
        db,
        usuario_id=tutor_id,
        accion="ENVIAR_JUSTIFICACION",
        entidad="justificacion",
        entidad_id=justificacion.id,
        detalle={
            "asistencia_id": asistencia.id,
            "estudiante_id": asistencia.estudiante_id,
            "fecha": asistencia.fecha.isoformat(),
            "estado_asistencia": asistencia.estado,
        },
        ip=ip,
    )
    db.commit()
    return _cargar(db, justificacion.id)


def _cubrir_faltas_del_dia(
    db: Session, asistencia: Asistencia, fecha: date
) -> int:
    """Marca como justificadas las faltas/tardanzas del mismo día del estudiante."""
    hermanas = list(
        db.scalars(
            select(Asistencia).where(
                Asistencia.estudiante_id == asistencia.estudiante_id,
                Asistencia.fecha == fecha,
                Asistencia.estado.in_(ESTADOS_JUSTIFICABLES),
            )
        )
    )
    for hermana in hermanas:
        hermana.estado = EstadoAsistencia.JUSTIFICADA.value
    return len(hermanas)


def resolver(
    db: Session,
    *,
    justificacion_id: int,
    datos: JustificacionResolucion,
    revisor_id: int,
    ip: str | None = None,
) -> Justificacion:
    justificacion = _cargar(db, justificacion_id)
    if justificacion.estado != EstadoJustificacion.PENDIENTE.value:
        raise Conflicto(
            f"La justificación ya fue resuelta ({justificacion.estado})"
        )

    asistencia = justificacion.asistencia
    justificacion.estado = datos.estado.value
    justificacion.revisado_por = revisor_id
    justificacion.revisado_en = qr_service.ahora_local()
    justificacion.comentario_resolucion = datos.comentario_resolucion

    actualizadas = 0
    if datos.estado == EstadoJustificacion.APROBADA:
        actualizadas = _cubrir_faltas_del_dia(db, asistencia, asistencia.fecha)

    aprobada = datos.estado == EstadoJustificacion.APROBADA
    resultado = "aprobada" if aprobada else "rechazada"
    comentario = (datos.comentario_resolucion or "").strip()
    mensaje = (
        f"Su justificación del {asistencia.fecha.strftime('%d/%m/%Y')} fue {resultado}."
        + (f" {comentario}" if comentario else "")
    )
    db.add(
        Notificacion(
            usuario_id=justificacion.tutor_id,
            justificacion_id=justificacion.id,
            tipo="justificacion",
            canal="app",
            mensaje=mensaje,
            intentos=0,
        )
    )

    audit.registrar(
        db,
        usuario_id=revisor_id,
        accion="RESOLVER_JUSTIFICACION",
        entidad="justificacion",
        entidad_id=justificacion.id,
        detalle={
            "asistencia_id": asistencia.id,
            "estudiante_id": asistencia.estudiante_id,
            "estado": datos.estado.value,
            "asistencias_justificadas": actualizadas,
        },
        ip=ip,
    )
    db.commit()
    return _cargar(db, justificacion.id)


def _condiciones(
    *,
    tutor_id: int | None,
    estudiante_id: int | None,
    estado: EstadoJustificacion | None,
    fecha: date | None,
) -> list[Any]:
    condiciones: list[Any] = []
    if tutor_id is not None:
        condiciones.append(Justificacion.tutor_id == tutor_id)
    if estado is not None:
        condiciones.append(Justificacion.estado == estado.value)
    if estudiante_id is not None:
        condiciones.append(Asistencia.estudiante_id == estudiante_id)
    if fecha is not None:
        condiciones.append(Asistencia.fecha == fecha)
    return condiciones


def listar(
    db: Session,
    *,
    tutor_id: int | None = None,
    estudiante_id: int | None = None,
    estado: EstadoJustificacion | None = None,
    fecha: date | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Justificacion], int]:
    condiciones = _condiciones(
        tutor_id=tutor_id,
        estudiante_id=estudiante_id,
        estado=estado,
        fecha=fecha,
    )
    total = (
        db.scalar(
            select(func.count())
            .select_from(Justificacion)
            .join(Asistencia, Asistencia.id == Justificacion.asistencia_id)
            .where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(Justificacion)
            .join(Asistencia, Asistencia.id == Justificacion.asistencia_id)
            .options(*_opciones())
            .where(*condiciones)
            .order_by(Justificacion.creado_en.desc(), Justificacion.id.desc())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, justificacion_id: int) -> Justificacion:
    return _cargar(db, justificacion_id)


def validar_visibilidad(justificacion: Justificacion, *, usuario_id: int) -> None:
    """Un tutor solo puede ver sus propias justificaciones."""
    if justificacion.tutor_id != usuario_id:
        raise Prohibido("Solo el tutor que envió la justificación puede consultarla")
