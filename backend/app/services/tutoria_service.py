"""Capa de negocio de tutorías (vínculo estudiante - tutor).

RD-02:
- El vínculo nace en ``pendiente``.
- Solo el Director puede confirmarlo (``confirmado_por`` / ``confirmado_en``).
- La baja es lógica: ``estado='baja'``.
- Como máximo un tutor principal por estudiante (regla de aplicación; el
  esquema no la impone, por eso se desmarcan los demás al activar uno).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflicto, NoEncontrado, ReglaNegocio, traducir_integridad
from app.models import Estudiante, Tutoria, Tutor
from app.schemas.tutoria import TutoriaCreate, TutoriaUpdate


def listar(
    db: Session,
    *,
    estudiante_id: int | None = None,
    tutor_id: int | None = None,
    estado: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[Tutoria]:
    condiciones = []
    if estudiante_id is not None:
        condiciones.append(Tutoria.estudiante_id == estudiante_id)
    if tutor_id is not None:
        condiciones.append(Tutoria.tutor_id == tutor_id)
    if estado is not None:
        condiciones.append(Tutoria.estado == estado)

    return list(
        db.scalars(
            select(Tutoria)
            .where(*condiciones)
            .order_by(Tutoria.estudiante_id, Tutoria.tutor_id)
            .offset(skip)
            .limit(limit)
        )
    )


def obtener(db: Session, estudiante_id: int, tutor_id: int) -> Tutoria:
    tutoria = db.get(Tutoria, (estudiante_id, tutor_id))
    if tutoria is None:
        raise NoEncontrado(
            f"No existe el vínculo entre el estudiante {estudiante_id} y el tutor {tutor_id}"
        )
    return tutoria


def _validar_participantes(db: Session, estudiante_id: int, tutor_id: int) -> None:
    if db.get(Estudiante, estudiante_id) is None:
        raise NoEncontrado(f"No existe el estudiante {estudiante_id}")
    if db.get(Tutor, tutor_id) is None:
        raise NoEncontrado(f"No existe el tutor {tutor_id}")


def _marcar_principal(db: Session, estudiante_id: int, tutor_id: int) -> None:
    db.execute(
        update(Tutoria)
        .where(
            Tutoria.estudiante_id == estudiante_id,
            Tutoria.tutor_id != tutor_id,
            Tutoria.es_principal.is_(True),
        )
        .values(es_principal=False)
    )


def crear(db: Session, datos: TutoriaCreate) -> Tutoria:
    _validar_participantes(db, datos.estudiante_id, datos.tutor_id)
    if db.get(Tutoria, (datos.estudiante_id, datos.tutor_id)) is not None:
        raise Conflicto("Ya existe un vínculo entre ese estudiante y ese tutor")

    tutoria = Tutoria(
        estudiante_id=datos.estudiante_id,
        tutor_id=datos.tutor_id,
        parentesco=datos.parentesco.value,
        es_principal=datos.es_principal,
        estado="pendiente",
    )
    if datos.es_principal:
        _marcar_principal(db, datos.estudiante_id, datos.tutor_id)
    db.add(tutoria)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un vínculo entre ese estudiante y ese tutor",
            referencia="El estudiante o el tutor indicado no existe",
        ) from exc
    db.refresh(tutoria)
    return tutoria


def actualizar(
    db: Session, estudiante_id: int, tutor_id: int, datos: TutoriaUpdate
) -> Tutoria:
    tutoria = obtener(db, estudiante_id, tutor_id)
    if tutoria.estado == "baja":
        raise ReglaNegocio("El vínculo está dado de baja; no puede modificarse")

    cambios: dict[str, Any] = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    if cambios.get("es_principal"):
        _marcar_principal(db, estudiante_id, tutor_id)

    for campo, valor in cambios.items():
        if campo == "parentesco":
            valor = valor.value
        setattr(tutoria, campo, valor)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Datos duplicados",
            referencia="Los datos del vínculo no son válidos",
        ) from exc
    db.refresh(tutoria)
    return tutoria


def confirmar(db: Session, estudiante_id: int, tutor_id: int, *, director_id: int) -> Tutoria:
    """Confirma el vínculo (RD-02). Idempotente si ya estaba confirmado."""
    tutoria = obtener(db, estudiante_id, tutor_id)
    if tutoria.estado == "baja":
        raise Conflicto("El vínculo está dado de baja y no puede confirmarse")
    if tutoria.estado == "confirmada":
        return tutoria

    tutoria.estado = "confirmada"
    tutoria.confirmado_por = director_id
    tutoria.confirmado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tutoria)
    return tutoria


def dar_de_baja(db: Session, estudiante_id: int, tutor_id: int) -> None:
    tutoria = obtener(db, estudiante_id, tutor_id)
    tutoria.estado = "baja"
    tutoria.es_principal = False
    db.commit()
