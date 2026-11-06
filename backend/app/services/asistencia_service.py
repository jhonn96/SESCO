"""Capa de negocio de asistencia.

Reglas implementadas
--------------------
- **Clasificación** (``parametro_asistencia``): ``presente`` hasta
  ``tolerancia_min``, ``tardanza`` hasta ``limite_falta_min`` y ``falta``
  después. Los minutos se redondean hacia arriba para que 10 min y 1 s ya
  cuenten como tardanza.
- **QR dinámico**: se valida el TOTP con una ventana de tolerancia y se impide
  el reuso del mismo código mediante ``qr_uso`` (PK ``estudiante + ventana``).
- **Pertenencia al curso**: el bloque debe ser del curso del estudiante.
- **Registro manual del docente**: un profesor solo puede registrar a
  estudiantes de sus cursos y durante un bloque vigente de ese curso.
- **Cierre de bloque**: al terminar la jornada, quien no tenga registro queda
  como ``falta`` (regla "sin registro de entrada al final del bloque").
- **Notificaciones**: toda falta o tardanza encola un aviso al tutor principal
  confirmado (tabla ``notificacion``).
- **Auditoría**: cada registro deja una fila en ``bitacora``.
"""

from __future__ import annotations

import calendar
import math
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core import audit
from app.core.exceptions import (
    Conflicto,
    NoEncontrado,
    Prohibido,
    ReglaNegocio,
    traducir_integridad,
)
from app.core.orden import orden_persona
from app.models import (
    Asistencia,
    Curso,
    Estudiante,
    Horario,
    Materia,
    Notificacion,
    ParametroAsistencia,
    Profesor,
    ProfesorCurso,
    QrUso,
    Tutoria,
    Usuario,
)
from app.schemas.asistencia import AsistenciaManualCreate
from app.schemas.enums import EstadoAsistencia
from app.schemas.lista_asistencia import (
    DiaListaAsistencia,
    EstudianteListaAsistencia,
    ListaAsistenciaResponse,
)
from app.services import horario_service, qr_service
from app.services.qr_service import ZONA_HORARIA


@dataclass(frozen=True)
class ResultadoRegistro:
    asistencia: Asistencia
    notificacion_encolada: bool


@dataclass(frozen=True)
class ResultadoCierre:
    horario_id: int
    fecha: date
    faltas_registradas: int
    notificaciones_encoladas: int


@dataclass(frozen=True)
class ResultadoQr:
    """Código vigente del estudiante junto con la clase que lo habilita."""

    codigo: qr_service.CodigoQR
    materia: str | None
    profesor: str | None
    hora_inicio: time | None
    hora_fin: time | None


# --------------------------------------------------------------------------
# Consultas y validaciones comunes
# --------------------------------------------------------------------------


def _parametros(db: Session) -> ParametroAsistencia:
    parametros = db.get(ParametroAsistencia, 1)
    if parametros is None:
        raise ReglaNegocio(
            "No existe la configuración de asistencia (parametro_asistencia id=1)"
        )
    return parametros


def _cargar_estudiante(db: Session, estudiante_id: int) -> Estudiante:
    estudiante = db.scalar(
        select(Estudiante)
        .options(joinedload(Estudiante.usuario))
        .where(Estudiante.usuario_id == estudiante_id)
    )
    if estudiante is None:
        raise NoEncontrado(f"No existe el estudiante {estudiante_id}")
    return estudiante


def _cargar_horario(db: Session, horario_id: int) -> Horario:
    horario = db.scalar(
        select(Horario)
        .options(joinedload(Horario.materia), joinedload(Horario.curso))
        .where(Horario.id == horario_id)
    )
    if horario is None:
        raise NoEncontrado(f"No existe el horario {horario_id}")
    return horario


def _cargar_asistencia(db: Session, asistencia_id: int) -> Asistencia:
    asistencia = db.scalar(
        select(Asistencia)
        .options(
            joinedload(Asistencia.estudiante).joinedload(Estudiante.usuario),
            joinedload(Asistencia.horario).joinedload(Horario.materia),
            joinedload(Asistencia.horario).joinedload(Horario.curso),
            joinedload(Asistencia.horario)
            .joinedload(Horario.profesor)
            .joinedload(Profesor.usuario),
        )
        .where(Asistencia.id == asistencia_id)
    )
    if asistencia is None:
        raise NoEncontrado(f"No existe la asistencia {asistencia_id}")
    return asistencia


