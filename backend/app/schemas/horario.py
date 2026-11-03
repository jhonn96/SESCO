"""DTOs de ``horario`` (bloque de clase de un curso).

El servicio valida además:
- ``hora_fin > hora_inicio`` usando los valores combinados del PATCH.
- Que no se solape con otro bloque del **mismo curso y mismo día**.
- Que exista como máximo un ``es_ultimo_bloque`` por curso y día.
"""

from __future__ import annotations

from datetime import time

from pydantic import Field, model_validator

from app.schemas.common import APIModel
from app.schemas.curso import CursoResponse
from app.schemas.enums import DiaSemana
from app.schemas.materia import MateriaResponse


class HorarioBase(APIModel):
    curso_id: int = Field(gt=0)
    materia_id: int = Field(gt=0)
    dia_semana: DiaSemana = Field(
        default=DiaSemana.LUNES,
        description="Día de la grilla semanal (lunes a viernes)",
        examples=["lunes"],
    )
    hora_inicio: time = Field(examples=["08:00:00"])
    hora_fin: time = Field(examples=["09:30:00"])
    es_ultimo_bloque: bool = Field(
        default=False,
        description="Cierra la jornada de ese día; se usa para la hora de salida",
    )

    @model_validator(mode="after")
    def validar_horas(self) -> "HorarioBase":
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("hora_fin debe ser posterior a hora_inicio")
        return self


class HorarioCreate(HorarioBase):
    pass


class HorarioUpdate(APIModel):
    """Actualización parcial; el servicio revalida el rango combinado."""

    curso_id: int | None = Field(default=None, gt=0)
    materia_id: int | None = Field(default=None, gt=0)
    dia_semana: DiaSemana | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    es_ultimo_bloque: bool | None = None


class HorarioResponse(HorarioBase):
    id: int
    materia: MateriaResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
    curso: CursoResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


class ClaseActualResponse(APIModel):
    """Bloque que el docente está dictando en este momento.

    ``en_clase`` es ``False`` cuando el profesor no tiene ningún bloque en
    curso; en ese caso ``bloque`` es ``null`` y los contadores quedan en cero.
    """

    en_clase: bool = Field(
        description="True si el docente tiene un bloque en curso ahora"
    )
    bloque: HorarioResponse | None = Field(
        default=None, description="Bloque en curso, con su curso y materia"
    )
    registrados: int = Field(
        default=0, ge=0, description="Asistencias registradas hoy en el bloque"
    )
    total_estudiantes: int = Field(
        default=0, ge=0, description="Estudiantes matriculados en el curso"
    )


# --------------------------------------------------------------------------
# Horario del estudiante autenticado
# --------------------------------------------------------------------------


class BloqueHorarioResponse(APIModel):
    """Bloque de clase con el nombre de su materia ya resuelto."""

    id: int
    dia_semana: DiaSemana
    hora_inicio: time = Field(examples=["08:00:00"])
    hora_fin: time = Field(examples=["08:45:00"])
    es_ultimo_bloque: bool = False
    materia: str | None = Field(default=None, description="Nombre de la materia")


class HorarioEstudianteResponse(APIModel):
    """Grilla semanal del curso al que pertenece el estudiante."""

    curso: CursoResponse | None = Field(
        default=None, description="Curso del estudiante; puede faltar si no está cargado"
    )
    bloques: list[BloqueHorarioResponse]
