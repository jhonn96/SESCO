"""Capa de negocio de periodos lectivos."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflicto, NoEncontrado, ReglaNegocio, traducir_integridad
from app.models import Periodo
from app.schemas.periodo import PeriodoCreate, PeriodoUpdate


def listar(
    db: Session,
    *,
    gestion: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Periodo], int]:
    condiciones = []
    if gestion is not None:
        condiciones.append(Periodo.gestion == gestion)

    total = db.scalar(select(func.count()).select_from(Periodo).where(*condiciones)) or 0
    items = list(
        db.scalars(
            select(Periodo)
            .where(*condiciones)
            .order_by(Periodo.gestion.desc(), Periodo.trimestre)
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, periodo_id: int) -> Periodo:
    periodo = db.get(Periodo, periodo_id)
    if periodo is None:
        raise NoEncontrado(f"No existe el periodo {periodo_id}")
    return periodo


def crear(db: Session, datos: PeriodoCreate) -> Periodo:
    periodo = Periodo(
        gestion=datos.gestion,
        trimestre=datos.trimestre,
        fecha_ini=datos.fecha_ini,
        fecha_fin=datos.fecha_fin,
    )
    db.add(periodo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un periodo con esa gestión y trimestre",
            referencia="Los datos del periodo no son válidos",
        ) from exc
    db.refresh(periodo)
    return periodo


def actualizar(db: Session, periodo_id: int, datos: PeriodoUpdate) -> Periodo:
    periodo = obtener(db, periodo_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    for campo, valor in cambios.items():
        setattr(periodo, campo, valor)

    # Revalidación con los valores combinados (un PATCH puede enviar solo una fecha).
    fecha_ini: date = periodo.fecha_ini
    fecha_fin: date = periodo.fecha_fin
    if fecha_fin <= fecha_ini:
        db.rollback()
        raise ReglaNegocio("fecha_fin debe ser posterior a fecha_ini")

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un periodo con esa gestión y trimestre",
            referencia="Los datos del periodo no son válidos",
        ) from exc
    db.refresh(periodo)
    return periodo


def eliminar(db: Session, periodo_id: int) -> None:
    periodo = obtener(db, periodo_id)
    db.delete(periodo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El periodo tiene cursos asociados; no puede eliminarse"
        ) from exc
