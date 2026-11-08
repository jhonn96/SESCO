"""Tareas programadas dentro del proceso de la API.

No se agrega una dependencia externa (APScheduler/cron): un único
``asyncio.Task`` despierta cada ``CIERRE_JORNADA_INTERVALO_MIN`` minutos y
ejecuta el cierre de jornada en un hilo aparte, porque SQLAlchemy es síncrono
y no debe bloquear el event loop de FastAPI.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date

from app.core.config import settings
from app.core.database import SessionLocal
from app.services import alerta_service, jornada_service, qr_service

logger = logging.getLogger(__name__)

#: Último día en que se generaron las alertas de cierre en este proceso.
_ultimo_dia_alertas: date | None = None


def ejecutar_cierre_jornada() -> jornada_service.ResultadoCierreJornada:
    """Abre su propia sesión (fuera de un request) y cierra la jornada."""
    db = SessionLocal()
    try:
        resultado = jornada_service.cerrar_jornada(db)
        if resultado.bloques_procesados or resultado.salidas_registradas:
            logger.info(
                "Cierre de jornada %s: %s bloque(s), %s salida(s), %s notificación(es)",
                resultado.fecha,
                resultado.bloques_procesados,
                resultado.salidas_registradas,
                resultado.notificaciones_encoladas,
            )
        return resultado
    finally:
        db.close()


async def _bucle_cierre_jornada() -> None:
    intervalo = settings.cierre_jornada_intervalo_min * 60
    while True:
        try:
            await asyncio.to_thread(ejecutar_cierre_jornada)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error al ejecutar el cierre automático de jornada")
        await asyncio.sleep(intervalo)


def ejecutar_alertas_cierre() -> alerta_service.ResultadoGeneracion:
    """Genera las alertas del día una vez terminada la jornada escolar."""
    db = SessionLocal()
    try:
        return alerta_service.generar(db)
    finally:
        db.close()


async def _bucle_alertas_cierre() -> None:
    global _ultimo_dia_alertas
    intervalo = settings.cierre_jornada_intervalo_min * 60
    while True:
        try:
            ahora = qr_service.ahora_local()
            if (
                ahora.weekday() < 5
                and ahora.hour >= settings.alertas_cierre_hora
                and _ultimo_dia_alertas != ahora.date()
            ):
                resultado = await asyncio.to_thread(ejecutar_alertas_cierre)
                _ultimo_dia_alertas = ahora.date()
                logger.info(
                    "Alertas de cierre %s: %s alerta(s), %s curso(s) sin registro",
                    ahora.date(),
                    len(resultado.alertas),
                    len(resultado.cursos_sin_registro),
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error al generar las alertas de cierre del día")
        await asyncio.sleep(intervalo)


def iniciar() -> list[asyncio.Task[None]]:
    """Arranca las tareas programadas; devuelve las tareas para poder pararlas."""
    tareas: list[asyncio.Task[None]] = []

    if settings.cierre_jornada_automatico:
        tareas.append(
            asyncio.create_task(
                _bucle_cierre_jornada(), name="cierre-jornada"
            )
        )
        logger.info(
            "Cierre automático de jornada activo cada %s min",
            settings.cierre_jornada_intervalo_min,
        )
    else:
        logger.info("Cierre automático de jornada deshabilitado")

    if settings.alertas_cierre_automatico:
        tareas.append(
            asyncio.create_task(
                _bucle_alertas_cierre(), name="alertas-cierre"
            )
        )
        logger.info(
            "Alertas de cierre activas a partir de las %s:00",
            settings.alertas_cierre_hora,
        )
    else:
        logger.info("Alertas automáticas de cierre deshabilitadas")

    return tareas


async def detener(tareas: list[asyncio.Task[None]]) -> None:
    for tarea in tareas:
        tarea.cancel()
    if tareas:
        await asyncio.gather(*tareas, return_exceptions=True)
