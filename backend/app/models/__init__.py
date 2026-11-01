"""Modelos ORM de SESCO.

Importar este paquete registra las 20 tablas en ``Base.metadata`` y resuelve
todas las relaciones. Cualquier módulo que use los modelos debe importar
``app.models`` (directa o indirectamente) antes de mapear.
"""

from app.models.alerta import Alerta
from app.models.asistencia import Asistencia
from app.models.aviso import Aviso
from app.models.aviso_destinatario import AvisoDestinatario
from app.models.bitacora import Bitacora
from app.models.curso import Curso
from app.models.estudiante import Estudiante
from app.models.horario import Horario
from app.models.justificacion import Justificacion
from app.models.materia import Materia
from app.models.notificacion import Notificacion
from app.models.parametro_asistencia import ParametroAsistencia
from app.models.periodo import Periodo
from app.models.profesor import Profesor
from app.models.profesor_curso import ProfesorCurso
from app.models.qr_uso import QrUso
from app.models.rol import Rol
from app.models.tutoria import Tutoria
from app.models.tutor import Tutor
from app.models.usuario import Usuario

__all__ = [
    "Alerta",
    "Asistencia",
    "Aviso",
    "AvisoDestinatario",
    "Bitacora",
    "Curso",
    "Estudiante",
    "Horario",
    "Justificacion",
    "Materia",
    "Notificacion",
    "ParametroAsistencia",
    "Periodo",
    "Profesor",
    "ProfesorCurso",
    "QrUso",
    "Rol",
    "Tutoria",
    "Tutor",
    "Usuario",
]
