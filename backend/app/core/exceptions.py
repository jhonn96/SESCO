"""Errores de dominio y traducción de restricciones de PostgreSQL.

Los servicios lanzan estas excepciones sin conocer HTTP; ``main.py`` las
convierte en respuestas JSON mediante un ``exception_handler`` global.
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError


class ErrorDominio(Exception):
    """Error de negocio con un código HTTP asociado."""

    status_code = 400

    def __init__(self, detalle: str) -> None:
        self.detalle = detalle
        super().__init__(detalle)


class NoEncontrado(ErrorDominio):
    status_code = 404


class Conflicto(ErrorDominio):
    status_code = 409


class ReglaNegocio(ErrorDominio):
    status_code = 422


class Prohibido(ErrorDominio):
    status_code = 403


def traducir_integridad(
    exc: IntegrityError,
    *,
    duplicado: str,
    referencia: str,
) -> ErrorDominio:
    """Convierte un ``IntegrityError`` en un error legible.

    Usa el SQLSTATE de psycopg2: 23505 = UNIQUE, 23503 = FOREIGN KEY,
    23514 = CHECK.
    """
    codigo = getattr(exc.orig, "pgcode", None)
    if codigo == "23505":
        return Conflicto(duplicado)
    if codigo == "23503":
        return Conflicto(referencia)
    if codigo == "23514":
        return ReglaNegocio("Los datos no cumplen una restricción del esquema")
    return Conflicto("No se pudo completar la operación por una restricción de la base de datos")