def _validar_curso(estudiante: Estudiante, horario: Horario) -> None:
    if horario.curso_id != estudiante.curso_id:
        raise ReglaNegocio(
            "El bloque horario no pertenece al curso del estudiante "
            f"(curso del estudiante: {estudiante.curso_id}, curso del bloque: {horario.curso_id})"
        )


def _resolver_horario(
    db: Session,
    estudiante: Estudiante,
    horario_id: int | None,
    momento: datetime,
) -> Horario:
    """Devuelve el bloque indicado o deduce el vigente del curso.

    Prioridad al deducir: bloque en curso → último bloque ya comenzado →
    primer bloque de la jornada.
    """
    if horario_id is not None:
        horario = _cargar_horario(db, horario_id)
        _validar_curso(estudiante, horario)
        return horario

    horarios = list(
        db.scalars(
            select(Horario)
            .options(joinedload(Horario.materia), joinedload(Horario.curso))
            .where(Horario.curso_id == estudiante.curso_id)
            .order_by(Horario.hora_inicio)
        )
    )
    if not horarios:
        raise Conflicto("El curso del estudiante no tiene horarios configurados")

    hora = momento.timetz().replace(tzinfo=None)
    for horario in horarios:
        if horario.hora_inicio <= hora <= horario.hora_fin:
            return horario
    comenzados = [h for h in horarios if h.hora_inicio <= hora]
    return comenzados[-1] if comenzados else horarios[0]


def _bloque_vigente_docente(
    db: Session,
    profesor_id: int,
    estudiante: Estudiante,
    *,
    fecha: date,
    momento: datetime,
    horario_id: int | None = None,
) -> Horario:
    """Bloque en curso del curso del estudiante para el registro de un profesor.

    Un profesor solo registra a estudiantes del bloque que tiene asignado y
    que está en clase en ese momento.
    """
    if fecha != momento.date():
        raise ReglaNegocio(
            "Solo puedes registrar la asistencia del día de hoy; "
            "para fechas anteriores solicítalo al director."
        )

    vigentes = horario_service.bloques_vigentes_de_profesor(
        db, profesor_id, momento=momento
    )
    actual = next(
        (horario for horario in vigentes if horario.curso_id == estudiante.curso_id),
        None,
    )
    if actual is not None:
        if horario_id is not None and horario_id != actual.id:
            raise ReglaNegocio(
                "Solo puedes registrar en el bloque que está en curso."
            )
        return actual

    if vigentes:
        raise ReglaNegocio(
            "En este momento tienes clase en otro de tus cursos. "
            "Solo puedes registrar estudiantes del curso que está en clase."
        )
    raise ReglaNegocio(
        "No hay un bloque de clase vigente en este momento. "
        "El registro manual solo está disponible durante el horario de clases."
    )


def _validar_disponible(
    db: Session, estudiante_id: int, fecha: date, horario_id: int
) -> None:
    existente = db.scalar(
        select(Asistencia.id).where(
            Asistencia.estudiante_id == estudiante_id,
            Asistencia.fecha == fecha,
            Asistencia.horario_id == horario_id,
        )
    )
    if existente is not None:
        raise Conflicto(
            "El estudiante ya tiene asistencia registrada para ese bloque y fecha"
        )


def clasificar(
    minutos_retraso: int, tolerancia_min: int, limite_falta_min: int
) -> EstadoAsistencia:
    """Aplica los umbrales configurados en ``parametro_asistencia``."""
    if minutos_retraso <= tolerancia_min:
        return EstadoAsistencia.PRESENTE
    if minutos_retraso <= limite_falta_min:
        return EstadoAsistencia.TARDANZA
    return EstadoAsistencia.FALTA


