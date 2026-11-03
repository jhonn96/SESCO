"""Capa de negocio de ``profesor_curso``.

Reglas:
- El profesor y el curso deben existir.
- Un profesor no puede asignarse dos veces al mismo curso.
- Como máximo hay un asesor por curso: al marcar uno nuevo se desmarca el
  anterior (misma idea que el tutor principal de ``tutoria``).
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import Conflicto, NoEncontrado, traducir_integridad
from app.models import Curso, Profesor, ProfesorCurso, Usuario
from app.schemas.profesor_curso import ProfesorCursoCreate


def _cargar(db: Session, profesor_id: int, curso_id: int) -> ProfesorCurso | None:
    return db.scalar(
        select(ProfesorCurso)
        .options(
            joinedload(ProfesorCurso.profesor)
            .joinedload(Profesor.usuario)
            .joinedload(Usuario.rol),
            joinedload(ProfesorCurso.curso),
        )
        .where(
            ProfesorCurso.profesor_id == profesor_id,
            ProfesorCurso.curso_id == curso_id,
        )
    )


def listar(
    db: Session,
    *,
    curso_id: int | None = None,
    profesor_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[ProfesorCurso], int]:
    condiciones = []
    if curso_id is not None:
        condiciones.append(ProfesorCurso.curso_id == curso_id)
    if profesor_id is not None:
        condiciones.append(ProfesorCurso.profesor_id == profesor_id)

    total = (
        db.scalar(
            select(func.count()).select_from(ProfesorCurso).where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(ProfesorCurso)
            .options(
                joinedload(ProfesorCurso.profesor)
                .joinedload(Profesor.usuario)
                .joinedload(Usuario.rol),
                joinedload(ProfesorCurso.curso),
            )
            .where(*condiciones)
            .order_by(ProfesorCurso.curso_id, ProfesorCurso.profesor_id)
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def cursos_de_profesor(db: Session, profesor_id: int) -> list[Curso]:
    """Cursos asignados al profesor en ``profesor_curso``."""
    return list(
        db.scalars(
            select(Curso)
            .join(ProfesorCurso, ProfesorCurso.curso_id == Curso.id)
            .where(ProfesorCurso.profesor_id == profesor_id)
            .order_by(Curso.id)
        )
    )


def obtener(db: Session, profesor_id: int, curso_id: int) -> ProfesorCurso:
    asignacion = _cargar(db, profesor_id, curso_id)
    if asignacion is None:
        raise NoEncontrado(
            f"No existe la asignación del profesor {profesor_id} al curso {curso_id}"
        )
    return asignacion


def crear(db: Session, datos: ProfesorCursoCreate) -> ProfesorCurso:
    if db.get(Profesor, datos.profesor_id) is None:
        raise NoEncontrado(f"No existe el profesor {datos.profesor_id}")
    if db.get(Curso, datos.curso_id) is None:
        raise NoEncontrado(f"No existe el curso {datos.curso_id}")
    if db.get(ProfesorCurso, (datos.profesor_id, datos.curso_id)) is not None:
        raise Conflicto("Ese profesor ya está asignado a ese curso")

    if datos.es_asesor:
        # Un único asesor por curso: el nuevo reemplaza al anterior.
        db.execute(
            update(ProfesorCurso)
            .where(
                ProfesorCurso.curso_id == datos.curso_id,
                ProfesorCurso.es_asesor.is_(True),
            )
            .values(es_asesor=False)
        )

    asignacion = ProfesorCurso(
        profesor_id=datos.profesor_id,
        curso_id=datos.curso_id,
        es_asesor=datos.es_asesor,
    )
    db.add(asignacion)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ese profesor ya está asignado a ese curso",
            referencia="El profesor o el curso indicado no existe",
        ) from exc
    return obtener(db, datos.profesor_id, datos.curso_id)


def eliminar(db: Session, profesor_id: int, curso_id: int) -> None:
    asignacion = obtener(db, profesor_id, curso_id)
    db.delete(asignacion)
    db.commit()
