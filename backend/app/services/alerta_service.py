"""Capa de negocio de alertas automáticas (RF-06) y reportes por curso (RF-07).

Reglas implementadas
--------------------
- **Alerta de faltas**: el estudiante acumula ``umbral_alerta_faltas`` (3) faltas
  *consecutivas* en el primer bloque de su curso. La racha se mide sobre los
  días escolares con registro (los fines de semana no existen en ``asistencia``
  y por tanto no la cortan).
- **Alerta de tardanzas**: ``umbral_alerta_tardanzas`` (5) tardanzas en el
  primer bloque durante el mes en curso.
- **Reporte de curso**: si el porcentaje de inasistencia de la semana en curso
  supera ``umbral_inasistencia_pct`` (15 %), se encola una notificación
  ``inasistencia`` a cada Director activo.
- **Idempotencia**: las alertas se deduplican por ``(estudiante, tipo, día)`` y
  los reportes por el prefijo ``Curso + Semana`` del mensaje. Ejecutar la
  generación dos veces el mismo día no crea duplicados.
- Los avisos de una alerta se envían al tutor principal confirmado, a los
  Directores activos y al profesor asesor del curso
  (``profesor_curso.es_asesor``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core import audit
from app.core.exceptions import Conflicto, NoEncontrado, Prohibido
from app.models import (
    Alerta,
    Asistencia,
    Curso,
    Estudiante,
    Horario,
    Notificacion,
    ParametroAsistencia,
    ProfesorCurso,
    Tutor,
    Tutoria,
    Usuario,
)
from app.schemas.alerta import (
    EstudianteRiesgoResponse,
    NotificacionTutorResponse,
    ReporteInasistenciaResponse,
    RiesgoProfesorResponse,
)
from app.schemas.curso import CursoResponse
from app.schemas.enums import IDS_ROL, RolNombre, TipoAlerta
from app.schemas.estudiante import TutorACargoResponse
from app.services import qr_service, reporte_service

#: Meses en español para los textos de las alertas.
MESES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)

#: Días hacia atrás que se revisan para medir la racha de faltas.
DIAS_RACHA = 120


@dataclass
class ResultadoGeneracion:
    alertas: list[Alerta] = field(default_factory=list)
    reportes: list[ReporteInasistenciaResponse] = field(default_factory=list)
    cursos_evaluados: int = 0
    notificaciones_creadas: int = 0
    semana_inicio: date | None = None
    semana_fin: date | None = None
    umbral_inasistencia_pct: float = 0.0


@dataclass(frozen=True)
class RiesgoAsistencia:
    """Indicadores de riesgo calculados sobre el primer bloque del curso."""

    faltas_consecutivas: int
    tardanzas_mes: int


# --------------------------------------------------------------------------
# Datos auxiliares
# --------------------------------------------------------------------------


def _parametros(db: Session) -> ParametroAsistencia:
    return reporte_service.parametros(db)


def _primer_bloque_por_curso(db: Session) -> dict[int, int]:
    """``curso_id -> horario_id`` del primer bloque de la jornada."""
    primeros: dict[int, int] = {}
    for horario in db.scalars(
        select(Horario).order_by(Horario.curso_id, Horario.hora_inicio, Horario.id)
    ):
        primeros.setdefault(horario.curso_id, horario.id)
    return primeros


def _directores_activos(db: Session) -> list[int]:
    return list(
        db.scalars(
            select(Usuario.id)
            .where(Usuario.rol_id == IDS_ROL[RolNombre.DIRECTOR], Usuario.activo.is_(True))
            .order_by(Usuario.id)
        )
    )


def _profesores_asesores(db: Session, curso_ids: list[int]) -> dict[int, int]:
    """``curso_id -> profesor_id`` del asesor asignado a cada curso."""
    if not curso_ids:
        return {}
    filas = db.execute(
        select(ProfesorCurso.curso_id, ProfesorCurso.profesor_id)
        .where(
            ProfesorCurso.curso_id.in_(curso_ids),
            ProfesorCurso.es_asesor.is_(True),
        )
        .order_by(ProfesorCurso.curso_id, ProfesorCurso.profesor_id)
    ).all()
    asesores: dict[int, int] = {}
    for curso_id, profesor_id in filas:
        asesores.setdefault(curso_id, profesor_id)
    return asesores


def _tutores_principales(db: Session, estudiante_ids: list[int]) -> dict[int, int]:
    if not estudiante_ids:
        return {}
    filas = db.execute(
        select(Tutoria.estudiante_id, Tutoria.tutor_id)
        .where(
            Tutoria.estudiante_id.in_(estudiante_ids),
            Tutoria.es_principal.is_(True),
            Tutoria.estado == "confirmada",
        )
        .order_by(Tutoria.estudiante_id, Tutoria.tutor_id)
    ).all()
    tutores: dict[int, int] = {}
    for estudiante_id, tutor_id in filas:
        tutores.setdefault(estudiante_id, tutor_id)
    return tutores


def _tutores_detalle(
    db: Session, estudiante_ids: list[int]
) -> dict[int, TutorACargoResponse]:
    """Tutor principal confirmado (o el primero confirmado) de cada estudiante."""
    if not estudiante_ids:
        return {}
    filas = db.execute(
        select(Tutoria.estudiante_id, Usuario, Tutor, Tutoria)
        .join(Usuario, Usuario.id == Tutoria.tutor_id)
        .join(Tutor, Tutor.usuario_id == Usuario.id)
        .where(
            Tutoria.estudiante_id.in_(estudiante_ids),
            Tutoria.estado == "confirmada",
        )
        .order_by(
            Tutoria.estudiante_id,
            Tutoria.es_principal.desc(),
            Usuario.apellidos,
            Usuario.nombres,
        )
    ).all()

    tutores: dict[int, TutorACargoResponse] = {}
    for estudiante_id, usuario, tutor, tutoria in filas:
        if estudiante_id in tutores:
            continue
        tutores[estudiante_id] = TutorACargoResponse(
            tutor_id=usuario.id,
            nombres=usuario.nombres,
            apellidos=usuario.apellidos,
            ci=usuario.ci,
            parentesco=tutoria.parentesco,
            telefono=tutor.telefono,
            es_principal=tutoria.es_principal,
        )
    return tutores


def _nombre(estudiante: Estudiante) -> str:
    return f"{estudiante.usuario.nombres} {estudiante.usuario.apellidos}".strip()


# --------------------------------------------------------------------------
# Alertas por estudiante (RF-06)
# --------------------------------------------------------------------------


def _registros_primer_bloque(
    db: Session,
    *,
    estudiante_ids: list[int],
    horario_ids: list[int],
    hasta: date,
) -> dict[int, list[tuple[date, str]]]:
    """Asistencias del primer bloque por estudiante, de la más reciente a la más antigua."""
    if not estudiante_ids or not horario_ids:
        return {}
    filas = db.execute(
        select(Asistencia.estudiante_id, Asistencia.fecha, Asistencia.estado)
        .where(
            Asistencia.estudiante_id.in_(estudiante_ids),
            Asistencia.horario_id.in_(horario_ids),
            Asistencia.fecha <= hasta,
        )
        .order_by(Asistencia.estudiante_id, Asistencia.fecha.desc())
    ).all()

    registros: dict[int, list[tuple[date, str]]] = {i: [] for i in estudiante_ids}
    for estudiante_id, fecha, estado in filas:
        registros.setdefault(estudiante_id, []).append((fecha, estado))
    return registros


def _racha_faltas(registros: list[tuple[date, str]], *, hasta: date) -> int:
    """Faltas consecutivas más recientes en el primer bloque."""
    racha = 0
    limite = hasta - timedelta(days=DIAS_RACHA)
    for fecha, estado in registros:
        if fecha > hasta:
            continue
        if fecha < limite:
            break
        if estado == "falta":
            racha += 1
        elif estado in ("presente", "tardanza", "justificada"):
            break
    return racha


def _tardanzas_del_mes(
    registros: list[tuple[date, str]], *, inicio_mes: date, hasta: date
) -> int:
    return sum(
        1
        for fecha, estado in registros
        if estado == "tardanza" and inicio_mes <= fecha <= hasta
    )


def _calcular_riesgo(
    db: Session,
    *,
    estudiantes: list[Estudiante],
    hasta: date,
) -> dict[int, RiesgoAsistencia]:
    """Calcula faltas consecutivas y tardanzas mensuales del primer bloque."""
    if not estudiantes:
        return {}

    primeros = _primer_bloque_por_curso(db)
    por_estudiante = {e.usuario_id: e for e in estudiantes}
    horario_ids = sorted(
        {primeros[e.curso_id] for e in estudiantes if e.curso_id in primeros}
    )
    registros = _registros_primer_bloque(
        db,
        estudiante_ids=list(por_estudiante),
        horario_ids=horario_ids,
        hasta=hasta,
    )
    inicio_mes = hasta.replace(day=1)
    return {
        estudiante_id: RiesgoAsistencia(
            faltas_consecutivas=_racha_faltas(
                registros.get(estudiante_id, []), hasta=hasta
            ),
            tardanzas_mes=_tardanzas_del_mes(
                registros.get(estudiante_id, []),
                inicio_mes=inicio_mes,
                hasta=hasta,
            ),
        )
        for estudiante_id in por_estudiante
    }


def _alertas_existentes(
    db: Session, *, estudiante_ids: list[int], dia: date
) -> set[tuple[int, str]]:
    if not estudiante_ids:
        return set()
    filas = db.execute(
        select(Alerta.estudiante_id, Alerta.tipo).where(
            Alerta.estudiante_id.in_(estudiante_ids),
            Alerta.dia == dia,
        )
    ).all()
    return {(estudiante_id, tipo) for estudiante_id, tipo in filas}


def _detalle_faltas(racha: int, umbral: int) -> str:
    return (
        f"{racha} faltas consecutivas en el primer bloque "
        f"(umbral: {umbral} faltas seguidas)."
    )


def _detalle_tardanzas(cantidad: int, umbral: int, hoy: date) -> str:
    mes = MESES[hoy.month - 1]
    return (
        f"{cantidad} tardanzas en el primer bloque durante {mes} de {hoy.year} "
        f"(umbral: {umbral} tardanzas mensuales)."
    )


def _notificar_alerta(
    db: Session,
    *,
    alerta: Alerta,
    estudiante: Estudiante,
    destinatarios: list[int],
) -> int:
    if not destinatarios:
        return 0
    mensaje = f"Alerta de asistencia de {_nombre(estudiante)}: {alerta.detalle}"
    for usuario_id in sorted(set(destinatarios)):
        db.add(
            Notificacion(
                usuario_id=usuario_id,
                alerta_id=alerta.id,
                tipo="alerta",
                canal="app",
                mensaje=mensaje,
                intentos=0,
            )
        )
    return len(set(destinatarios))


def _generar_alertas_estudiante(
    db: Session,
    *,
    hasta: date,
    periodo_id: int | None,
    parametros: ParametroAsistencia,
    directores: list[int],
) -> tuple[list[Alerta], int]:
    filtros = [Curso.periodo_id == periodo_id] if periodo_id is not None else []
    estudiantes = list(
        db.scalars(
            select(Estudiante)
            .join(Curso, Curso.id == Estudiante.curso_id)
            .options(joinedload(Estudiante.usuario))
            .where(*filtros)
            .order_by(Estudiante.usuario_id)
        )
    )
    if not estudiantes:
        return [], 0

    por_estudiante = {e.usuario_id: e for e in estudiantes}
    riesgos = _calcular_riesgo(db, estudiantes=estudiantes, hasta=hasta)

    existentes = _alertas_existentes(db, estudiante_ids=list(por_estudiante), dia=hasta)
    tutores = _tutores_principales(db, list(por_estudiante))
    asesores = _profesores_asesores(
        db, sorted({e.curso_id for e in estudiantes if e.curso_id is not None})
    )
    umbral_faltas = parametros.umbral_alerta_faltas
    umbral_tardanzas = parametros.umbral_alerta_tardanzas

    nuevas: list[Alerta] = []
    notificaciones = 0
    for estudiante_id, estudiante in por_estudiante.items():
        riesgo = riesgos[estudiante_id]
        candidatos: list[tuple[str, str]] = []

        if riesgo.faltas_consecutivas >= umbral_faltas:
            candidatos.append(
                (
                    TipoAlerta.FALTAS.value,
                    _detalle_faltas(riesgo.faltas_consecutivas, umbral_faltas),
                )
            )

        if riesgo.tardanzas_mes >= umbral_tardanzas:
            candidatos.append(
                (
                    TipoAlerta.TARDANZAS.value,
                    _detalle_tardanzas(riesgo.tardanzas_mes, umbral_tardanzas, hasta),
                )
            )

        for tipo, detalle in candidatos:
            if (estudiante_id, tipo) in existentes:
                continue
            alerta = Alerta(
                estudiante_id=estudiante_id,
                tipo=tipo,
                detalle=detalle,
                dia=hasta,
                atendida=False,
            )
            db.add(alerta)
            db.flush()
            destinatarios = list(directores)
            if estudiante_id in tutores:
                destinatarios.append(tutores[estudiante_id])
            if estudiante.curso_id in asesores:
                destinatarios.append(asesores[estudiante.curso_id])
            notificaciones += _notificar_alerta(
                db, alerta=alerta, estudiante=estudiante, destinatarios=destinatarios
            )
            nuevas.append(alerta)

    return nuevas, notificaciones


# --------------------------------------------------------------------------
# Reporte automático por curso (RF-07)
# --------------------------------------------------------------------------


def _prefijo_reporte(curso: Curso, inicio: date, fin: date) -> str:
    return (
        "Reporte automático de inasistencia (RF-07). "
        f"Curso: {reporte_service.etiqueta_curso(curso)}. "
        f"Semana: {inicio.isoformat()} al {fin.isoformat()}."
    )


def _reportes_existentes(
    db: Session, *, directores: list[int], tipo: str = "inasistencia"
) -> dict[int, list[str]]:
    """Mensajes de reportes ya enviados a cada Director."""
    if not directores:
        return {}
    filas = db.execute(
        select(Notificacion.usuario_id, Notificacion.mensaje).where(
            Notificacion.usuario_id.in_(directores),
            Notificacion.tipo == tipo,
        )
    ).all()
    previos: dict[int, list[str]] = {usuario_id: [] for usuario_id in directores}
    for usuario_id, mensaje in filas:
        previos.setdefault(usuario_id, []).append(mensaje or "")
    return previos


def _generar_reportes_curso(
    db: Session,
    *,
    hasta: date,
    periodo_id: int | None,
    umbral: float,
    directores: list[int],
) -> tuple[list[ReporteInasistenciaResponse], int, int]:
    inicio, fin = reporte_service.rango_semana(hasta)
    filtros = [Curso.periodo_id == periodo_id] if periodo_id is not None else []
    cursos = list(
        db.scalars(
            select(Curso)
            .where(*filtros)
            .order_by(Curso.nivel, Curso.grado, Curso.paralelo)
        )
    )
    if not cursos:
        return [], len(cursos), 0

    conteos = reporte_service.resumen_por_curso(
        db, desde=inicio, hasta=fin, curso_ids=[c.id for c in cursos]
    )
    previos = _reportes_existentes(db, directores=directores)

    reportes: list[ReporteInasistenciaResponse] = []
    notificaciones = 0
    for curso in cursos:
        resumen = reporte_service.construir_resumen(conteos.get(curso.id, {}))
        if resumen.registros == 0:
            continue
        porcentaje = reporte_service.porcentaje_inasistencia(resumen)
        if porcentaje <= umbral:
            continue

        prefijo = _prefijo_reporte(curso, inicio, fin)
        detalle = (
            f" Inasistencia semanal: {porcentaje}% "
            f"({resumen.faltas} faltas de {resumen.registros} registros); "
            f"umbral permitido: {umbral}%."
        )
        creadas = 0
        for director_id in directores:
            ya_enviado = any(
                mensaje.startswith(prefijo) for mensaje in previos.get(director_id, [])
            )
            if ya_enviado:
                continue
            mensaje = prefijo + detalle
            db.add(
                Notificacion(
                    usuario_id=director_id,
                    tipo="inasistencia",
                    canal="app",
                    mensaje=mensaje,
                    intentos=0,
                )
            )
            previos.setdefault(director_id, []).append(mensaje)
            creadas += 1

        notificaciones += creadas
        reportes.append(
            ReporteInasistenciaResponse(
                curso_id=curso.id,
                curso=reporte_service.etiqueta_curso(curso),
                registros=resumen.registros,
                faltas=resumen.faltas,
                inasistencia_pct=porcentaje,
                notificaciones_creadas=creadas,
            )
        )

    return reportes, len(cursos), notificaciones


# --------------------------------------------------------------------------
# Generación (endpoint / tarea programada)
# --------------------------------------------------------------------------


def generar(
    db: Session,
    *,
    periodo_id: int | None = None,
    fecha: date | None = None,
    usuario_id: int | None = None,
    ip: str | None = None,
) -> ResultadoGeneracion:
    """Revisa las asistencias y crea las alertas y reportes pendientes."""
    hoy = fecha or qr_service.ahora_local().date()
    parametros = _parametros(db)
    umbral = float(parametros.umbral_inasistencia_pct)
    directores = _directores_activos(db)

    alertas, notif_alertas = _generar_alertas_estudiante(
        db,
        hasta=hoy,
        periodo_id=periodo_id,
        parametros=parametros,
        directores=directores,
    )
    reportes, cursos_evaluados, notif_reportes = _generar_reportes_curso(
        db,
        hasta=hoy,
        periodo_id=periodo_id,
        umbral=umbral,
        directores=directores,
    )

    audit.registrar(
        db,
        usuario_id=usuario_id,
        accion="GENERAR_ALERTAS",
        entidad="alerta",
        detalle={
            "fecha": hoy.isoformat(),
            "periodo_id": periodo_id,
            "alertas_creadas": len(alertas),
            "reportes": len(reportes),
            "notificaciones_creadas": notif_alertas + notif_reportes,
        },
        ip=ip,
    )
    db.commit()

    for alerta in alertas:
        db.refresh(alerta)

    inicio, fin = reporte_service.rango_semana(hoy)
    return ResultadoGeneracion(
        alertas=alertas,
        reportes=reportes,
        cursos_evaluados=cursos_evaluados,
        notificaciones_creadas=notif_alertas + notif_reportes,
        semana_inicio=inicio,
        semana_fin=fin,
        umbral_inasistencia_pct=umbral,
    )


# --------------------------------------------------------------------------
# Alertas del profesor (RF-06)
# --------------------------------------------------------------------------


def _cursos_de_profesor(db: Session, profesor_id: int) -> list[int]:
    return list(
        db.scalars(
            select(ProfesorCurso.curso_id)
            .where(ProfesorCurso.profesor_id == profesor_id)
            .order_by(ProfesorCurso.curso_id)
        )
    )


def riesgo_profesor(
    db: Session,
    *,
    profesor_id: int,
    hasta: date | None = None,
) -> RiesgoProfesorResponse:
    """Estudiantes de los cursos del docente que alcanzan los umbrales de alerta."""
    hoy = hasta or qr_service.ahora_local().date()
    parametros = _parametros(db)
    umbral_faltas = parametros.umbral_alerta_faltas
    umbral_tardanzas = parametros.umbral_alerta_tardanzas
    curso_ids = _cursos_de_profesor(db, profesor_id)

    if not curso_ids:
        return RiesgoProfesorResponse(
            generado_en=datetime.now(qr_service.ZONA_HORARIA),
            fecha=hoy,
            umbral_faltas=umbral_faltas,
            umbral_tardanzas=umbral_tardanzas,
            total_estudiantes=0,
        )

    estudiantes = list(
        db.scalars(
            select(Estudiante)
            .join(Curso, Curso.id == Estudiante.curso_id)
            .options(
                joinedload(Estudiante.usuario),
                joinedload(Estudiante.curso),
            )
            .where(Estudiante.curso_id.in_(curso_ids))
            .order_by(
                Curso.nivel,
                Curso.grado,
                Curso.paralelo,
                Estudiante.usuario_id,
            )
        )
    )
    riesgos = _calcular_riesgo(db, estudiantes=estudiantes, hasta=hoy)
    tutores = _tutores_detalle(db, [e.usuario_id for e in estudiantes])

    filas: list[EstudianteRiesgoResponse] = []
    for estudiante in estudiantes:
        riesgo = riesgos[estudiante.usuario_id]
        motivos: list[str] = []
        if riesgo.faltas_consecutivas >= umbral_faltas:
            motivos.append(
                f"{riesgo.faltas_consecutivas} faltas consecutivas "
                f"(umbral {umbral_faltas})"
            )
        if riesgo.tardanzas_mes >= umbral_tardanzas:
            motivos.append(
                f"{riesgo.tardanzas_mes} tardanzas en el mes "
                f"(umbral {umbral_tardanzas})"
            )
        if not motivos:
            continue
        filas.append(
            EstudianteRiesgoResponse(
                estudiante_id=estudiante.usuario_id,
                nombres=estudiante.usuario.nombres,
                apellidos=estudiante.usuario.apellidos,
                ci=estudiante.usuario.ci,
                curso_id=estudiante.curso_id,
                curso=CursoResponse.model_validate(estudiante.curso),
                faltas_consecutivas=riesgo.faltas_consecutivas,
                tardanzas_mes=riesgo.tardanzas_mes,
                umbral_faltas=umbral_faltas,
                umbral_tardanzas=umbral_tardanzas,
                motivos=motivos,
                tutor=tutores.get(estudiante.usuario_id),
            )
        )

    return RiesgoProfesorResponse(
        generado_en=datetime.now(qr_service.ZONA_HORARIA),
        fecha=hoy,
        umbral_faltas=umbral_faltas,
        umbral_tardanzas=umbral_tardanzas,
        total_estudiantes=len(filas),
        estudiantes=filas,
    )


def notificar_tutor(
    db: Session,
    *,
    estudiante_id: int,
    profesor_id: int,
    usuario_id: int,
    ip: str | None = None,
) -> NotificacionTutorResponse:
    """Envía un aviso del profesor asesor al tutor principal del estudiante."""
    estudiante = db.scalar(
        select(Estudiante)
        .options(joinedload(Estudiante.usuario))
        .where(Estudiante.usuario_id == estudiante_id)
    )
    if estudiante is None:
        raise NoEncontrado(f"No existe el estudiante {estudiante_id}")

    asignado = db.scalar(
        select(ProfesorCurso.profesor_id).where(
            ProfesorCurso.profesor_id == profesor_id,
            ProfesorCurso.curso_id == estudiante.curso_id,
        )
    )
    if asignado is None:
        raise Prohibido("No tienes asignado el curso de este estudiante")

    tutor = _tutores_detalle(db, [estudiante_id]).get(estudiante_id)
    if tutor is None:
        raise NoEncontrado("El estudiante no tiene un tutor confirmado")

    hoy = qr_service.ahora_local().date()
    parametros = _parametros(db)
    riesgo = _calcular_riesgo(db, estudiantes=[estudiante], hasta=hoy)[estudiante_id]
    mensaje = (
        f"Alerta de asistencia de {_nombre(estudiante)}: "
        f"{riesgo.faltas_consecutivas} faltas consecutivas y "
        f"{riesgo.tardanzas_mes} tardanzas en el mes. "
        f"El profesor asesor solicita contactarse con el colegio. "
        f"Umbrales: {parametros.umbral_alerta_faltas} faltas / "
        f"{parametros.umbral_alerta_tardanzas} tardanzas."
    )

    notificacion = Notificacion(
        usuario_id=tutor.tutor_id,
        tipo="alerta",
        canal="app",
        mensaje=mensaje,
        intentos=0,
    )
    db.add(notificacion)
    db.flush()

    audit.registrar(
        db,
        usuario_id=usuario_id,
        accion="NOTIFICAR_TUTOR",
        entidad="notificacion",
        entidad_id=notificacion.id,
        detalle={
            "estudiante_id": estudiante_id,
            "tutor_id": tutor.tutor_id,
            "curso_id": estudiante.curso_id,
        },
        ip=ip,
    )
    db.commit()
    db.refresh(notificacion)

    return NotificacionTutorResponse(
        notificacion_id=notificacion.id,
        estudiante_id=estudiante_id,
        tutor_id=tutor.tutor_id,
        tutor_nombre=f"{tutor.nombres} {tutor.apellidos}".strip(),
        mensaje=mensaje,
        creada=True,
    )


# --------------------------------------------------------------------------
# Consulta y atención
# --------------------------------------------------------------------------


def _condiciones(
    *,
    estudiante_id: int | None,
    tipo: TipoAlerta | None,
    atendida: bool | None,
    desde: date | None,
    hasta: date | None,
) -> list[Any]:
    condiciones: list[Any] = []
    if estudiante_id is not None:
        condiciones.append(Alerta.estudiante_id == estudiante_id)
    if tipo is not None:
        condiciones.append(Alerta.tipo == tipo.value)
    if atendida is not None:
        condiciones.append(Alerta.atendida.is_(atendida))
    if desde is not None:
        condiciones.append(Alerta.dia >= desde)
    if hasta is not None:
        condiciones.append(Alerta.dia <= hasta)
    return condiciones


def listar(
    db: Session,
    *,
    estudiante_id: int | None = None,
    tipo: TipoAlerta | None = None,
    atendida: bool | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Alerta], int]:
    condiciones = _condiciones(
        estudiante_id=estudiante_id,
        tipo=tipo,
        atendida=atendida,
        desde=desde,
        hasta=hasta,
    )
    total = db.scalar(select(func.count()).select_from(Alerta).where(*condiciones)) or 0
    items = list(
        db.scalars(
            select(Alerta)
            .options(joinedload(Alerta.estudiante).joinedload(Estudiante.usuario))
            .where(*condiciones)
            .order_by(Alerta.generada_en.desc(), Alerta.id.desc())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def _cargar(db: Session, alerta_id: int) -> Alerta:
    alerta = db.scalar(
        select(Alerta)
        .options(joinedload(Alerta.estudiante).joinedload(Estudiante.usuario))
        .where(Alerta.id == alerta_id)
    )
    if alerta is None:
        raise NoEncontrado(f"No existe la alerta {alerta_id}")
    return alerta


def atender(
    db: Session,
    *,
    alerta_id: int,
    usuario_id: int,
    ip: str | None = None,
) -> Alerta:
    alerta = _cargar(db, alerta_id)
    if alerta.atendida:
        raise Conflicto("La alerta ya fue atendida")

    alerta.atendida = True
    alerta.atendida_por = usuario_id
    alerta.atendida_en = datetime.now(qr_service.ZONA_HORARIA)

    audit.registrar(
        db,
        usuario_id=usuario_id,
        accion="ATENDER_ALERTA",
        entidad="alerta",
        entidad_id=alerta.id,
        detalle={"estudiante_id": alerta.estudiante_id, "tipo": alerta.tipo},
        ip=ip,
    )
    db.commit()
    return _cargar(db, alerta.id)