def _minutos_desde(inicio: datetime, ingreso: datetime) -> int:
    # Redondeo hacia arriba: 10 min 01 s ya es tardanza.
    segundos = (ingreso - inicio).total_seconds()
    if segundos <= 0:
        return 0
    return math.ceil(segundos / 60)


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
    db: Session, asistencia: Asistencia, horario: Horario, estudiante: Estudiante
) -> bool:
    """Encola un aviso al tutor principal si hubo falta o tardanza."""
    if asistencia.estado not in (
        EstadoAsistencia.FALTA.value,
        EstadoAsistencia.TARDANZA.value,
    ):
        return False

    tutor_id = _tutor_principal(db, asistencia.estudiante_id)
    if tutor_id is None:
        return False

    nombre = f"{estudiante.usuario.nombres} {estudiante.usuario.apellidos}".strip()
    materia = horario.materia.nombre if horario.materia else "el bloque"
    fecha_txt = asistencia.fecha.strftime("%d/%m/%Y")
    if asistencia.estado == EstadoAsistencia.TARDANZA.value:
        mensaje = (
            f"El estudiante {nombre} ingresó con {asistencia.minutos_retraso} minutos "
            f"de retraso a {materia} el {fecha_txt}. Puede enviar su justificación "
            "desde SESCO el mismo día."
        )
    else:
        mensaje = (
            f"El estudiante {nombre} no asistió a {materia} el {fecha_txt}. "
            "Puede enviar su justificación desde SESCO el mismo día."
        )

    db.add(
        Notificacion(
            usuario_id=tutor_id,
            asistencia_id=asistencia.id,
            tipo=asistencia.estado,
            canal="app",
            mensaje=mensaje,
            intentos=0,
        )
    )
    return True


# --------------------------------------------------------------------------
# QR del estudiante
# --------------------------------------------------------------------------


def _docente_del_bloque(db: Session, bloque: Horario) -> str | None:
    """Nombre del profesor que dicta el bloque; respaldo: asesor del curso."""
    if bloque.profesor is not None and bloque.profesor.usuario is not None:
        usuario = bloque.profesor.usuario
        return f"{usuario.nombres} {usuario.apellidos}".strip()
    return _docente_del_curso(db, bloque.curso_id)


def _docente_del_curso(db: Session, curso_id: int) -> str | None:
    """Nombre del profesor asignado al curso (prioriza al asesor)."""
    fila = db.execute(
        select(Usuario.nombres, Usuario.apellidos)
        .join(Profesor, Profesor.usuario_id == Usuario.id)
        .join(ProfesorCurso, ProfesorCurso.profesor_id == Profesor.usuario_id)
        .where(ProfesorCurso.curso_id == curso_id)
        .order_by(ProfesorCurso.es_asesor.desc(), ProfesorCurso.profesor_id)
        .limit(1)
    ).first()
    if fila is None:
        return None
    return f"{fila.nombres} {fila.apellidos}".strip()


def generar_qr(
    db: Session,
    estudiante_id: int,
    *,
    momento: datetime | None = None,
) -> ResultadoQr:
    """Código TOTP vigente del estudiante autenticado.

    Solo se entrega durante un bloque del curso del estudiante (con 10
    minutos de tolerancia antes del inicio y después del fin). Fuera de ese
    rango se responde 403: la asistencia solo se registra en clase.

    La respuesta incluye la materia y el docente del bloque vigente para que
    el panel del estudiante muestre su clase actual.
    """
    estudiante = _cargar_estudiante(db, estudiante_id)
    parametros = _parametros(db)
    ahora = momento or qr_service.ahora_local()

    bloque = horario_service.bloque_para_qr(
        db, estudiante.curso_id, momento=ahora
    )
    if bloque is None:
        raise Prohibido("No tienes una clase en curso para registrar asistencia")

    codigo = qr_service.generar_para_estudiante(
        estudiante_id=estudiante.usuario_id,
        secreto=estudiante.secreto_qr,
        ventana_seg=parametros.qr_ventana_seg,
        momento=ahora,
    )
    return ResultadoQr(
        codigo=codigo,
        materia=bloque.materia.nombre if bloque.materia else None,
        profesor=_docente_del_bloque(db, bloque),
        hora_inicio=bloque.hora_inicio,
        hora_fin=bloque.hora_fin,
    )


# --------------------------------------------------------------------------
# Escaneo
# --------------------------------------------------------------------------


