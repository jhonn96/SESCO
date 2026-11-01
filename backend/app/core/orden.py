"""Criterio de ordenamiento de personas para las listas del colegio.

En el contexto escolar las listas se ordenan por apellido paterno, apellido
materno y, por último, nombres. El campo ``usuario.apellidos`` guarda ambos
apellidos separados por un espacio, por lo que se dividen con ``split_part``
de PostgreSQL.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func

from app.models import Usuario


def orden_persona() -> tuple[Any, ...]:
    """Cláusulas ``ORDER BY``: apellido paterno, materno y nombres.

    La comparación es insensible a mayúsculas y usa ``usuario.id`` como
    desempate para que la paginación sea estable entre consultas.
    """
    apellidos = func.btrim(Usuario.apellidos)
    return (
        func.lower(func.split_part(apellidos, " ", 1)),
        func.lower(func.split_part(apellidos, " ", 2)),
        func.lower(func.btrim(Usuario.nombres)),
        Usuario.id,
    )
