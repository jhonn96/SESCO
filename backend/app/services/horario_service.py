"""Capa de negocio de horarios (bloques de clase).

Reglas críticas para la asistencia:
- ``hora_fin`` debe ser posterior a ``hora_inicio``.
- **No puede haber dos bloques solapados en el mismo curso y el mismo día**.
  Los intervalos son semiabiertos: un bloque 08:00-09:30 y otro 09:30-11:00 son
  válidos el mismo día.
- Como máximo un ``es_ultimo_bloque`` por curso y día (cierre de jornada).
- Un profesor no puede dictar dos cursos a la misma hora del mismo día.
- La materia, el curso y el profesor deben existir.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import Conflicto, NoEncontrado, ReglaNegocio, traducir_integridad
from app.models import Asistencia, Curso, Estudiante, Horario, Materia, Profesor
from app.schemas.enums import DiaSemana
from app.schemas.horario import HorarioCreate, HorarioUpdate
from app.services import qr_service

#: Orden lunes -> viernes para los listados (el alfabético no es útil aquí).
ORDEN_DIAS = case(
    (Horario.dia_semana == DiaSemana.LUNES.value, 1),
    (Horario.dia_semana == DiaSemana.MARTES.value, 2),
    (Horario.dia_semana == DiaSemana.MIERCOLES.value, 3),
    (Horario.dia_semana == DiaSemana.JUEVES.value, 4),
    (Horario.dia_semana == DiaSemana.VIERNES.value, 5),
    else_=6,
)

#: Días hábiles en el mismo orden que ``datetime.weekday()`` (lunes = 0).
DIAS_HABILES = tuple(dia.value for dia in DiaSemana)


def dia_semana_de(momento: datetime) -> str | None:
    """Día de la grilla para un instante; ``None`` en fin de semana."""
    indice = momento.weekday()
    return DIAS_HABILES[indice] if indice < len(DIAS_HABILES) else None


#: Minutos de tolerancia antes del inicio y después del fin de un bloque para
#: permitir solicitar el QR del estudiante.
MARGEN_QR = timedelta(minutes=10)


def bloque_para_qr(
    db: Session, curso_id: int, *, momento: datetime | None = None
) -> Horario | None:
    """Bloque del curso que cubre ``momento`` con el margen del QR.

    Se considera disponible el bloque si ``momento`` cae entre 10 minutos
    antes de ``hora_inicio`` y 10 minutos después de ``hora_fin``. Devuelve
    ``None`` en fin de semana o si no hay un bloque aplicable.
    """
    instante = momento or qr_service.ahora_local()
    dia = dia_semana_de(instante)
    if dia is None:
        return None

    horarios = db.scalars(
        select(Horario)
        .options(
            joinedload(Horario.materia),
            joinedload(Horario.curso),
            joinedload(Horario.profesor).joinedload(Profesor.usuario),
        )
        .where(Horario.curso_id == curso_id, Horario.dia_semana == dia)
        .order_by(Horario.hora_inicio)
    ).all()

    actual = instante.replace(tzinfo=None)
    for horario in horarios:
        inicio = datetime.combine(instante.date(), horario.hora_inicio)
        fin = datetime.combine(instante.date(), horario.hora_fin)
        if inicio - MARGEN_QR <= actual <= fin + MARGEN_QR:
            return horario
    return None


def bloques_de_profesor(db: Session, profesor_id: int) -> list[Horario]:
    """Todos los bloques semanales que dicta el profesor."""
    return list(
        db.scalars(
            select(Horario)
            .options(
                joinedload(Horario.materia),
                joinedload(Horario.curso),
                joinedload(Horario.profesor).joinedload(Profesor.usuario),
            )
            .where(Horario.profesor_id == profesor_id)
            .order_by(ORDEN_DIAS, Horario.hora_inicio, Horario.curso_id)
        )
    )


def bloques_hoy_de_profesor(
    db: Session,
    profesor_id: int,
    *,
    momento: datetime | None = None,
) -> list[Horario]:
    """Bloques del día actual que dicta un profesor.

    Se filtra por ``dia_semana`` de la fecha del colegio: un bloque del lunes
    no debe aparecer en los registros del martes aunque la tabla de asistencia
    tenga filas con la fecha actual y ese ``horario_id`` (datos importados o
    históricos inconsistentes).
    """
    instante = momento or qr_service.ahora_local()
    dia = dia_semana_de(instante)
    if dia is None:
        return []

    return list(
        db.scalars(
            select(Horario)
            .options(
                joinedload(Horario.materia),
                joinedload(Horario.curso),
                joinedload(Horario.profesor).joinedload(Profesor.usuario),
            )
            .where(
                Horario.profesor_id == profesor_id,
                Horario.dia_semana == dia,
            )
            .order_by(Horario.curso_id, Horario.hora_inicio)
        )
    )


def bloques_vigentes_de_profesor(
    db: Session,
    profesor_id: int,
    *,
    momento: datetime | None = None,
) -> list[Horario]:
    """Bloques en curso que dicta un profesor.

    Se considera vigente el bloque del día actual cuyo rango contiene la hora
    (intervalo semiabierto ``hora_inicio <= ahora < hora_fin``).
    """
    instante = momento or qr_service.ahora_local()
    hora = instante.timetz().replace(tzinfo=None)
    return [
        horario
        for horario in bloques_hoy_de_profesor(db, profesor_id, momento=instante)
        if horario.hora_inicio <= hora < horario.hora_fin
    ]


def clase_actual_de_profesor(
    db: Session,
    profesor_id: int,
    *,
    momento: datetime | None = None,
) -> tuple[Horario | None, int, int]:
    """Bloque en curso del docente y sus contadores de asistencia.

    Devuelve ``(bloque, registrados, total_estudiantes)``. Si el profesor no
    tiene clase en este instante, ``bloque`` es ``None`` y los contadores 0.
    """
    instante = momento or qr_service.ahora_local()
    bloques = bloques_vigentes_de_profesor(db, profesor_id, momento=instante)
    if not bloques:
        return None, 0, 0

    bloque = bloques[0]
    total = (
        db.scalar(
            select(func.count())
            .select_from(Estudiante)
            .where(Estudiante.curso_id == bloque.curso_id)
        )
        or 0
    )
    registrados = (
        db.scalar(
            select(func.count())
            .select_from(Asistencia)
            .where(
                Asistencia.horario_id == bloque.id,
                Asistencia.fecha == instante.date(),
            )
        )
        or 0
    )
    return bloque, registrados, total


def _cargar(db: Session, horario_id: int) -> Horario | None:
    return db.scalar(
        select(Horario)
        .options(
            joinedload(Horario.materia),
            joinedload(Horario.curso),
            joinedload(Horario.profesor).joinedload(Profesor.usuario),
        )
        .where(Horario.id == horario_id)
    )


def listar(
    db: Session,
    *,
    curso_id: int | None = None,
    materia_id: int | None = None,
    profesor_id: int | None = None,
    dia_semana: DiaSemana | None = None,
    es_ultimo_bloque: bool | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Horario], int]:
    condiciones = []
    if curso_id is not None:
        condiciones.append(Horario.curso_id == curso_id)
    if materia_id is not None:
        condiciones.append(Horario.materia_id == materia_id)
    if profesor_id is not None:
        condiciones.append(Horario.profesor_id == profesor_id)
    if dia_semana is not None:
        condiciones.append(Horario.dia_semana == dia_semana.value)
    if es_ultimo_bloque is not None:
        condiciones.append(Horario.es_ultimo_bloque.is_(es_ultimo_bloque))

    total = db.scalar(select(func.count()).select_from(Horario).where(*condiciones)) or 0
    items = list(
        db.scalars(
            select(Horario)
            .options(
                joinedload(Horario.materia),
                joinedload(Horario.curso),
                joinedload(Horario.profesor).joinedload(Profesor.usuario),
            )
            .where(*condiciones)
            .order_by(Horario.curso_id, ORDEN_DIAS, Horario.hora_inicio)
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, horario_id: int) -> Horario:
    horario = _cargar(db, horario_id)
    if horario is None:
        raise NoEncontrado(f"No existe el horario {horario_id}")
    return horario


def _validar_curso_y_materia(db: Session, curso_id: int, materia_id: int) -> None:
    if db.get(Curso, curso_id) is None:
        raise NoEncontrado(f"No existe el curso {curso_id}")
    if db.get(Materia, materia_id) is None:
        raise NoEncontrado(f"No existe la materia {materia_id}")


def _buscar_solapamiento(
    db: Session,
    *,
    curso_id: int,
    dia_semana: str,
    hora_inicio: time,
    hora_fin: time,
    excluir_id: int | None = None,
) -> Horario | None:
    """Devuelve el primer bloque del mismo día que se cruza con el intervalo."""
    stmt = select(Horario).where(
        Horario.curso_id == curso_id,
        Horario.dia_semana == dia_semana,
        Horario.hora_inicio < hora_fin,
        Horario.hora_fin > hora_inicio,
    )
    if excluir_id is not None:
        stmt = stmt.where(Horario.id != excluir_id)
    return db.scalars(stmt.order_by(Horario.hora_inicio).limit(1)).first()


def _validar_solapamiento(
    db: Session,
    *,
    curso_id: int,
    dia_semana: str,
    hora_inicio: time,
    hora_fin: time,
    excluir_id: int | None = None,
) -> None:
    choque = _buscar_solapamiento(
        db,
        curso_id=curso_id,
        dia_semana=dia_semana,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        excluir_id=excluir_id,
    )
    if choque is not None:
        raise Conflicto(
            f"El horario del {dia_semana} se solapa con otro bloque del mismo curso "
            f"({choque.hora_inicio.strftime('%H:%M')}-{choque.hora_fin.strftime('%H:%M')})"
        )


def _obtener_profesor(db: Session, profesor_id: int) -> Profesor:
    profesor = db.scalar(
        select(Profesor)
        .options(joinedload(Profesor.usuario))
        .where(Profesor.usuario_id == profesor_id)
    )
    if profesor is None:
        raise NoEncontrado(f"No existe el profesor {profesor_id}")
    return profesor


def _nombre_profesor(profesor: Profesor) -> str:
    if profesor.usuario is None:
        return f"#{profesor.usuario_id}"
    return f"{profesor.usuario.nombres} {profesor.usuario.apellidos}".strip()


def _validar_choque_profesor(
    db: Session,
    *,
    profesor: Profesor,
    curso_id: int,
    dia_semana: str,
    hora_inicio: time,
    hora_fin: time,
    excluir_id: int | None = None,
) -> None:
    """Impide que un profesor dicte dos cursos en el mismo horario."""
    stmt = select(Horario.id).where(
        Horario.profesor_id == profesor.usuario_id,
        Horario.dia_semana == dia_semana,
        Horario.curso_id != curso_id,
        Horario.hora_inicio < hora_fin,
        Horario.hora_fin > hora_inicio,
    )
    if excluir_id is not None:
        stmt = stmt.where(Horario.id != excluir_id)
    if db.scalar(stmt.limit(1)) is not None:
        raise Conflicto(
            f"El profesor {_nombre_profesor(profesor)} ya tiene una clase asignada "
            "en otro curso a esta misma hora."
        )


def _validar_bloque_cierre(
    db: Session, *, curso_id: int, dia_semana: str, excluir_id: int | None = None
) -> None:
    stmt = select(Horario).where(
        Horario.curso_id == curso_id,
        Horario.dia_semana == dia_semana,
        Horario.es_ultimo_bloque.is_(True),
    )
    if excluir_id is not None:
        stmt = stmt.where(Horario.id != excluir_id)
    if db.scalars(stmt.limit(1)).first() is not None:
        raise Conflicto(
            f"El curso ya tiene un bloque de cierre el {dia_semana} "
            "(es_ultimo_bloque=true); desmárquelo antes de asignar otro"
        )


def crear(db: Session, datos: HorarioCreate) -> Horario:
    _validar_curso_y_materia(db, datos.curso_id, datos.materia_id)
    profesor = _obtener_profesor(db, datos.profesor_id)
    if datos.hora_fin <= datos.hora_inicio:
        raise ReglaNegocio("hora_fin debe ser posterior a hora_inicio")
    dia_semana = datos.dia_semana.value
    _validar_solapamiento(
        db,
        curso_id=datos.curso_id,
        dia_semana=dia_semana,
        hora_inicio=datos.hora_inicio,
        hora_fin=datos.hora_fin,
    )
    _validar_choque_profesor(
        db,
        profesor=profesor,
        curso_id=datos.curso_id,
        dia_semana=dia_semana,
        hora_inicio=datos.hora_inicio,
        hora_fin=datos.hora_fin,
    )
    if datos.es_ultimo_bloque:
        _validar_bloque_cierre(db, curso_id=datos.curso_id, dia_semana=dia_semana)

    horario = Horario(
        curso_id=datos.curso_id,
        materia_id=datos.materia_id,
        profesor_id=datos.profesor_id,
        dia_semana=dia_semana,
        hora_inicio=datos.hora_inicio,
        hora_fin=datos.hora_fin,
        es_ultimo_bloque=datos.es_ultimo_bloque,
    )
    db.add(horario)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Datos duplicados",
            referencia="El curso, la materia o el profesor indicado no existe",
        ) from exc
    return obtener(db, horario.id)


def actualizar(db: Session, horario_id: int, datos: HorarioUpdate) -> Horario:
    horario = obtener(db, horario_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }

    curso_id = cambios.get("curso_id", horario.curso_id)
    materia_id = cambios.get("materia_id", horario.materia_id)
    profesor_id = cambios.get("profesor_id", horario.profesor_id)
    dia_semana = cambios.get("dia_semana", horario.dia_semana)
    if isinstance(dia_semana, DiaSemana):
        dia_semana = dia_semana.value
    hora_inicio = cambios.get("hora_inicio", horario.hora_inicio)
    hora_fin = cambios.get("hora_fin", horario.hora_fin)
    es_ultimo = cambios.get("es_ultimo_bloque", horario.es_ultimo_bloque)

    _validar_curso_y_materia(db, curso_id, materia_id)
    profesor = _obtener_profesor(db, profesor_id)
    if hora_fin <= hora_inicio:
        raise ReglaNegocio("hora_fin debe ser posterior a hora_inicio")
    _validar_solapamiento(
        db,
        curso_id=curso_id,
        dia_semana=dia_semana,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        excluir_id=horario.id,
    )
    _validar_choque_profesor(
        db,
        profesor=profesor,
        curso_id=curso_id,
        dia_semana=dia_semana,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        excluir_id=horario.id,
    )
    if es_ultimo:
        _validar_bloque_cierre(
            db, curso_id=curso_id, dia_semana=dia_semana, excluir_id=horario.id
        )

    if "dia_semana" in cambios:
        cambios["dia_semana"] = dia_semana
    for campo, valor in cambios.items():
        setattr(horario, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Datos duplicados",
            referencia="El curso, la materia o el profesor indicado no existe",
        ) from exc
    return obtener(db, horario.id)


def eliminar(db: Session, horario_id: int) -> None:
    horario = obtener(db, horario_id)
    db.delete(horario)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El horario tiene asistencias registradas; no puede eliminarse"
        ) from exc
