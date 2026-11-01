"""Capa de negocio de profesores (perfil 1:1 de usuario).

Acceso exclusivo del Director, igual que la gestión de cuentas.
"""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import Conflicto, NoEncontrado, ReglaNegocio, traducir_integridad
from app.core.orden import orden_persona
from app.models import Profesor, Usuario
from app.schemas.enums import IDS_ROL, RolNombre
from app.schemas.profesor import ProfesorCreate, ProfesorUpdate


def _cargar(db: Session, usuario_id: int) -> Profesor | None:
    return db.scalar(
        select(Profesor)
        .options(joinedload(Profesor.usuario).joinedload(Usuario.rol))
        .where(Profesor.usuario_id == usuario_id)
    )


def listar(
    db: Session,
    *,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Profesor], int]:
    condiciones = []
    if q:
        patron = f"%{q.strip()}%"
        condiciones.append(
            or_(
                Usuario.ci.ilike(patron),
                Usuario.nombres.ilike(patron),
                Usuario.apellidos.ilike(patron),
                Profesor.telefono.ilike(patron),
                Profesor.direccion.ilike(patron),
            )
        )

    total = (
        db.scalar(
            select(func.count())
            .select_from(Profesor)
            .join(Usuario, Usuario.id == Profesor.usuario_id)
            .where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(Profesor)
            .join(Usuario, Usuario.id == Profesor.usuario_id)
            .options(joinedload(Profesor.usuario).joinedload(Usuario.rol))
            .where(*condiciones)
            .order_by(*orden_persona())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, usuario_id: int) -> Profesor:
    profesor = _cargar(db, usuario_id)
    if profesor is None:
        raise NoEncontrado(f"No existe el profesor {usuario_id}")
    return profesor


def crear(db: Session, datos: ProfesorCreate) -> Profesor:
    usuario = db.get(Usuario, datos.usuario_id)
    if usuario is None:
        raise NoEncontrado(f"No existe el usuario {datos.usuario_id}")
    if usuario.rol_id != IDS_ROL[RolNombre.PROFESOR]:
        raise ReglaNegocio("El usuario debe tener rol 'profesor' para crear su perfil")
    if db.get(Profesor, datos.usuario_id) is not None:
        raise Conflicto("Ese usuario ya tiene perfil de profesor")

    profesor = Profesor(
        usuario_id=datos.usuario_id,
        fecha_ingreso=datos.fecha_ingreso,
        direccion=datos.direccion.strip(),
        telefono=datos.telefono.strip(),
    )
    db.add(profesor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ese usuario ya tiene perfil de profesor",
            referencia="El usuario indicado no existe",
        ) from exc
    return obtener(db, datos.usuario_id)


def actualizar(db: Session, usuario_id: int, datos: ProfesorUpdate) -> Profesor:
    profesor = obtener(db, usuario_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }

    # Los datos personales se guardan en la cuenta asociada (1:1).
    usuario = profesor.usuario
    if usuario is None:
        raise NoEncontrado(f"No existe el usuario {usuario_id}")
    for campo in ("nombres", "apellidos", "ci"):
        if campo in cambios:
            setattr(usuario, campo, cambios.pop(campo).strip())

    for campo, valor in cambios.items():
        if isinstance(valor, str):
            valor = valor.strip()
        setattr(profesor, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un usuario con esa cédula",
            referencia="Los datos del profesor no son válidos",
        ) from exc
    return obtener(db, usuario_id)


def eliminar(db: Session, usuario_id: int) -> None:
    profesor = obtener(db, usuario_id)
    db.delete(profesor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El profesor tiene cursos u horarios asociados; no puede eliminarse"
        ) from exc
