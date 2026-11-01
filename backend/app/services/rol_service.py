"""Capa de negocio del catálogo de roles."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflicto, NoEncontrado, traducir_integridad
from app.models import Rol
from app.schemas.rol import RolCreate, RolUpdate


def listar(db: Session) -> list[Rol]:
    return list(db.scalars(select(Rol).order_by(Rol.id)))


def obtener(db: Session, rol_id: int) -> Rol:
    rol = db.get(Rol, rol_id)
    if rol is None:
        raise NoEncontrado(f"No existe el rol {rol_id}")
    return rol


def crear(db: Session, datos: RolCreate) -> Rol:
    rol = Rol(id=datos.id, nombre=datos.nombre)
    db.add(rol)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un rol con ese id o nombre",
            referencia="Los datos del rol no son válidos",
        ) from exc
    db.refresh(rol)
    return rol


def actualizar(db: Session, rol_id: int, datos: RolUpdate) -> Rol:
    rol = obtener(db, rol_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    for campo, valor in cambios.items():
        setattr(rol, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un rol con ese nombre",
            referencia="Los datos del rol no son válidos",
        ) from exc
    db.refresh(rol)
    return rol


def eliminar(db: Session, rol_id: int) -> None:
    rol = obtener(db, rol_id)
    db.delete(rol)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El rol tiene usuarios asociados; reasígnelos antes de eliminarlo"
        ) from exc
