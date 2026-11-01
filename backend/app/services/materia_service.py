"""Capa de negocio del catálogo de materias."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflicto, NoEncontrado, traducir_integridad
from app.models import Materia
from app.schemas.materia import MateriaCreate, MateriaUpdate


def listar(
    db: Session,
    *,
    q: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Materia], int]:
    condiciones = []
    if q:
        condiciones.append(Materia.nombre.ilike(f"%{q.strip()}%"))

    total = db.scalar(select(func.count()).select_from(Materia).where(*condiciones)) or 0
    items = list(
        db.scalars(
            select(Materia)
            .where(*condiciones)
            .order_by(Materia.nombre)
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, materia_id: int) -> Materia:
    materia = db.get(Materia, materia_id)
    if materia is None:
        raise NoEncontrado(f"No existe la materia {materia_id}")
    return materia


def crear(db: Session, datos: MateriaCreate) -> Materia:
    materia = Materia(nombre=datos.nombre)
    db.add(materia)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe una materia con ese nombre",
            referencia="Los datos de la materia no son válidos",
        ) from exc
    db.refresh(materia)
    return materia


def actualizar(db: Session, materia_id: int, datos: MateriaUpdate) -> Materia:
    materia = obtener(db, materia_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    for campo, valor in cambios.items():
        setattr(materia, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe una materia con ese nombre",
            referencia="Los datos de la materia no son válidos",
        ) from exc
    db.refresh(materia)
    return materia


def eliminar(db: Session, materia_id: int) -> None:
    materia = obtener(db, materia_id)
    db.delete(materia)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "La materia tiene horarios asignados; no puede eliminarse"
        ) from exc
