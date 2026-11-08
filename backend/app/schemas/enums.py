"""Enumeraciones de dominio de SESCO.

Los valores coinciden exactamente con los ``CHECK`` y catálogos definidos en
``sesco_db.sql`` (la base de datos es la fuente de verdad). Al heredar de
``str``, se serializan como texto plano en JSON y se comparan con cadenas.
"""

from __future__ import annotations

from enum import Enum


class RolNombre(str, Enum):
    """Catálogo ``rol.nombre`` (ids fijos 1..4)."""

    DIRECTOR = "director"
    PROFESOR = "profesor"
    ESTUDIANTE = "estudiante"
    TUTOR = "tutor"


#: Ids del catálogo ``rol`` documentados en ``sesco_db.sql``.
IDS_ROL: dict[RolNombre, int] = {
    RolNombre.DIRECTOR: 1,
    RolNombre.PROFESOR: 2,
    RolNombre.ESTUDIANTE: 3,
    RolNombre.TUTOR: 4,
}


class EstadoAsistencia(str, Enum):
    """Estados posibles de ``asistencia.estado``.

    ``tardanza`` cubre el rango de 11 a 30 minutos de retraso según
    ``parametro_asistencia.tolerancia_min`` y ``limite_falta_min``.
    """

    PRESENTE = "presente"
    TARDANZA = "tardanza"
    FALTA = "falta"
    JUSTIFICADA = "justificada"


class OrigenAsistencia(str, Enum):
    """Cómo se generó el registro de asistencia (``asistencia.origen``)."""

    QR = "qr"
    MANUAL = "manual"


class NivelCurso(str, Enum):
    """Niveles educativos admitidos en ``curso.nivel``."""

    INICIAL = "inicial"
    PRIMARIA = "primaria"
    SECUNDARIA = "secundaria"


class Turno(str, Enum):
    """Turnos de clase admitidos en ``curso.turno``."""

    MANANA = "manana"
    TARDE = "tarde"
    NOCHE = "noche"


class DiaSemana(str, Enum):
    """Días hábiles admitidos en ``horario.dia_semana``."""

    LUNES = "lunes"
    MARTES = "martes"
    MIERCOLES = "miercoles"
    JUEVES = "jueves"
    VIERNES = "viernes"


class Parentesco(str, Enum):
    """Valores de ``tutoria.parentesco``."""

    PADRE = "Padre"
    MADRE = "Madre"
    ABUELO_A = "Abuelo/a"
    TUTOR_LEGAL = "Tutor legal"


class EstadoTutoria(str, Enum):
    """Ciclo de vida del vínculo en ``tutoria.estado``.

    RD-02: el vínculo nace ``pendiente`` y solo el Director puede dejarlo en
    ``confirmada``. ``baja`` es la eliminación lógica.
    """

    PENDIENTE = "pendiente"
    CONFIRMADA = "confirmada"
    BAJA = "baja"


class TipoAlerta(str, Enum):
    """Valores admitidos en ``alerta.tipo`` (RF-06/RF-07)."""

    FALTAS = "faltas"
    TARDANZAS = "tardanzas"
    INASISTENCIA = "inasistencia"
    CURSO_SIN_REGISTRO = "curso_sin_registro"


class EstadoJustificacion(str, Enum):
    """Ciclo de vida de ``justificacion.estado`` (RF-09)."""

    PENDIENTE = "pendiente"
    APROBADA = "aprobada"
    RECHAZADA = "rechazada"


class TipoAviso(str, Enum):
    """Valores admitidos en ``aviso.tipo`` (RF-10)."""

    GENERAL = "general"
    CITACION = "citacion"
    URGENTE = "urgente"