def registrar_escaneo(
    db: Session,
    *,
    contenido: str,
    profesor_id: int,
    horario_id: int | None = None,
    ip: str | None = None,
) -> ResultadoRegistro:
    estudiante_id, codigo = qr_service.parsear_contenido(contenido)
    estudiante = _cargar_estudiante(db, estudiante_id)
    parametros = _parametros(db)
    ahora = qr_service.ahora_local()
    horario = _resolver_horario(db, estudiante, horario_id, ahora)

    ventana = qr_service.validar_codigo(
        estudiante.secreto_qr,
        codigo,
        parametros.qr_ventana_seg,
        momento=ahora,
    )
    if ventana is None:
        raise ReglaNegocio("Código QR inválido o expirado")

    fecha = ahora.date()

    # Anti-replay: la PK (estudiante_id, ventana) impide reusar el mismo código.
    if db.get(QrUso, (estudiante.usuario_id, ventana)) is not None:
        raise Conflicto("Este código QR ya fue utilizado; espere al siguiente código")

    _validar_disponible(db, estudiante.usuario_id, fecha, horario.id)

    db.add(QrUso(estudiante_id=estudiante.usuario_id, ventana=ventana, lector_id=profesor_id))
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "pgcode", None) == "23505":
            raise Conflicto(
                "Este código QR ya fue utilizado; espere al siguiente código"
            ) from exc
        raise traducir_integridad(
            exc,
            duplicado="Este código QR ya fue utilizado",
            referencia="El estudiante indicado en el QR no existe",
        ) from exc

    inicio = datetime.combine(fecha, horario.hora_inicio, tzinfo=ZONA_HORARIA)
    minutos = _minutos_desde(inicio, ahora)
    estado = clasificar(minutos, parametros.tolerancia_min, parametros.limite_falta_min)

    asistencia = Asistencia(
        estudiante_id=estudiante.usuario_id,
        horario_id=horario.id,
        fecha=fecha,
        hora_ingreso=ahora,
        minutos_retraso=minutos,
        estado=estado.value,
        origen="qr",
        registrado_por=profesor_id,
    )
    db.add(asistencia)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "pgcode", None) == "23505":
            raise Conflicto(
                "El estudiante ya tiene asistencia registrada para ese bloque y fecha"
            ) from exc
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un registro de asistencia para ese bloque",
            referencia="El horario o el estudiante indicado no existe",
        ) from exc

    encolada = _encolar_notificacion(db, asistencia, horario, estudiante)

    audit.registrar(
        db,
        usuario_id=profesor_id,
        accion="REGISTRAR_ASISTENCIA",
        entidad="asistencia",
        entidad_id=asistencia.id,
        detalle={
            "origen": "qr",
            "estado": asistencia.estado,
            "minutos_retraso": minutos,
            "horario_id": horario.id,
            "ventana": ventana,
        },
        ip=ip,
    )
    db.commit()
    return ResultadoRegistro(_cargar_asistencia(db, asistencia.id), encolada)


# --------------------------------------------------------------------------
# Registro manual
# --------------------------------------------------------------------------


def registrar_manual(
    db: Session,
    *,
    datos: AsistenciaManualCreate,
    profesor_id: int,
    es_profesor: bool = False,
    ip: str | None = None,
) -> ResultadoRegistro:
    estudiante = _cargar_estudiante(db, datos.estudiante_id)
    parametros = _parametros(db)
    ahora = qr_service.ahora_local()

    fecha = datos.fecha or ahora.date()
    if fecha > ahora.date():
        raise ReglaNegocio("No se puede registrar asistencia en una fecha futura")

    if es_profesor:
        horario = _bloque_vigente_docente(
            db,
            profesor_id,
            estudiante,
            fecha=fecha,
            momento=ahora,
            horario_id=datos.horario_id,
        )
    else:
        horario = _resolver_horario(db, estudiante, datos.horario_id, ahora)

    inicio = datetime.combine(fecha, horario.hora_inicio, tzinfo=ZONA_HORARIA)
    if datos.hora_ingreso is not None:
        ingreso = datos.hora_ingreso
        if ingreso.tzinfo is None:
            ingreso = ingreso.replace(tzinfo=ZONA_HORARIA)
        else:
            ingreso = ingreso.astimezone(ZONA_HORARIA)
        if ingreso.date() != fecha:
            raise ReglaNegocio(
                "La hora de ingreso debe corresponder a la fecha indicada"
            )
    elif datos.estado == EstadoAsistencia.FALTA:
        ingreso = None
    elif fecha == ahora.date():
        ingreso = ahora
    else:
        ingreso = inicio

    if datos.estado is None:
        minutos = (
            datos.minutos_retraso
            if datos.minutos_retraso is not None
            else _minutos_desde(inicio, ingreso or inicio)
        )
        estado = clasificar(minutos, parametros.tolerancia_min, parametros.limite_falta_min)
    else:
        estado = datos.estado
        if datos.minutos_retraso is not None:
            minutos = datos.minutos_retraso
        elif ingreso is None:
            minutos = 0
        else:
            minutos = _minutos_desde(inicio, ingreso)

    _validar_disponible(db, estudiante.usuario_id, fecha, horario.id)

    asistencia = Asistencia(
        estudiante_id=estudiante.usuario_id,
        horario_id=horario.id,
        fecha=fecha,
        hora_ingreso=ingreso,
        minutos_retraso=minutos,
        estado=estado.value,
        origen="manual",
        registrado_por=profesor_id,
    )
    db.add(asistencia)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="El estudiante ya tiene asistencia registrada para ese bloque y fecha",
            referencia="El horario o el estudiante indicado no existe",
        ) from exc

    encolada = _encolar_notificacion(db, asistencia, horario, estudiante)

    audit.registrar(
        db,
        usuario_id=profesor_id,
        accion="REGISTRAR_ASISTENCIA",
        entidad="asistencia",
        entidad_id=asistencia.id,
        detalle={
            "origen": "manual",
            "estado": asistencia.estado,
            "minutos_retraso": minutos,
            "horario_id": horario.id,
        },
        ip=ip,
    )
    db.commit()
    return ResultadoRegistro(_cargar_asistencia(db, asistencia.id), encolada)


