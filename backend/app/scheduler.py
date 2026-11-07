"""Tareas programadas dentro del proceso de la API.

No se agrega una dependencia externa (APScheduler/cron): un único
``asyncio.Task`` despierta cada ``CIERRE_JORNADA_INTERVALO_MIN`` minutos y
ejecuta el cierre de jornada en un hilo aparte, porque SQLAlchemy es síncrono
y no debe bloquear el event loop de FastAPI.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.services import jornada_service

logger = logging.getLogger(__name__)


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


def iniciar() -> list[asyncio.Task[None]]:
    """Arranca las tareas programadas; devuelve las tareas para poder pararlas."""
    if not settings.cierre_jornada_automatico:
        logger.info("Cierre automático de jornada deshabilitado")
        return []

    tarea = asyncio.create_task(_bucle_cierre_jornada(), name="cierre-jornada")
    logger.info(
        "Cierre automático de jornada activo cada %s min",
        settings.cierre_jornada_intervalo_min,
    )
    return [tarea]


async def detener(tareas: list[asyncio.Task[None]]) -> None:
    for tarea in tareas:
        tarea.cancel()
    if tareas:
        await asyncio.gather(*tareas, return_exceptions=True)
