"""Capa de negocio de estudiantes.

El perfil es 1:1 con ``usuario`` (misma PK) y cuelga de un ``curso``.
La semilla TOTP (``secreto_qr``) se genera aquí y nunca se devuelve por la API.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pyotp
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import Conflicto, NoEncontrado, ReglaNegocio, traducir_integridad
from app.core.orden import orden_persona
from app.models import (
    Asistencia,
    Curso,
    Estudiante,
    Horario,
    ProfesorCurso,
    Tutor,
    Tutoria,
    Usuario,
)
from app.schemas.enums import IDS_ROL, RolNombre
from app.schemas.estudiante import EstudianteCreate, EstudianteUpdate
from app.services import qr_service
from app.services.horario_service import ORDEN_DIAS


def _cargar(db: Session, usuario_id: int) -> Estudiante | None:
    return db.scalar(
        select(Estudiante)
        .options(
            joinedload(Estudiante.usuario).joinedload(Usuario.rol),
            joinedload(Estudiante.curso),
        )
        .where(Estudiante.usuario_id == usuario_id)
    )


def listar(
    db: Session,
    *,
    curso_id: int | None = None,
    profesor_id: int | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Estudiante], int]:
    condiciones = []
    if curso_id is not None:
        condiciones.append(Estudiante.curso_id == curso_id)
    if profesor_id is not None:
        # Solo los cursos que el docente tiene asignados en ``profesor_curso``.
        cursos_docente = select(ProfesorCurso.curso_id).where(
            ProfesorCurso.profesor_id == profesor_id
        )
        condiciones.append(Estudiante.curso_id.in_(cursos_docente))
    if q:
        patron = f"%{q.strip()}%"
        condiciones.append(
            or_(
                Usuario.ci.ilike(patron),
                Usuario.nombres.ilike(patron),
                Usuario.apellidos.ilike(patron),
            )
        )

    base = select(Estudiante).join(Usuario, Usuario.id == Estudiante.usuario_id)
    total = (
        db.scalar(
            select(func.count())
            .select_from(Estudiante)
            .join(Usuario, Usuario.id == Estudiante.usuario_id)
            .where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            base.options(
                joinedload(Estudiante.usuario).joinedload(Usuario.rol),
                joinedload(Estudiante.curso),
            )
            .where(*condiciones)
            .order_by(*orden_persona())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, usuario_id: int) -> Estudiante:
    estudiante = _cargar(db, usuario_id)
    if estudiante is None:
        raise NoEncontrado(f"No existe el estudiante {usuario_id}")
    return estudiante


def crear(db: Session, datos: EstudianteCreate) -> Estudiante:
    usuario = db.get(Usuario, datos.usuario_id)
    if usuario is None:
        raise NoEncontrado(f"No existe el usuario {datos.usuario_id}")
    if usuario.rol_id != IDS_ROL[RolNombre.ESTUDIANTE]:
        raise ReglaNegocio("El usuario debe tener rol 'estudiante' para crear su perfil")
    if db.get(Estudiante, datos.usuario_id) is not None:
        raise Conflicto("Ese usuario ya tiene perfil de estudiante")
    if db.get(Curso, datos.curso_id) is None:
        raise NoEncontrado(f"No existe el curso {datos.curso_id}")

    estudiante = Estudiante(
        usuario_id=datos.usuario_id,
        curso_id=datos.curso_id,
        fecha_nac=datos.fecha_nac,
        # Semilla TOTP en bytes (columna bytea); nunca se serializa.
        secreto_qr=pyotp.random_base32().encode("utf-8"),
    )
    db.add(estudiante)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ese usuario ya tiene perfil de estudiante",
            referencia="El curso o el usuario indicado no existe",
        ) from exc
    return obtener(db, datos.usuario_id)


def actualizar(db: Session, usuario_id: int, datos: EstudianteUpdate) -> Estudiante:
    estudiante = obtener(db, usuario_id)
    cambios: dict[str, Any] = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }
    if "curso_id" in cambios and db.get(Curso, cambios["curso_id"]) is None:
        raise NoEncontrado(f"No existe el curso {cambios['curso_id']}")

    # Los datos personales se guardan en la cuenta asociada (1:1).
    usuario = estudiante.usuario
    if usuario is None:
        raise NoEncontrado(f"No existe el usuario {usuario_id}")
    for campo in ("nombres", "apellidos", "ci"):
        if campo in cambios:
            valor = cambios.pop(campo)
            setattr(usuario, campo, valor.strip())

    for campo, valor in cambios.items():
        setattr(estudiante, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un usuario con esa cédula",
            referencia="El curso indicado no existe",
        ) from exc
    return obtener(db, usuario_id)


def eliminar(db: Session, usuario_id: int) -> None:
    estudiante = obtener(db, usuario_id)
    db.delete(estudiante)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El estudiante tiene asistencias, tutorías, alertas o usos de QR asociados; "
            "no puede eliminarse"
        ) from exc


# --------------------------------------------------------------------------
# Panel del estudiante autenticado
# --------------------------------------------------------------------------


def _validar_perfil(db: Session, estudiante_id: int) -> None:
    if db.get(Estudiante, estudiante_id) is None:
        raise NoEncontrado(f"No existe el estudiante {estudiante_id}")


def resumen_asistencia(db: Session, estudiante_id: int) -> dict[str, int]:
    """KPIs del estudiante: días presente, tardanzas y faltas.

    ``dias_presente`` cuenta fechas distintas (un día puede tener varios
    bloques); tardanzas y faltas cuentan registros, que es como se reportan.
    Solo se consideran fechas ya ocurridas: el seed trae registros futuros.
    """
    _validar_perfil(db, estudiante_id)

    hoy = qr_service.ahora_local().date()
    filas = db.execute(
        select(
            Asistencia.estado,
            func.count(Asistencia.id),
            func.count(func.distinct(Asistencia.fecha)),
        )
        .where(Asistencia.estudiante_id == estudiante_id, Asistencia.fecha <= hoy)
        .group_by(Asistencia.estado)
    ).all()
    conteos = {estado: (total, dias) for estado, total, dias in filas}

    return {
        "dias_presente": conteos.get("presente", (0, 0))[1],
        "tardanzas": conteos.get("tardanza", (0, 0))[0],
        "faltas": conteos.get("falta", (0, 0))[0],
    }


def _item_historial(registro: Asistencia) -> dict[str, Any]:
    """Proyección común de un registro de asistencia para el panel."""
    return {
        "id": registro.id,
        "fecha": registro.fecha,
        "estado": registro.estado,
        "origen": registro.origen,
        "materia": (
            registro.horario.materia.nombre
            if registro.horario and registro.horario.materia
            else None
        ),
        "hora_inicio": registro.horario.hora_inicio if registro.horario else None,
        "hora_fin": registro.horario.hora_fin if registro.horario else None,
        "hora_ingreso": registro.hora_ingreso,
        "minutos_retraso": registro.minutos_retraso,
    }


def historial_asistencia(
    db: Session, estudiante_id: int, *, limite: int = 5
) -> list[dict[str, Any]]:
    """Últimos registros de asistencia del estudiante, del más nuevo al más viejo.

    Se excluyen las fechas futuras que pueda contener la carga inicial.
    """
    _validar_perfil(db, estudiante_id)

    hoy = qr_service.ahora_local().date()
    registros = db.scalars(
        select(Asistencia)
        .options(joinedload(Asistencia.horario).joinedload(Horario.materia))
        .where(Asistencia.estudiante_id == estudiante_id, Asistencia.fecha <= hoy)
        .order_by(Asistencia.fecha.desc(), Asistencia.id.desc())
        .limit(limite)
    ).all()

    return [_item_historial(registro) for registro in registros]


def historial_completo(
    db: Session,
    estudiante_id: int,
    *,
    mes: str | None = None,
    estado: str | None = None,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """Historial paginado con filtros opcionales de mes (``YYYY-MM``) y estado."""
    _validar_perfil(db, estudiante_id)

    condiciones = [
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
        condiciones.extend([Asistencia.fecha >= inicio, Asistencia.fecha < siguiente])

    if estado:
        condiciones.append(Asistencia.estado == estado)

    total = (
        db.scalar(
            select(func.count()).select_from(Asistencia).where(*condiciones)
        )
        or 0
    )
    registros = db.scalars(
        select(Asistencia)
        .options(joinedload(Asistencia.horario).joinedload(Horario.materia))
        .where(*condiciones)
        .order_by(Asistencia.fecha.desc(), Asistencia.id.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return [_item_historial(registro) for registro in registros], total


def horario_estudiante(db: Session, estudiante_id: int) -> dict[str, Any]:
    """Grilla semanal del curso del estudiante, ordenada por día y hora."""
    estudiante = _cargar(db, estudiante_id)
    if estudiante is None:
        raise NoEncontrado(f"No existe el estudiante {estudiante_id}")

    bloques = db.scalars(
        select(Horario)
        .options(joinedload(Horario.materia))
        .where(Horario.curso_id == estudiante.curso_id)
        .order_by(ORDEN_DIAS, Horario.hora_inicio)
    ).all()

    return {
        "curso": estudiante.curso,
        "bloques": [
            {
                "id": bloque.id,
                "dia_semana": bloque.dia_semana,
                "hora_inicio": bloque.hora_inicio,
                "hora_fin": bloque.hora_fin,
                "es_ultimo_bloque": bloque.es_ultimo_bloque,
                "materia": bloque.materia.nombre if bloque.materia else None,
            }
            for bloque in bloques
        ],
    }


def tutor_a_cargo(db: Session, estudiante_id: int) -> dict[str, Any] | None:
    """Tutor principal del estudiante, solo si el vínculo está confirmado.

    Si no hay un tutor marcado como principal, se devuelve el primero de los
    confirmados para no dejar al estudiante sin datos de contacto.
    """
    _validar_perfil(db, estudiante_id)

    fila = db.execute(
        select(Usuario, Tutor, Tutoria)
        .join(Tutoria, Tutoria.tutor_id == Usuario.id)
        .join(Tutor, Tutor.usuario_id == Usuario.id)
        .where(
            Tutoria.estudiante_id == estudiante_id,
            Tutoria.estado == "confirmada",
        )
        .order_by(Tutoria.es_principal.desc(), Usuario.apellidos, Usuario.nombres)
        .limit(1)
    ).first()
    if fila is None:
        return None

    usuario, tutor, tutoria = fila
    return {
        "tutor_id": usuario.id,
        "nombres": usuario.nombres,
        "apellidos": usuario.apellidos,
        "ci": usuario.ci,
        "parentesco": tutoria.parentesco,
        "telefono": tutor.telefono,
        "es_principal": tutoria.es_principal,
    }
