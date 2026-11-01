"""Capa de negocio de cursos."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflicto, NoEncontrado, traducir_integridad
from app.models import Curso, Periodo
from app.schemas.curso import CursoCreate, CursoUpdate
from app.schemas.enums import NivelCurso


def listar(
    db: Session,
    *,
    periodo_id: int | None = None,
    nivel: NivelCurso | None = None,
    grado: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Curso], int]:
    condiciones = []
    if periodo_id is not None:
        condiciones.append(Curso.periodo_id == periodo_id)
    if nivel is not None:
        condiciones.append(Curso.nivel == nivel.value)
    if grado is not None:
        condiciones.append(Curso.grado == grado)

    total = db.scalar(select(func.count()).select_from(Curso).where(*condiciones)) or 0
    items = list(
        db.scalars(
            select(Curso)
            .where(*condiciones)
            .order_by(Curso.periodo_id, Curso.nivel, Curso.grado, Curso.paralelo)
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, curso_id: int) -> Curso:
    curso = db.get(Curso, curso_id)
    if curso is None:
        raise NoEncontrado(f"No existe el curso {curso_id}")
    return curso


def _validar_periodo(db: Session, periodo_id: int) -> None:
    if db.get(Periodo, periodo_id) is None:
        raise NoEncontrado(f"No existe el periodo {periodo_id}")


def crear(db: Session, datos: CursoCreate) -> Curso:
    _validar_periodo(db, datos.periodo_id)
    curso = Curso(
        nivel=datos.nivel.value,
        grado=datos.grado,
        paralelo=datos.paralelo,
        turno=datos.turno.value,
        periodo_id=datos.periodo_id,
    )
    db.add(curso)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un curso con ese nivel, grado, paralelo y periodo",
            referencia="El periodo indicado no existe",
        ) from exc
    db.refresh(curso)
    return curso


def actualizar(db: Session, curso_id: int, datos: CursoUpdate) -> Curso:
    curso = obtener(db, curso_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    if "periodo_id" in cambios:
        _validar_periodo(db, cambios["periodo_id"])
    for campo, valor in cambios.items():
        if campo in {"nivel", "turno"}:
            valor = valor.value
        setattr(curso, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un curso con ese nivel, grado, paralelo y periodo",
            referencia="Los datos del curso no son válidos",
        ) from exc
    db.refresh(curso)
    return curso


def eliminar(db: Session, curso_id: int) -> None:
    curso = obtener(db, curso_id)
    db.delete(curso)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El curso tiene estudiantes, horarios o profesores asignados; "
            "no puede eliminarse"
        ) from exc
