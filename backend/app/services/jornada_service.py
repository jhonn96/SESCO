"""Cierre automático de jornada (salidas sin escaneo).

La tarea busca los bloques marcados con ``es_ultimo_bloque`` cuyo ``hora_fin``
ya pasó. Para cada estudiante del curso que tenga un ingreso registrado pero no
tenga salida, completa ``hora_salida`` con la hora de fin del bloque y encola
un aviso al tutor principal confirmado.

La operación es idempotente: cuando un registro ya tiene ``hora_salida`` deja
de considerarse, por lo que ejecutar la tarea varias veces no duplica avisos.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core import audit
from app.models import Asistencia, Estudiante, Horario, Notificacion, Tutoria
from app.services import qr_service
from app.services.qr_service import ZONA_HORARIA

#: Días de la grilla en el orden de ``datetime.weekday()`` (lunes = 0).
DIAS_HABILES = ("lunes", "martes", "miercoles", "jueves", "viernes")

#: Tipo de notificación que recibe el tutor al cierre de jornada.
TIPO_NOTIFICACION_SALIDA = "salida"


@dataclass(frozen=True)
class ResultadoCierreJornada:
    fecha: date
    bloques_procesados: int
    salidas_registradas: int
    notificaciones_encoladas: int


def _dia_semana(fecha: date) -> str | None:
    """Día de la grilla para una fecha; ``None`` en fin de semana."""
    indice = fecha.weekday()
    return DIAS_HABILES[indice] if indice < len(DIAS_HABILES) else None


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


def _nombre_estudiante(estudiante: Estudiante) -> str:
    usuario = estudiante.usuario
    if usuario is None:
        return f"#{estudiante.usuario_id}"
    return f"{usuario.nombres} {usuario.apellidos}".strip()


def _registros_abiertos_del_curso(
    db: Session, *, curso_id: int, fecha: date
) -> list[Asistencia]:
    """Asistencias del curso y fecha con ingreso registrado y sin salida.

    Se bloquean las filas para que dos procesos de la tarea no cierren ni
    notifiquen el mismo registro a la vez.
    """
    return list(
        db.scalars(
            select(Asistencia)
            .options(
                selectinload(Asistencia.estudiante).selectinload(Estudiante.usuario)
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


def cerrar_jornada(
    db: Session,
    *,
    fecha: date | None = None,
    momento: datetime | None = None,
    usuario_id: int | None = None,
    ip: str | None = None,
) -> ResultadoCierreJornada:
    """Registra las salidas pendientes de los bloques de cierre ya finalizados."""
    instante = momento or qr_service.ahora_local()
    if instante.tzinfo is None:
        instante = instante.replace(tzinfo=ZONA_HORARIA)
    dia_objetivo = fecha or instante.date()
    dia = _dia_semana(dia_objetivo)

    if dia is None:
        return ResultadoCierreJornada(
            fecha=dia_objetivo,
            bloques_procesados=0,
            salidas_registradas=0,
            notificaciones_encoladas=0,
        )

    bloques = list(
        db.scalars(
            select(Horario)
            .where(
                Horario.es_ultimo_bloque.is_(True),
                Horario.dia_semana == dia,
            )
            .order_by(Horario.hora_fin, Horario.id)
        )
    )

    bloques_procesados = 0
    salidas_registradas = 0
    notificaciones_encoladas = 0
    cursos_procesados: set[int] = set()

    for bloque in bloques:
        fin_bloque = datetime.combine(
            dia_objetivo, bloque.hora_fin, tzinfo=ZONA_HORARIA
        )
        if fin_bloque > instante:
            continue
        if bloque.curso_id in cursos_procesados:
            continue

        cursos_procesados.add(bloque.curso_id)
        bloques_procesados += 1
        registros = _registros_abiertos_del_curso(
            db, curso_id=bloque.curso_id, fecha=dia_objetivo
        )

        por_estudiante: dict[int, list[Asistencia]] = {}
        for registro in registros:
            por_estudiante.setdefault(registro.estudiante_id, []).append(registro)

        for registros_estudiante in por_estudiante.values():
            for registro in registros_estudiante:
                # La salida nunca puede ser anterior al ingreso (ck_asistencia_horas).
                if registro.hora_ingreso is not None and registro.hora_ingreso > fin_bloque:
                    registro.hora_salida = registro.hora_ingreso
                else:
                    registro.hora_salida = fin_bloque
                salidas_registradas += 1

            estudiante = registros_estudiante[0].estudiante
            tutor_id = _tutor_principal(db, estudiante.usuario_id)
            if tutor_id is None:
                continue

            hora_txt = bloque.hora_fin.strftime("%H:%M")
            db.add(
                Notificacion(
                    usuario_id=tutor_id,
                    asistencia_id=registros_estudiante[0].id,
                    tipo=TIPO_NOTIFICACION_SALIDA,
                    canal="app",
                    mensaje=(
                        f"Su hijo(a) {_nombre_estudiante(estudiante)} ha salido "
                        f"del colegio a las {hora_txt} (cierre de jornada)"
                    ),
                    intentos=0,
                )
            )
            notificaciones_encoladas += 1

    if bloques_procesados:
        audit.registrar(
            db,
            usuario_id=usuario_id,
            accion="CIERRE_JORNADA_AUTOMATICO",
            entidad="jornada",
            detalle={
                "fecha": dia_objetivo.isoformat(),
                "bloques_procesados": bloques_procesados,
                "salidas_registradas": salidas_registradas,
                "notificaciones_encoladas": notificaciones_encoladas,
            },
            ip=ip,
        )

    db.commit()
    return ResultadoCierreJornada(
        fecha=dia_objetivo,
        bloques_procesados=bloques_procesados,
        salidas_registradas=salidas_registradas,
        notificaciones_encoladas=notificaciones_encoladas,
    )