# --------------------------------------------------------------------------
# Cierre de bloque (ausentes al finalizar la jornada)
# --------------------------------------------------------------------------


def cerrar_bloque(
    db: Session,
    *,
    horario_id: int,
    profesor_id: int,
    fecha: date | None = None,
    es_profesor: bool = False,
    ip: str | None = None,
) -> ResultadoCierre:
    horario = _cargar_horario(db, horario_id)
    ahora = qr_service.ahora_local()
    fecha = fecha or ahora.date()
    if fecha > ahora.date():
        raise ReglaNegocio("No se puede cerrar un bloque en una fecha futura")

    if es_profesor and horario.profesor_id != profesor_id:
        raise Prohibido(
            "Ese bloque no está asignado a tu horario personal."
        )

    inicio = datetime.combine(fecha, horario.hora_inicio, tzinfo=ZONA_HORARIA)
    if inicio > ahora:
        raise ReglaNegocio(
            "El bloque aún no ha comenzado; no se puede cerrar la asistencia"
        )

    estudiantes = list(
        db.scalars(
            select(Estudiante)
            .options(joinedload(Estudiante.usuario))
            .where(Estudiante.curso_id == horario.curso_id)
            .order_by(Estudiante.usuario_id)
        )
    )
    con_registro = set(
        db.scalars(
            select(Asistencia.estudiante_id).where(
                Asistencia.horario_id == horario.id,
                Asistencia.fecha == fecha,
            )
        )
    )

    faltas = 0
    notificaciones = 0
    for estudiante in estudiantes:
        if estudiante.usuario_id in con_registro:
            continue
        asistencia = Asistencia(
            estudiante_id=estudiante.usuario_id,
            horario_id=horario.id,
            fecha=fecha,
            hora_ingreso=None,
            minutos_retraso=0,
            estado=EstadoAsistencia.FALTA.value,
            origen="manual",
            registrado_por=profesor_id,
        )
        db.add(asistencia)
        db.flush()
        faltas += 1
        if _encolar_notificacion(db, asistencia, horario, estudiante):
            notificaciones += 1

    audit.registrar(
        db,
        usuario_id=profesor_id,
        accion="CERRAR_BLOQUE",
        entidad="horario",
        entidad_id=horario.id,
        detalle={
            "fecha": fecha.isoformat(),
            "faltas_registradas": faltas,
            "notificaciones": notificaciones,
        },
        ip=ip,
    )
    db.commit()
    return ResultadoCierre(
        horario_id=horario.id,
        fecha=fecha,
        faltas_registradas=faltas,
        notificaciones_encoladas=notificaciones,
    )


# --------------------------------------------------------------------------
# Consultas
# --------------------------------------------------------------------------


