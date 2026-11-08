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


class CierreJornadaResponse(APIModel):
    """Resultado del cierre automático de jornada (salidas sin escaneo)."""

    fecha: date
    bloques_procesados: int
    salidas_registradas: int
    notificaciones_encoladas: int


class SalidaManualRequest(APIModel):
    """Salida manual de un registro; si se omite, se usa la hora actual."""

    hora_salida: time | None = Field(
        default=None,
        description=(
            "Hora de salida (HH:MM o HH:MM:SS). Si se omite, se usa la hora "
            "actual del colegio."
        ),
        examples=["14:35"],
    )


class SalidaMasivaRequest(APIModel):
    """Salida de todos los presentes de un curso en la fecha actual."""

    curso_id: int = Field(gt=0)
    hora_salida: time | None = Field(
        default=None,
        description=(
            "Hora de salida (HH:MM o HH:MM:SS). Si se omite, se usa la hora "
            "actual del colegio."
        ),
        examples=["14:35"],
    )


class SalidaProgramadaRequest(APIModel):
    """Salida especial con el motivo que recibirán los tutores.

    El alcance se indica de una sola forma:
    - ``todos=true``: todos los cursos del colegio.
    - ``curso_ids``: una selección múltiple de cursos.
    - ``curso_id``: un único curso (compatibilidad con el flujo anterior).
    """

    curso_id: int | None = Field(
        default=None,
        gt=0,
        description="Curso único (compatibilidad con el flujo anterior)",
    )
    curso_ids: list[int] | None = Field(
        default=None,
        min_length=1,
        description="Cursos seleccionados para la salida masiva",
    )
    todos: bool = Field(
        default=False,
        description="Si es true, aplica a todos los cursos del colegio",
    )
    hora_salida: time | None = Field(
        default=None,
        description=(
            "Hora de salida (HH:MM o HH:MM:SS). Si se omite, se usa la hora "
            "actual del colegio."
        ),
        examples=["14:35"],
    )
    motivo: str = Field(
        min_length=3,
        max_length=200,
        description="Motivo de la salida especial (simulacro, feriado, etc.)",
        examples=["Simulacro de evacuación"],
    )

    @model_validator(mode="after")
    def validar_alcance(self) -> "SalidaProgramadaRequest":
        if self.todos:
            if self.curso_id is not None or self.curso_ids:
                raise ValueError(
                    "Usa 'todos' o una selección de cursos, no ambos."
                )
            return self

        if self.curso_ids is not None:
            if self.curso_id is not None:
                raise ValueError(
                    "Indica 'curso_id' o 'curso_ids', no ambos."
                )
            if any(curso_id <= 0 for curso_id in self.curso_ids):
                raise ValueError("Los IDs de curso deben ser positivos.")
            return self

        if self.curso_id is None:
            raise ValueError(
                "Indica 'curso_id', 'curso_ids' o 'todos=true'."
            )
        return self

    @property
    def cursos_objetivo(self) -> list[int] | None:
        """IDs de curso solicitados; ``None`` significa todos."""
        if self.todos:
            return None
        if self.curso_ids is not None:
            return sorted(set(self.curso_ids))
        return [self.curso_id] if self.curso_id is not None else []


class SalidaMasivaResponse(APIModel):
    """Resultado de registrar la salida de un curso completo."""

    curso_id: int
    fecha: date
    hora_salida: datetime
    estudiantes: int = Field(
        ge=0, description="Estudiantes a los que se les registró la salida"
    )
    salidas_registradas: int = Field(
        ge=0, description="Registros de asistencia actualizados"
    )
    notificaciones_encoladas: int = Field(ge=0)


class SalidaProgramadaResponse(APIModel):
    """Resultado de una salida programada de uno o varios cursos."""

    fecha: date
    hora_salida: datetime
    cursos: int = Field(
        ge=0, description="Cursos con estudiantes a los que se registró la salida"
    )
    curso_ids: list[int] = Field(
        default_factory=list,
        description="IDs de los cursos efectivamente actualizados",
    )
    estudiantes: int = Field(
        ge=0, description="Estudiantes a los que se les registró la salida"
    )
    salidas_registradas: int = Field(
        ge=0, description="Registros de asistencia actualizados"
    )
    notificaciones_encoladas: int = Field(ge=0)


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
