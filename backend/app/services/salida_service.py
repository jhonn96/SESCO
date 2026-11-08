"""Registro manual de salidas de estudiantes.

Cubre la salida individual (temprana o tardía) y la salida masiva del curso
por actividades extracurriculares. Solo se puede registrar la salida de un
estudiante que ya tiene ingreso y cuya salida aún está pendiente.

Cada salida encola un aviso al tutor principal confirmado y deja constancia
en la bitácora. El cierre automático de jornada sigue siendo el respaldo para
los estudiantes que no escanean su salida.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core import audit
from app.core.exceptions import Conflicto, NoEncontrado, Prohibido, ReglaNegocio
from app.models import (
    Asistencia,
    Curso,
    Estudiante,
    Horario,
    Notificacion,
    ProfesorCurso,
    Tutoria,
)
from app.services import qr_service
from app.services.qr_service import ZONA_HORARIA

#: Tipo de notificación que recibe el tutor al registrar una salida.
TIPO_NOTIFICACION_SALIDA = "salida"

#: Tolerancia para no rechazar una hora elegida al minuto en curso.
TOLERANCIA_FUTURO = timedelta(minutes=1)


@dataclass(frozen=True)
class ResultadoSalida:
    asistencia: Asistencia
    notificacion_encolada: bool


@dataclass(frozen=True)
class ResultadoSalidaMasiva:
    curso_id: int
    fecha: date
    hora_salida: datetime
    estudiantes: int
    salidas_registradas: int
    notificaciones_encoladas: int


@dataclass(frozen=True)
class ResultadoSalidaProgramada:
    fecha: date
    hora_salida: datetime
    cursos: int
    curso_ids: list[int]
    estudiantes: int
    salidas_registradas: int
    notificaciones_encoladas: int


def _cargar_asistencia(
    db: Session, asistencia_id: int, *, bloquear: bool = False
) -> Asistencia:
    consulta = (
        select(Asistencia)
        .options(
            selectinload(Asistencia.estudiante).selectinload(Estudiante.usuario),
            selectinload(Asistencia.horario),
        )
        .where(Asistencia.id == asistencia_id)
    )
    if bloquear:
        consulta = consulta.with_for_update()
    asistencia = db.scalar(consulta)
    if asistencia is None:
        raise NoEncontrado(f"No existe la asistencia {asistencia_id}")
    return asistencia


def _nombre_estudiante(estudiante: Estudiante) -> str:
    usuario = estudiante.usuario
    if usuario is None:
        return f"#{estudiante.usuario_id}"
    return f"{usuario.nombres} {usuario.apellidos}".strip()


def _resolver_cursos_objetivo(
    db: Session,
    *,
    curso_id: int | None,
    curso_ids: list[int] | None,
    todos: bool,
) -> list[int]:
    """Devuelve los IDs de curso a procesar, validando que existan."""
    if todos:
        return list(db.scalars(select(Curso.id).order_by(Curso.id)))

    if curso_ids:
        objetivos = sorted(set(curso_ids))
    elif curso_id is not None:
        objetivos = [curso_id]
    else:
        raise ReglaNegocio("Indica al menos un curso")

    existentes = set(
        db.scalars(select(Curso.id).where(Curso.id.in_(objetivos)))
    )
    faltantes = [
        identificador
        for identificador in objetivos
        if identificador not in existentes
    ]
    if faltantes:
        raise NoEncontrado(
            "No existe(n) el/los curso(s) "
            + ", ".join(str(identificador) for identificador in faltantes)
        )
    return objetivos


def _validar_acceso_profesor(
    db: Session, profesor_id: int, curso_id: int
) -> None:
    """Un docente solo opera salidas de cursos que tiene asignados o dicta."""
    if db.get(ProfesorCurso, (profesor_id, curso_id)) is not None:
        return
    imparte = db.scalar(
        select(Horario.id)
        .where(
            Horario.profesor_id == profesor_id,
            Horario.curso_id == curso_id,
        )
        .limit(1)
    )
    if imparte is None:
        raise Prohibido("No tienes acceso a los estudiantes de este curso")


def _resolver_hora_salida(
    fecha: date, hora: time | None, ahora: datetime
) -> datetime:
    if hora is None:
        return ahora

    salida = datetime.combine(fecha, hora, tzinfo=ZONA_HORARIA)
    if salida > ahora + TOLERANCIA_FUTURO:
        raise ReglaNegocio(
            "La hora de salida no puede ser posterior a la hora actual"
        )
    return salida


def _validar_orden(registro: Asistencia, salida: datetime) -> None:
    if registro.hora_ingreso is not None and salida < registro.hora_ingreso:
        raise ReglaNegocio(
            "La hora de salida no puede ser anterior al ingreso de "
            f"{_nombre_estudiante(registro.estudiante)}"
        )


def _tutor_principal(db: Session, estudiante_id: int) -> int | None:
    return db.scalar(
        select(Tutoria.tutor_id)
        .where(
            Tutoria.estudiante_id == estudiante_id,
            Tutoria.es_principal.is_(True),
            Tutoria.estado == "confirmada",
        )
        .order_by(Tutoria.tutor_id)
        .limit(1)
    )


def _encolar_notificacion(
    db: Session,
    *,
    asistencia: Asistencia,
    salida: datetime,
    motivo: str,
) -> bool:
    tutor_id = _tutor_principal(db, asistencia.estudiante_id)
    if tutor_id is None:
        return False

    hora_txt = salida.strftime("%H:%M")
    mensaje = (
        f"Su hijo(a) {_nombre_estudiante(asistencia.estudiante)} ha salido "
        f"del colegio a las {hora_txt} ({motivo})."
    )
    db.add(
        Notificacion(
            usuario_id=tutor_id,
            asistencia_id=asistencia.id,
            tipo=TIPO_NOTIFICACION_SALIDA,
            canal="app",
            mensaje=mensaje,
            intentos=0,
        )
    )
    return True


def registrar_salida_manual(
    db: Session,
    *,
    asistencia_id: int,
    hora_salida: time | None = None,
    profesor_id: int | None = None,
    es_profesor: bool = False,
    ip: str | None = None,
) -> ResultadoSalida:
    """Registra la salida de un único registro de asistencia."""
    ahora = qr_service.ahora_local()
    asistencia = _cargar_asistencia(db, asistencia_id, bloquear=True)

    if asistencia.fecha != ahora.date():
        raise ReglaNegocio(
            "Solo puedes registrar la salida de asistencias del día de hoy"
        )
    if asistencia.hora_ingreso is None:
        raise ReglaNegocio(
            "El estudiante no tiene ingreso registrado; no se puede registrar "
            "una salida"
        )
    if asistencia.hora_salida is not None:
        raise Conflicto("La salida de este registro ya fue registrada")

    horario = asistencia.horario
    if horario is None:
        raise NoEncontrado("El registro no tiene un bloque horario asociado")
    if es_profesor:
        if profesor_id is None:
            raise Prohibido("No se pudo identificar al profesor autenticado")
        _validar_acceso_profesor(db, profesor_id, horario.curso_id)

    salida = _resolver_hora_salida(asistencia.fecha, hora_salida, ahora)
    _validar_orden(asistencia, salida)
    asistencia.hora_salida = salida

    notificacion = _encolar_notificacion(
        db,
        asistencia=asistencia,
        salida=salida,
        motivo="registro manual",
    )
    audit.registrar(
        db,
        usuario_id=profesor_id,
        accion="REGISTRAR_SALIDA",
        entidad="asistencia",
        entidad_id=asistencia.id,
        detalle={
            "hora_salida": salida.isoformat(),
            "origen": "manual",
        },
        ip=ip,
    )
    db.commit()
    return ResultadoSalida(
        asistencia=_cargar_asistencia(db, asistencia_id),
        notificacion_encolada=notificacion,
    )


def registrar_salida_masiva(
    db: Session,
    *,
    curso_id: int,
    hora_salida: time | None = None,
    motivo: str | None = None,
    profesor_id: int | None = None,
    es_profesor: bool = False,
    ip: str | None = None,
) -> ResultadoSalidaMasiva:
    """Registra la misma hora de salida para todos los presentes del curso.

    ``motivo`` se usa cuando la salida es especial (salida programada) y se
    incluye en el aviso que reciben los tutores.
    """
    ahora = qr_service.ahora_local()
    fecha = ahora.date()

    curso = db.get(Curso, curso_id)
    if curso is None:
        raise NoEncontrado(f"No existe el curso {curso_id}")
    if es_profesor:
        if profesor_id is None:
            raise Prohibido("No se pudo identificar al profesor autenticado")
        _validar_acceso_profesor(db, profesor_id, curso_id)

    salida = _resolver_hora_salida(fecha, hora_salida, ahora)

    registros = list(
        db.scalars(
            select(Asistencia)
            .options(
                selectinload(Asistencia.estudiante).selectinload(
                    Estudiante.usuario
                )
            )
            .where(
                Asistencia.fecha == fecha,
                Asistencia.hora_ingreso.is_not(None),
                Asistencia.hora_salida.is_(None),
                Asistencia.horario_id.in_(
                    select(Horario.id).where(Horario.curso_id == curso_id)
                ),
            )
            .order_by(Asistencia.estudiante_id, Asistencia.id)
            .with_for_update(skip_locked=True)
        )
    )

    if not registros:
        return ResultadoSalidaMasiva(
            curso_id=curso_id,
            fecha=fecha,
            hora_salida=salida,
            estudiantes=0,
            salidas_registradas=0,
            notificaciones_encoladas=0,
        )

    for registro in registros:
        _validar_orden(registro, salida)

    por_estudiante: dict[int, list[Asistencia]] = {}
    for registro in registros:
        por_estudiante.setdefault(registro.estudiante_id, []).append(registro)

    notificaciones = 0
    for registros_estudiante in por_estudiante.values():
        for registro in registros_estudiante:
            registro.hora_salida = salida
        if _encolar_notificacion(
            db,
            asistencia=registros_estudiante[0],
            salida=salida,
            motivo=motivo or "salida del curso",
        ):
            notificaciones += 1

    audit.registrar(
        db,
        usuario_id=profesor_id,
        accion="REGISTRAR_SALIDA_MASIVA",
        entidad="curso",
        entidad_id=curso_id,
        detalle={
            "fecha": fecha.isoformat(),
            "hora_salida": salida.isoformat(),
            "motivo": motivo or "salida del curso",
            "estudiantes": len(por_estudiante),
            "salidas_registradas": len(registros),
            "notificaciones": notificaciones,
        },
        ip=ip,
    )
    db.commit()
    return ResultadoSalidaMasiva(
        curso_id=curso_id,
        fecha=fecha,
        hora_salida=salida,
        estudiantes=len(por_estudiante),
        salidas_registradas=len(registros),
        notificaciones_encoladas=notificaciones,
    )


def registrar_salida_programada(
    db: Session,
    *,
    curso_id: int | None = None,
    curso_ids: list[int] | None = None,
    todos: bool = False,
    hora_salida: time | None = None,
    motivo: str,
    profesor_id: int | None = None,
    ip: str | None = None,
) -> ResultadoSalidaProgramada:
    """Registra la misma salida especial en uno, varios o todos los cursos.

    Solo se actualizan los estudiantes que hoy tienen ingreso y aún no tienen
    salida. Cada estudiante recibe un único aviso para su tutor principal,
    incluso si tiene varios bloques registrados en el día.
    """
    ahora = qr_service.ahora_local()
    fecha = ahora.date()

    objetivos = _resolver_cursos_objetivo(
        db, curso_id=curso_id, curso_ids=curso_ids, todos=todos
    )
    salida = _resolver_hora_salida(fecha, hora_salida, ahora)

    if not objetivos:
        return ResultadoSalidaProgramada(
            fecha=fecha,
            hora_salida=salida,
            cursos=0,
            curso_ids=[],
            estudiantes=0,
            salidas_registradas=0,
            notificaciones_encoladas=0,
        )

    registros = list(
        db.scalars(
            select(Asistencia)
            .options(
                selectinload(Asistencia.estudiante).selectinload(
                    Estudiante.usuario
                ),
                selectinload(Asistencia.horario),
            )
            .where(
                Asistencia.fecha == fecha,
                Asistencia.hora_ingreso.is_not(None),
                Asistencia.hora_salida.is_(None),
                Asistencia.horario_id.in_(
                    select(Horario.id).where(
                        Horario.curso_id.in_(objetivos)
                    )
                ),
            )
            .order_by(Asistencia.estudiante_id, Asistencia.id)
            .with_for_update(skip_locked=True)
        )
    )

    if not registros:
        return ResultadoSalidaProgramada(
            fecha=fecha,
            hora_salida=salida,
            cursos=0,
            curso_ids=[],
            estudiantes=0,
            salidas_registradas=0,
            notificaciones_encoladas=0,
        )

    for registro in registros:
        _validar_orden(registro, salida)

    por_estudiante: dict[int, list[Asistencia]] = {}
    for registro in registros:
        por_estudiante.setdefault(registro.estudiante_id, []).append(registro)

    notificaciones = 0
    for registros_estudiante in por_estudiante.values():
        for registro in registros_estudiante:
            registro.hora_salida = salida
        if _encolar_notificacion(
            db,
            asistencia=registros_estudiante[0],
            salida=salida,
            motivo=motivo,
        ):
            notificaciones += 1

    cursos_afectados = sorted(
        {
            registro.horario.curso_id
            for registro in registros
            if registro.horario is not None
        }
    )

    audit.registrar(
        db,
        usuario_id=profesor_id,
        accion="REGISTRAR_SALIDA_PROGRAMADA",
        entidad="colegio" if todos else "curso",
        entidad_id=curso_id if not todos and curso_id is not None else None,
        detalle={
            "fecha": fecha.isoformat(),
            "hora_salida": salida.isoformat(),
            "motivo": motivo,
            "todos": todos,
            "curso_ids": cursos_afectados,
            "estudiantes": len(por_estudiante),
            "salidas_registradas": len(registros),
            "notificaciones": notificaciones,
        },
        ip=ip,
    )
    db.commit()
    return ResultadoSalidaProgramada(
        fecha=fecha,
        hora_salida=salida,
        cursos=len(cursos_afectados),
        curso_ids=cursos_afectados,
        estudiantes=len(por_estudiante),
        salidas_registradas=len(registros),
        notificaciones_encoladas=notificaciones,
    )