def _condiciones(
    *,
    fecha: date | None,
    curso_id: int | None,
    estudiante_id: int | None,
    horario_id: int | None,
    estado: EstadoAsistencia | None,
) -> list[Any]:
    condiciones: list[Any] = []
    if fecha is not None:
        condiciones.append(Asistencia.fecha == fecha)
    if curso_id is not None:
        condiciones.append(Horario.curso_id == curso_id)
    if estudiante_id is not None:
        condiciones.append(Asistencia.estudiante_id == estudiante_id)
    if horario_id is not None:
        condiciones.append(Asistencia.horario_id == horario_id)
    if estado is not None:
        condiciones.append(Asistencia.estado == estado.value)
    return condiciones


def listar(
    db: Session,
    *,
    fecha: date | None = None,
    curso_id: int | None = None,
    estudiante_id: int | None = None,
    horario_id: int | None = None,
    estado: EstadoAsistencia | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Asistencia], int]:
    condiciones = _condiciones(
        fecha=fecha,
        curso_id=curso_id,
        estudiante_id=estudiante_id,
        horario_id=horario_id,
        estado=estado,
    )
    total = (
        db.scalar(
            select(func.count())
            .select_from(Asistencia)
            .join(Horario, Horario.id == Asistencia.horario_id)
            .where(*condiciones)
        )
        or 0
    )
    items = list(
        db.scalars(
            select(Asistencia)
            .join(Horario, Horario.id == Asistencia.horario_id)
            .options(
                joinedload(Asistencia.estudiante).joinedload(Estudiante.usuario),
                joinedload(Asistencia.horario).joinedload(Horario.materia),
                joinedload(Asistencia.horario).joinedload(Horario.curso),
                joinedload(Asistencia.horario)
                .joinedload(Horario.profesor)
                .joinedload(Profesor.usuario),
            )
            .where(*condiciones)
            .order_by(Asistencia.fecha.desc(), Horario.hora_inicio, Asistencia.estudiante_id)
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, asistencia_id: int) -> Asistencia:
    return _cargar_asistencia(db, asistencia_id)


def listar_hoy_de_profesor(
    db: Session,
    profesor_id: int,
    *,
    curso_id: int | None = None,
    materia_id: int | None = None,
) -> list[Asistencia]:
    """Registros de hoy de los bloques asignados al docente.

    Se incluyen solo los bloques que el profesor dicta y que corresponden al
    día de la semana actual; si se indican, se acotan por curso o materia.

    Además se deduplica por ``(estudiante, materia, hora de inicio)`` para que
    un posible ``horario`` repetido no muestre al mismo estudiante dos veces
    en la misma clase.
    """
    ahora = qr_service.ahora_local()
    fecha = ahora.date()
    dia = horario_service.dia_semana_de(ahora)
    if dia is None:
        return []

    condiciones: list[Any] = [
        Asistencia.fecha == fecha,
        Horario.profesor_id == profesor_id,
        Horario.dia_semana == dia,
    ]
    if curso_id is not None:
        condiciones.append(Horario.curso_id == curso_id)
    if materia_id is not None:
        condiciones.append(Horario.materia_id == materia_id)

    items = db.scalars(
        select(Asistencia)
        .join(Horario, Horario.id == Asistencia.horario_id)
        .options(
            joinedload(Asistencia.estudiante).joinedload(Estudiante.usuario),
            joinedload(Asistencia.horario).joinedload(Horario.materia),
            joinedload(Asistencia.horario).joinedload(Horario.curso),
            joinedload(Asistencia.horario)
            .joinedload(Horario.profesor)
            .joinedload(Profesor.usuario),
        )
        .where(*condiciones)
        .order_by(
            Horario.hora_inicio,
            Asistencia.hora_ingreso,
            Asistencia.estudiante_id,
        )
    )

    unicos: list[Asistencia] = []
    vistos: set[tuple[int, int, time]] = set()
    for item in items:
        horario = item.horario
        if horario is None:
            continue
        clave = (item.estudiante_id, horario.materia_id, horario.hora_inicio)
        if clave in vistos:
            continue
        vistos.add(clave)
        unicos.append(item)
    return unicos


DIAS_SEMANA = (
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
)

PRIORIDAD_ESTADO = {
    EstadoAsistencia.PRESENTE.value: 1,
    EstadoAsistencia.TARDANZA.value: 2,
    EstadoAsistencia.FALTA.value: 3,
    EstadoAsistencia.JUSTIFICADA.value: 4,
}


def lista_mensual_de_profesor(
    db: Session,
    profesor_id: int,
    *,
    curso_id: int,
    materia_id: int,
    mes: str,
) -> ListaAsistenciaResponse:
    """Matriz mensual de asistencia de un curso y materia del docente.

    El mes llega como ``AAAA-MM``. Se incluyen todos los estudiantes
    matriculados en el curso ordenados por apellidos y, por cada día, el
    estado más relevante registrado para esa materia (justificada > falta >
    tardanza > presente).

    Solo se devuelven días de lunes a viernes. Un día se incluye si tiene al
    menos un registro de asistencia o si está programado en el horario y aún
    no ha pasado, de modo que los feriados sin registros no generan columnas.
    """
    partes = mes.split("-")
    if len(partes) != 2:
        raise ReglaNegocio("El mes debe tener el formato AAAA-MM")
    try:
        anio, numero_mes = (int(parte) for parte in partes)
    except ValueError as exc:
        raise ReglaNegocio("El mes debe tener el formato AAAA-MM") from exc
    if not 1 <= numero_mes <= 12:
        raise ReglaNegocio("El mes debe estar entre 01 y 12")

    inicio = date(anio, numero_mes, 1)
    ultimo_dia = calendar.monthrange(anio, numero_mes)[1]
    fin = date(anio, numero_mes, ultimo_dia)

    curso = db.get(Curso, curso_id)
    if curso is None:
        raise NoEncontrado(f"No existe el curso {curso_id}")
    materia = db.get(Materia, materia_id)
    if materia is None:
        raise NoEncontrado(f"No existe la materia {materia_id}")

    dias_clase = set(
        db.scalars(
            select(Horario.dia_semana).where(
                Horario.profesor_id == profesor_id,
                Horario.curso_id == curso_id,
                Horario.materia_id == materia_id,
            )
        )
    )
    if not dias_clase:
        raise Prohibido(
            "Ese curso y materia no están asignados a tu horario."
        )

    estudiantes = list(
        db.scalars(
            select(Estudiante)
            .join(Usuario, Usuario.id == Estudiante.usuario_id)
            .options(joinedload(Estudiante.usuario))
            .where(Estudiante.curso_id == curso_id)
            .order_by(*orden_persona())
        )
    )

    registros = db.execute(
        select(Asistencia.estudiante_id, Asistencia.fecha, Asistencia.estado)
        .join(Horario, Horario.id == Asistencia.horario_id)
        .where(
            Asistencia.fecha >= inicio,
            Asistencia.fecha <= fin,
            Horario.profesor_id == profesor_id,
            Horario.curso_id == curso_id,
            Horario.materia_id == materia_id,
        )
    ).all()

    estados: dict[int, dict[str, str]] = {}
    fechas_con_registro: set[date] = set()
    for estudiante_id, fecha, estado in registros:
        fechas_con_registro.add(fecha)
        clave = fecha.isoformat()
        por_fecha = estados.setdefault(estudiante_id, {})
        actual = por_fecha.get(clave)
        if actual is None or PRIORIDAD_ESTADO[estado] > PRIORIDAD_ESTADO[actual]:
            por_fecha[clave] = estado

    hoy = qr_service.ahora_local().date()
    dias: list[DiaListaAsistencia] = []
    for numero in range(1, ultimo_dia + 1):
        fecha = date(anio, numero_mes, numero)
        if fecha.weekday() >= 5:
            continue
        nombre_dia = DIAS_SEMANA[fecha.weekday()]
        es_clase = nombre_dia in dias_clase
        tiene_registro = fecha in fechas_con_registro
        if not tiene_registro and not (es_clase and fecha >= hoy):
            continue
        dias.append(
            DiaListaAsistencia(
                fecha=fecha,
                dia=numero,
                dia_semana=nombre_dia,
                es_clase=es_clase,
            )
        )

    filas = [
        EstudianteListaAsistencia(
            usuario_id=estudiante.usuario_id,
            nombres=estudiante.usuario.nombres,
            apellidos=estudiante.usuario.apellidos,
            ci=estudiante.usuario.ci,
            estados=estados.get(estudiante.usuario_id, {}),
        )
        for estudiante in estudiantes
    ]

    return ListaAsistenciaResponse(
        mes=mes,
        curso=curso,
        materia=materia,
        dias=dias,
        estudiantes=filas,
    )
