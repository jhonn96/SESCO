"""Punto de entrada de la API SESCO.

Ejecutar en desarrollo::

    uvicorn app.main:app --reload

Documentación interactiva: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api import auth as auth_router
from app.api import alertas as alertas_router
from app.api import asistencia as asistencia_router
from app.api import auditoria as auditoria_router
from app.api import avisos as avisos_router
from app.api import configuracion as configuracion_router
from app.api import cursos as cursos_router
from app.api import estudiantes as estudiantes_router
from app.api import horarios as horarios_router
from app.api import justificaciones as justificaciones_router
from app.api import materias as materias_router
from app.api import notificaciones as notificaciones_router
from app.api import periodos as periodos_router
from app.api import profesor_curso as profesor_curso_router
from app.api import profesores as profesores_router
from app.api import reportes as reportes_router
from app.api import roles as roles_router
from app.api import tutorias as tutorias_router
from app.api import tutores as tutores_router
from app.api import usuarios as usuarios_router
from app import scheduler
from app.core import realtime
from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import ErrorDominio
from app.schemas.common import HealthResponse

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Avisa de configuraciones inseguras, arranca tareas y cierra el pool."""
    if settings.jwt_secret == "cambiar-en-produccion":
        logger.warning(
            "JWT_SECRET sigue con el valor por defecto; configure uno propio en backend/.env"
        )
    realtime.gestor.vincular_loop(asyncio.get_running_loop())
    tareas = scheduler.iniciar()
    try:
        yield
    finally:
        realtime.gestor.desvincular_loop()
        await scheduler.detener(tareas)
        engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "API de SESCO: gestión de asistencia escolar con QR dinámico (TOTP). "
        "Arquitectura multicapa: Presentación -> Negocio -> Datos."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Los listados paginados devuelven el total en esta cabecera.
    expose_headers=["X-Total-Count"],
)

# --- Routers ---
app.include_router(
    auth_router.router,
    prefix=f"{settings.api_prefix}/auth",
    tags=["Autenticación"],
)
app.include_router(
    roles_router.router,
    prefix=f"{settings.api_prefix}/roles",
    tags=["Roles"],
)
app.include_router(
    usuarios_router.router,
    prefix=f"{settings.api_prefix}/usuarios",
    tags=["Usuarios"],
)
app.include_router(
    cursos_router.router,
    prefix=f"{settings.api_prefix}/cursos",
    tags=["Cursos"],
)
app.include_router(
    estudiantes_router.router,
    prefix=f"{settings.api_prefix}/estudiantes",
    tags=["Estudiantes"],
)
app.include_router(
    profesores_router.router,
    prefix=f"{settings.api_prefix}/profesores",
    tags=["Profesores"],
)
app.include_router(
    profesor_curso_router.router,
    prefix=f"{settings.api_prefix}/profesor_curso",
    tags=["Asignaciones"],
)
app.include_router(
    tutorias_router.router,
    prefix=f"{settings.api_prefix}/tutorias",
    tags=["Tutorías"],
)
app.include_router(
    tutores_router.router,
    prefix=f"{settings.api_prefix}/tutores",
    tags=["Tutores"],
)
app.include_router(
    periodos_router.router,
    prefix=f"{settings.api_prefix}/periodos",
    tags=["Periodos"],
)
app.include_router(
    materias_router.router,
    prefix=f"{settings.api_prefix}/materias",
    tags=["Materias"],
)
app.include_router(
    horarios_router.router,
    prefix=f"{settings.api_prefix}/horarios",
    tags=["Horarios"],
)
app.include_router(
    asistencia_router.router,
    prefix=f"{settings.api_prefix}/asistencia",
    tags=["Asistencia"],
)
app.include_router(
    alertas_router.router,
    prefix=f"{settings.api_prefix}/alertas",
    tags=["Alertas"],
)
app.include_router(
    auditoria_router.router,
    prefix=f"{settings.api_prefix}/auditoria",
    tags=["Auditoría"],
)
app.include_router(
    reportes_router.router,
    prefix=f"{settings.api_prefix}/reportes",
    tags=["Reportes"],
)
app.include_router(
    justificaciones_router.router,
    prefix=f"{settings.api_prefix}/justificaciones",
    tags=["Justificaciones"],
)
app.include_router(
    avisos_router.router,
    prefix=f"{settings.api_prefix}/avisos",
    tags=["Avisos"],
)
app.include_router(
    configuracion_router.router,
    prefix=f"{settings.api_prefix}/configuracion",
    tags=["Configuración"],
)
app.include_router(
    notificaciones_router.router,
    prefix=f"{settings.api_prefix}/notificaciones",
    tags=["Notificaciones"],
)


@app.exception_handler(ErrorDominio)
async def manejar_error_dominio(request: Request, exc: ErrorDominio) -> JSONResponse:
    """Traduce los errores de negocio a HTTP sin acoplar los servicios."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detalle})


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Sistema"],
    summary="Estado del servicio y de la base de datos",
    responses={503: {"model": HealthResponse, "description": "Base de datos inaccesible"}},
)
def health(response: Response) -> HealthResponse:
    """Comprueba que la API responde y que PostgreSQL acepta una consulta."""
    overall: Literal["ok", "error"] = "ok"
    database = "ok"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        overall = "error"
        database = f"error: {type(exc).__name__}"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status=overall,
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database,
    )
