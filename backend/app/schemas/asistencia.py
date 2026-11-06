"""DTOs de ``asistencia``.

Reglas validadas aquí:
- ``estado`` y ``origen`` pertenecen a los catálogos del esquema.
- ``minutos_retraso`` no puede ser negativo.
- Si llegan ``hora_ingreso`` y ``hora_salida``, la salida no puede ser menor.
"""

from __future__ import annotations

from datetime import date, datetime, time

from pydantic import Field, model_validator

from app.schemas.common import APIModel
from app.schemas.enums import EstadoAsistencia, OrigenAsistencia
from app.schemas.estudiante import EstudianteResumen
from app.schemas.horario import HorarioResponse


class AsistenciaBase(APIModel):
    estudiante_id: int = Field(gt=0)
    horario_id: int = Field(gt=0)
    fecha: date = Field(examples=["2026-10-25"])
    estado: EstadoAsistencia = Field(examples=["presente"])
    origen: OrigenAsistencia = Field(default=OrigenAsistencia.QR)
    hora_ingreso: datetime | None = None
    hora_salida: datetime | None = None
    minutos_retraso: int = Field(default=0, ge=0)
    registrado_por: int | None = Field(
        default=None, gt=0, description="Usuario que registró (docente o portería)"
    )

    @model_validator(mode="after")
    def validar_horas(self) -> "AsistenciaBase":
        if (
            self.hora_ingreso is not None
            and self.hora_salida is not None
            and self.hora_salida < self.hora_ingreso
        ):
            raise ValueError("hora_salida no puede ser anterior a hora_ingreso")
        return self


class AsistenciaCreate(AsistenciaBase):
    pass


class AsistenciaUpdate(APIModel):
    """Actualización parcial: solo se aplican los campos enviados."""

    estado: EstadoAsistencia | None = None
    hora_ingreso: datetime | None = None
    hora_salida: datetime | None = None
    minutos_retraso: int | None = Field(default=None, ge=0)
    registrado_por: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validar_horas(self) -> "AsistenciaUpdate":
        if (
            self.hora_ingreso is not None
            and self.hora_salida is not None
            and self.hora_salida < self.hora_ingreso
        ):
            raise ValueError("hora_salida no puede ser anterior a hora_ingreso")
        return self


class AsistenciaResponse(AsistenciaBase):
    id: int
    creado_en: datetime
    estudiante: EstudianteResumen | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )
    horario: HorarioResponse | None = Field(
        default=None, description="Se incluye cuando la relación está cargada"
    )


# --------------------------------------------------------------------------
# QR dinámico y escaneo
# --------------------------------------------------------------------------


class QrResponse(APIModel):
    """Código TOTP vigente del estudiante autenticado."""

    estudiante_id: int
    codigo: str = Field(description="8 dígitos TOTP")
    contenido: str = Field(description="Texto a dibujar en el QR: SESCO|ID|CODIGO")
    ventana: int = Field(description="Contador TOTP (epoch // ventana_seg)")
    ventana_seg: int
    expira_en: datetime
    segundos_restantes: int
    materia: str | None = Field(
        default=None, description="Materia del bloque de clase en curso"
    )
    profesor: str | None = Field(
        default=None,
        description="Nombre completo del profesor que dicta la clase en curso",
    )
    hora_inicio: time | None = Field(
        default=None, description="Hora de inicio del bloque en curso"
    )
    hora_fin: time | None = Field(
        default=None, description="Hora de fin del bloque en curso"
    )


class EscaneoRequest(APIModel):
    contenido: str = Field(
        min_length=1,
        max_length=120,
        examples=["SESCO|123|12345678"],
        description="Contenido leído del QR",
    )
    horario_id: int | None = Field(
        default=None,
        gt=0,
        description=(
            "Bloque a registrar. Si se omite, se deduce el bloque vigente del "
            "curso del estudiante (o el último que comenzó)."
        ),
    )


class AsistenciaManualCreate(APIModel):
    """Registro manual para estudiantes sin celular (``origen='manual'``)."""

    estudiante_id: int = Field(gt=0)
    horario_id: int | None = Field(
        default=None,
        gt=0,
        description=(
            "Bloque a registrar. Si se omite, se deduce el bloque vigente del "
            "curso del estudiante (o el último que comenzó)."
        ),
    )
    fecha: date | None = Field(
        default=None, description="Por defecto, la fecha actual del colegio"
    )
    estado: EstadoAsistencia | None = Field(
        default=None, description="Si se omite, se clasifica con la hora de ingreso"
    )
    hora_ingreso: datetime | None = Field(
        default=None, description="Por defecto, la hora actual (o el inicio del bloque)"
    )
    minutos_retraso: int | None = Field(default=None, ge=0)


class AsistenciaRegistroResponse(AsistenciaResponse):
    """Asistencia recién registrada + resultado de la cola de notificaciones."""

    notificacion_encolada: bool = False


class CierreBloqueRequest(APIModel):
    horario_id: int = Field(gt=0)
    fecha: date | None = Field(
        default=None, description="Por defecto, la fecha actual del colegio"
    )


class CierreBloqueResponse(APIModel):
    horario_id: int
    fecha: date
    faltas_registradas: int
    notificaciones_encoladas: int


# --------------------------------------------------------------------------
# Panel del estudiante autenticado
# --------------------------------------------------------------------------


class ResumenAsistenciaResponse(APIModel):
    """KPIs de asistencia del estudiante autenticado."""

    dias_presente: int = Field(
        ge=0,
        description="Días distintos con al menos un registro en estado 'presente'",
    )
    tardanzas: int = Field(ge=0, description="Registros en estado 'tardanza'")
    faltas: int = Field(ge=0, description="Registros en estado 'falta'")


class HistorialAsistenciaItem(APIModel):
    """Registro reciente del estudiante autenticado."""

    id: int
    fecha: date
    estado: EstadoAsistencia
    origen: OrigenAsistencia = Field(
        default=OrigenAsistencia.QR,
        description="Cómo se generó el registro: 'qr' o 'manual'",
    )
    materia: str | None = Field(
        default=None, description="Nombre de la materia del bloque"
    )
    hora_inicio: time | None = None
    hora_fin: time | None = None
    hora_ingreso: datetime | None = Field(
        default=None, description="Momento exacto en que se registró el ingreso"
    )
    minutos_retraso: int = Field(default=0, ge=0)
