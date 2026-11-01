"""DTOs de ``tutor`` (perfil 1:1 de ``usuario`` con rol tutor).

Además del perfil administrativo, incluye los DTO del **panel del tutor**:
la lista de sus hijos confirmados, el historial de asistencia con la
justificación asociada y el curso al que pertenece cada estudiante.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.asistencia import HistorialAsistenciaItem
from app.schemas.common import APIModel
from app.schemas.enums import EstadoJustificacion, NivelCurso, Turno
from app.schemas.usuario import UsuarioResponse


class TutorBase(APIModel):
    telefono: str = Field(
        min_length=7,
        max_length=20,
        pattern=r"^[0-9+\-\s()]+$",
        examples=["71234567"],
    )


class TutorCreate(TutorBase):
    usuario_id: int = Field(
        gt=0, description="Usuario existente con rol 'tutor' (relación 1:1)"
    )


class TutorUpdate(APIModel):
    telefono: str | None = Field(
        default=None, min_length=7, max_length=20, pattern=r"^[0-9+\-\s()]+$"
    )


class TutorResponse(TutorBase):
    usuario_id: int
    usuario: UsuarioResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


# --------------------------------------------------------------------------
# Panel del tutor autenticado
# --------------------------------------------------------------------------


class CursoHijo(APIModel):
    """Datos mínimos del curso para identificar al hijo en el selector."""

    id: int
    nivel: NivelCurso
    grado: int
    paralelo: str
    turno: Turno


class HijoResponse(APIModel):
    """Estudiante con vínculo **confirmado** con el tutor autenticado."""

    usuario_id: int
    nombres: str
    apellidos: str
    ci: str
    parentesco: str = Field(examples=["Madre"])
    es_principal: bool = False
    curso: CursoHijo | None = Field(
        default=None, description="Curso del estudiante; puede faltar si no está cargado"
    )
    notificaciones_pendientes: int = Field(
        default=0,
        ge=0,
        description=(
            "Notificaciones de asistencia sin leer del tutor para este hijo"
        ),
    )
    faltas_recientes: int = Field(
        default=0,
        ge=0,
        description="Faltas y tardanzas registradas en los últimos 7 días",
    )


class JustificacionBreve(APIModel):
    """Justificación asociada a un registro de asistencia."""

    id: int
    estado: EstadoJustificacion
    motivo: str


class HistorialTutorItem(HistorialAsistenciaItem):
    """Registro de asistencia del hijo con su justificación, si ya existe."""

    justificacion: JustificacionBreve | None = None
