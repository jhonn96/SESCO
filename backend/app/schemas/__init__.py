"""Esquemas Pydantic (DTOs) de SESCO."""

from app.schemas.alerta import (
    AlertaResponse,
    GeneracionAlertasResponse,
    ReporteInasistenciaResponse,
)
from app.schemas.asistencia import (
    AsistenciaCreate,
    AsistenciaManualCreate,
    AsistenciaRegistroResponse,
    AsistenciaResponse,
    AsistenciaUpdate,
    CierreBloqueRequest,
    CierreBloqueResponse,
    EscaneoRequest,
    QrResponse,
)
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.auditoria import BitacoraResponse, BitacoraUsuarioResponse
from app.schemas.aviso import (
    AvisoCreate,
    AvisoDestinatarioResponse,
    AvisoResponse,
    AvisoUpdate,
)
from app.schemas.common import APIModel, HealthResponse
from app.schemas.curso import CursoCreate, CursoResponse, CursoUpdate
from app.schemas.enums import (
    DiaSemana,
    EstadoAsistencia,
    EstadoJustificacion,
    EstadoTutoria,
    IDS_ROL,
    NivelCurso,
    OrigenAsistencia,
    Parentesco,
    RolNombre,
    TipoAlerta,
    TipoAviso,
    Turno,
)
from app.schemas.estudiante import (
    EstudianteCreate,
    EstudianteResponse,
    EstudianteResumen,
    EstudianteUpdate,
)
from app.schemas.horario import HorarioCreate, HorarioResponse, HorarioUpdate
from app.schemas.justificacion import (
    JustificacionCreate,
    JustificacionResolucion,
    JustificacionResponse,
)
from app.schemas.materia import MateriaCreate, MateriaResponse, MateriaUpdate
from app.schemas.periodo import PeriodoCreate, PeriodoResponse, PeriodoUpdate
from app.schemas.reporte import (
    CursoPanel,
    PanelAsistenciaResponse,
    ResumenEstados,
)
from app.schemas.rol import RolCreate, RolResponse, RolUpdate
from app.schemas.tutor import TutorCreate, TutorResponse, TutorUpdate
from app.schemas.tutoria import TutoriaCreate, TutoriaResponse, TutoriaUpdate
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, UsuarioUpdate

__all__ = [
    "APIModel",
    "AlertaResponse",
    "AsistenciaCreate",
    "AsistenciaManualCreate",
    "AsistenciaRegistroResponse",
    "AsistenciaResponse",
    "AsistenciaUpdate",
    "AvisoCreate",
    "AvisoDestinatarioResponse",
    "AvisoResponse",
    "AvisoUpdate",
    "BitacoraResponse",
    "BitacoraUsuarioResponse",
    "CierreBloqueRequest",
    "CierreBloqueResponse",
    "CursoCreate",
    "CursoPanel",
    "CursoResponse",
    "CursoUpdate",
    "DiaSemana",
    "EscaneoRequest",
    "EstadoAsistencia",
    "EstadoJustificacion",
    "EstadoTutoria",
    "EstudianteCreate",
    "EstudianteResponse",
    "EstudianteResumen",
    "EstudianteUpdate",
    "GeneracionAlertasResponse",
    "HealthResponse",
    "HorarioCreate",
    "HorarioResponse",
    "HorarioUpdate",
    "IDS_ROL",
    "JustificacionCreate",
    "JustificacionResolucion",
    "JustificacionResponse",
    "LoginRequest",
    "MateriaCreate",
    "MateriaResponse",
    "MateriaUpdate",
    "NivelCurso",
    "OrigenAsistencia",
    "PanelAsistenciaResponse",
    "Parentesco",
    "PeriodoCreate",
    "PeriodoResponse",
    "PeriodoUpdate",
    "QrResponse",
    "ReporteInasistenciaResponse",
    "ResumenEstados",
    "RolCreate",
    "RolNombre",
    "RolResponse",
    "RolUpdate",
    "TipoAlerta",
    "TipoAviso",
    "TokenResponse",
    "Turno",
    "TutorCreate",
    "TutorResponse",
    "TutorUpdate",
    "TutoriaCreate",
    "TutoriaResponse",
    "TutoriaUpdate",
    "UsuarioCreate",
    "UsuarioResponse",
    "UsuarioUpdate",
]
