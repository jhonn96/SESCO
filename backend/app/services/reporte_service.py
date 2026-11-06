"""Capa de negocio de reportes y panel de asistencia (RF-08).

El panel se calcula en el momento de la consulta ("tiempo real") y agrupa por
curso. La serie diaria permite dibujar la evolución de la semana en curso. El
porcentaje de inasistencia es ``faltas / registros * 100`` de la semana en
curso hasta la fecha consultada; ``justificada`` no cuenta como ausencia.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NoEncontrado, ReglaNegocio
from app.models import (
    Asistencia,
    Curso,
    Estudiante,
    Horario,
    ParametroAsistencia,
    Periodo,
    Tutor,
    Tutoria,
    Usuario,
)
from app.schemas.estudiante import TutorACargoResponse
from app.schemas.reporte import (
    ComparacionMensualResponse,
    CursoPanel,
    EstudianteReporte,
    MesAsistencia,
    PanelAsistenciaResponse,
    RankingInasistenciaItem,
    RankingInasistenciasResponse,
    ReporteEstudiantesResponse,
    ResumenEstados,
    SerieDia,
)
from app.services import qr_service

#: Estados de ``asistencia.estado``.
ESTADOS = ("presente", "tardanza", "falta", "justificada")


def parametros(db: Session) -> ParametroAsistencia:
    parametro = db.get(ParametroAsistencia, 1)
    if parametro is None:
        raise ReglaNegocio(
            "No existe la configuración de asistencia (parametro_asistencia id=1)"
        )
    return parametro


def rango_semana(fecha: date) -> tuple[date, date]:
    """Lunes de la semana de ``fecha`` hasta la propia fecha (semana en curso)."""
    inicio = fecha - timedelta(days=fecha.weekday())
    return inicio, fecha


def etiqueta_curso(curso: Curso) -> str:
    return f'{curso.nivel.capitalize()} {curso.grado}° "{curso.paralelo.strip()}"'


def resumen_por_curso(
    db: Session,
    *,
    desde: date,
    hasta: date,
    curso_ids: list[int],
) -> dict[int, dict[str, int]]:
    """Conteo de asistencias por curso y estado en el rango de fechas."""
    if not curso_ids:
        return {}
    filas = db.execute(
        select(Horario.curso_id, Asistencia.estado, func.count())
        .join(Asistencia, Asistencia.horario_id == Horario.id)
        .where(
            Asistencia.fecha >= desde,
            Asistencia.fecha <= hasta,
            Horario.curso_id.in_(curso_ids),
        )
        .group_by(Horario.curso_id, Asistencia.estado)
    ).all()

    resumen: dict[int, dict[str, int]] = {curso_id: {} for curso_id in curso_ids}
    for curso_id, estado, cantidad in filas:
        resumen[curso_id][estado] = cantidad
    return resumen


def construir_resumen(conteos: dict[str, int]) -> ResumenEstados:
    return ResumenEstados(
        registros=sum(conteos.values()),
        presentes=conteos.get("presente", 0),
        tardanzas=conteos.get("tardanza", 0),
        faltas=conteos.get("falta", 0),
        justificadas=conteos.get("justificada", 0),
    )


def conteos_por_dia(
    db: Session,
    *,
    desde: date,
    hasta: date,
    curso_ids: list[int],
) -> dict[date, dict[str, int]]:
    """Conteo de asistencias por día y estado en el rango de fechas."""
    if not curso_ids:
        return {}
    filas = db.execute(
        select(Asistencia.fecha, Asistencia.estado, func.count())
        .join(Horario, Asistencia.horario_id == Horario.id)
        .where(
            Asistencia.fecha >= desde,
            Asistencia.fecha <= hasta,
            Horario.curso_id.in_(curso_ids),
        )
        .group_by(Asistencia.fecha, Asistencia.estado)
    ).all()

    resumen: dict[date, dict[str, int]] = {}
    for dia, estado, cantidad in filas:
        resumen.setdefault(dia, {})[estado] = cantidad
    return resumen


def construir_serie(
    conteos: dict[date, dict[str, int]],
    *,
    desde: date,
    hasta: date,
) -> list[SerieDia]:
    """Serie diaria completa (incluye días sin registros) para el gráfico."""
    serie: list[SerieDia] = []
    dia = desde
    while dia <= hasta:
        resumen = construir_resumen(conteos.get(dia, {}))
        serie.append(SerieDia(fecha=dia, **resumen.model_dump()))
        dia += timedelta(days=1)
    return serie


def porcentaje_inasistencia(resumen: ResumenEstados) -> float:
    if resumen.registros == 0:
        return 0.0
    return round(resumen.faltas / resumen.registros * 100, 2)


def panel(
    db: Session,
    *,
    fecha: date | None = None,
    periodo_id: int | None = None,
) -> PanelAsistenciaResponse:
    ahora = qr_service.ahora_local()
    consulta = fecha or ahora.date()
    inicio_semana, fin_semana = rango_semana(consulta)
    umbral = float(parametros(db).umbral_inasistencia_pct)

    filtros = [Curso.periodo_id == periodo_id] if periodo_id is not None else []
    cursos = list(
        db.scalars(
            select(Curso)
            .where(*filtros)
            .order_by(Curso.nivel, Curso.grado, Curso.paralelo)
        )
    )
    ids = [curso.id for curso in cursos]

    estudiantes: dict[int, int] = {}
    if ids:
        estudiantes = dict(
            db.execute(
                select(Estudiante.curso_id, func.count())
                .where(Estudiante.curso_id.in_(ids))
                .group_by(Estudiante.curso_id)
            ).all()
        )

    hoy_conteos = resumen_por_curso(db, desde=consulta, hasta=consulta, curso_ids=ids)
    semana_conteos = resumen_por_curso(
        db, desde=inicio_semana, hasta=fin_semana, curso_ids=ids
    )
    serie_conteos = conteos_por_dia(
        db, desde=inicio_semana, hasta=fin_semana, curso_ids=ids
    )

    filas: list[CursoPanel] = []
    total_hoy = ResumenEstados()
    total_semana = ResumenEstados()
    for curso in cursos:
        resumen_hoy = construir_resumen(hoy_conteos.get(curso.id, {}))
        resumen_semana = construir_resumen(semana_conteos.get(curso.id, {}))
        porcentaje = porcentaje_inasistencia(resumen_semana)
        filas.append(
            CursoPanel(
                curso_id=curso.id,
                nivel=curso.nivel,
                grado=curso.grado,
                paralelo=curso.paralelo.strip(),
                turno=curso.turno,
                periodo_id=curso.periodo_id,
                estudiantes=estudiantes.get(curso.id, 0),
                hoy=resumen_hoy,
                semana=resumen_semana,
                inasistencia_pct=porcentaje,
                supera_umbral=resumen_semana.registros > 0 and porcentaje > umbral,
            )
        )
        total_hoy = _sumar(total_hoy, resumen_hoy)
        total_semana = _sumar(total_semana, resumen_semana)

    return PanelAsistenciaResponse(
        generado_en=ahora,
        fecha=consulta,
        semana_inicio=inicio_semana,
        semana_fin=fin_semana,
        umbral_inasistencia_pct=umbral,
        total_estudiantes=sum(estudiantes.values()),
        totales_hoy=total_hoy,
        totales_semana=total_semana,
        inasistencia_pct=porcentaje_inasistencia(total_semana),
        serie_semana=construir_serie(
            serie_conteos, desde=inicio_semana, hasta=fin_semana
        ),
        cursos=filas,
    )


def porcentaje_asistencia(resumen: ResumenEstados) -> float:
    """Porcentaje de registros que no son falta (las justificadas cuentan)."""
    if resumen.registros == 0:
        return 0.0
    asistidos = resumen.registros - resumen.faltas
    return round(asistidos / resumen.registros * 100, 2)


def reporte_estudiantes(
    db: Session,
    *,
    desde: date,
    hasta: date,
    curso_id: int | None = None,
) -> ReporteEstudiantesResponse:
    """Totales por estudiante en un rango de fechas (RF-08)."""
    if desde > hasta:
        raise ReglaNegocio("La fecha inicial no puede ser posterior a la final")
    if (hasta - desde).days > 366:
        raise ReglaNegocio("El rango de fechas no puede superar un año")

    # Apellidos separados en la propia consulta: paterno y materno.
    apellido_paterno = func.split_part(
        func.btrim(Usuario.apellidos), " ", 1
    )
    apellido_materno = func.split_part(
        func.btrim(Usuario.apellidos), " ", 2
    )

    consulta = (
        select(
            Estudiante,
            apellido_paterno.label("apellido_paterno"),
            apellido_materno.label("apellido_materno"),
        )
        .join(Usuario, Usuario.id == Estudiante.usuario_id)
        .join(Curso, Curso.id == Estudiante.curso_id)
        .options(
            joinedload(Estudiante.usuario),
            joinedload(Estudiante.curso),
        )
        .order_by(
            Curso.nivel,
            Curso.grado,
            func.btrim(Curso.paralelo),
            func.lower(apellido_paterno),
            func.lower(apellido_materno),
            func.lower(Usuario.nombres),
            Estudiante.usuario_id,
        )
    )
    if curso_id is not None:
        consulta = consulta.where(Estudiante.curso_id == curso_id)

    estudiantes = list(db.execute(consulta).all())

    consulta_conteos = (
        select(Asistencia.estudiante_id, Asistencia.estado, func.count())
        .where(Asistencia.fecha >= desde, Asistencia.fecha <= hasta)
        .group_by(Asistencia.estudiante_id, Asistencia.estado)
    )
    if curso_id is not None:
        consulta_conteos = consulta_conteos.join(
            Horario, Horario.id == Asistencia.horario_id
        ).where(Horario.curso_id == curso_id)

    conteos: dict[int, dict[str, int]] = {}
    for estudiante_id, estado, cantidad in db.execute(consulta_conteos).all():
        conteos.setdefault(estudiante_id, {})[estado] = cantidad

    filas: list[EstudianteReporte] = []
    totales = ResumenEstados()
    for estudiante, apellido_paterno_valor, apellido_materno_valor in estudiantes:
        resumen = construir_resumen(conteos.get(estudiante.usuario_id, {}))
        usuario = estudiante.usuario
        filas.append(
            EstudianteReporte(
                usuario_id=estudiante.usuario_id,
                apellido_paterno=(apellido_paterno_valor or "").strip(),
                apellido_materno=(apellido_materno_valor or "").strip(),
                nombres=usuario.nombres,
                apellidos=usuario.apellidos,
                ci=usuario.ci,
                curso_id=estudiante.curso_id,
                curso=estudiante.curso,
                registros=resumen.registros,
                presentes=resumen.presentes,
                tardanzas=resumen.tardanzas,
                faltas=resumen.faltas,
                justificadas=resumen.justificadas,
                porcentaje_asistencia=porcentaje_asistencia(resumen),
            )
        )
        totales = _sumar(totales, resumen)

    return ReporteEstudiantesResponse(
        generado_en=qr_service.ahora_local(),
        desde=desde,
        hasta=hasta,
        curso_id=curso_id,
        total_estudiantes=len(filas),
        totales=totales,
        estudiantes=filas,
    )


def _tutores_principales(
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


def ranking_inasistencias(
    db: Session,
    *,
    desde: date,
    hasta: date,
    curso_id: int | None = None,
    periodo_id: int | None = None,
    limit: int = 200,
) -> RankingInasistenciasResponse:
    """Estudiantes ordenados por faltas y tardanzas dentro de un rango de fechas."""
    if desde > hasta:
        raise ReglaNegocio("La fecha inicial no puede ser posterior a la final")
    if (hasta - desde).days > 366:
        raise ReglaNegocio("El rango de fechas no puede superar un año")

    filtros = []
    if curso_id is not None:
        filtros.append(Estudiante.curso_id == curso_id)
    if periodo_id is not None:
        filtros.append(Curso.periodo_id == periodo_id)

    estudiantes = list(
        db.scalars(
            select(Estudiante)
            .join(Curso, Curso.id == Estudiante.curso_id)
            .options(
                joinedload(Estudiante.usuario),
                joinedload(Estudiante.curso),
            )
            .where(*filtros)
            .order_by(Estudiante.usuario_id)
        )
    )

    ids = [estudiante.usuario_id for estudiante in estudiantes]
    conteos: dict[int, dict[str, int]] = {}
    if ids:
        filas = db.execute(
            select(Asistencia.estudiante_id, Asistencia.estado, func.count())
            .where(
                Asistencia.estudiante_id.in_(ids),
                Asistencia.fecha >= desde,
                Asistencia.fecha <= hasta,
            )
            .group_by(Asistencia.estudiante_id, Asistencia.estado)
        ).all()
        for estudiante_id, estado, cantidad in filas:
            conteos.setdefault(estudiante_id, {})[estado] = cantidad

    tutores = _tutores_principales(db, ids)

    items: list[RankingInasistenciaItem] = []
    for estudiante in estudiantes:
        resumen = construir_resumen(conteos.get(estudiante.usuario_id, {}))
        tutor = tutores.get(estudiante.usuario_id)
        items.append(
            RankingInasistenciaItem(
                usuario_id=estudiante.usuario_id,
                nombres=estudiante.usuario.nombres,
                apellidos=estudiante.usuario.apellidos,
                ci=estudiante.usuario.ci,
                curso_id=estudiante.curso_id,
                curso=estudiante.curso,
                faltas=resumen.faltas,
                tardanzas=resumen.tardanzas,
                tutor=tutor,
                tutor_nombre=(
                    f"{tutor.nombres} {tutor.apellidos}".strip() if tutor else None
                ),
            )
        )

    items.sort(
        key=lambda item: (
            -item.faltas,
            -item.tardanzas,
            item.apellidos.lower(),
            item.nombres.lower(),
            item.usuario_id,
        )
    )

    return RankingInasistenciasResponse(
        generado_en=qr_service.ahora_local(),
        desde=desde,
        hasta=hasta,
        total_estudiantes=len(items),
        estudiantes=items[:limit],
    )


def comparacion_mensual(
    db: Session,
    *,
    periodo_id: int,
) -> ComparacionMensualResponse:
    """Compara la asistencia mes a mes dentro de un periodo lectivo (RF-08)."""
    periodo = db.get(Periodo, periodo_id)
    if periodo is None:
        raise NoEncontrado(f"No existe el periodo {periodo_id}")

    mes_expr = func.date_trunc("month", Asistencia.fecha)
    filas = db.execute(
        select(mes_expr, Asistencia.estado, func.count())
        .join(Horario, Asistencia.horario_id == Horario.id)
        .join(Curso, Curso.id == Horario.curso_id)
        .where(
            Curso.periodo_id == periodo.id,
            Asistencia.fecha >= periodo.fecha_ini,
            Asistencia.fecha <= periodo.fecha_fin,
        )
        .group_by(mes_expr, Asistencia.estado)
    ).all()

    conteos: dict[date, dict[str, int]] = {}
    for clave, estado, cantidad in filas:
        mes = clave.date() if isinstance(clave, datetime) else clave
        conteos.setdefault(mes.replace(day=1), {})[estado] = cantidad

    meses: list[MesAsistencia] = []
    total = ResumenEstados()
    mes = periodo.fecha_ini.replace(day=1)
    ultimo_mes = periodo.fecha_fin.replace(day=1)
    while mes <= ultimo_mes:
        resumen = construir_resumen(conteos.get(mes, {}))
        meses.append(
            MesAsistencia(
                mes=mes,
                porcentaje_asistencia=porcentaje_asistencia(resumen),
                **resumen.model_dump(),
            )
        )
        total = _sumar(total, resumen)
        mes = (mes.replace(day=28) + timedelta(days=4)).replace(day=1)

    return ComparacionMensualResponse(
        generado_en=qr_service.ahora_local(),
        periodo_id=periodo.id,
        gestion=periodo.gestion,
        trimestre=periodo.trimestre,
        desde=periodo.fecha_ini,
        hasta=periodo.fecha_fin,
        totales=total,
        porcentaje_asistencia=porcentaje_asistencia(total),
        meses=meses,
    )


def _sumar(a: ResumenEstados, b: ResumenEstados) -> ResumenEstados:
    return ResumenEstados(
        registros=a.registros + b.registros,
        presentes=a.presentes + b.presentes,
        tardanzas=a.tardanzas + b.tardanzas,
        faltas=a.faltas + b.faltas,
        justificadas=a.justificadas + b.justificadas,
    )
