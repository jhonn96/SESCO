"""Capa de negocio de la configuración de asistencia."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core import audit
from app.core.exceptions import NoEncontrado, ReglaNegocio
from app.models import ParametroAsistencia
from app.schemas.configuracion import ParametroAsistenciaUpdate


def obtener(db: Session) -> ParametroAsistencia:
    parametros = db.get(ParametroAsistencia, 1)
    if parametros is None:
        raise NoEncontrado(
            "No existe la configuración de asistencia (parametro_asistencia id=1)"
        )
    return parametros


def actualizar(
    db: Session,
    *,
    datos: ParametroAsistenciaUpdate,
    usuario_id: int,
    ip: str | None = None,
) -> ParametroAsistencia:
    """Actualiza la fila única y deja constancia en la bitácora."""
    parametros = obtener(db)
    cambios = datos.model_dump(exclude_unset=True)
    if not cambios:
        return parametros

    tolerancia = cambios.get("tolerancia_min", parametros.tolerancia_min)
    limite = cambios.get("limite_falta_min", parametros.limite_falta_min)
    if limite <= tolerancia:
        raise ReglaNegocio(
            "El límite de falta debe ser mayor que la tolerancia de minutos"
        )

    for campo, valor in cambios.items():
        setattr(parametros, campo, valor)

    parametros.actualizado_por = usuario_id
    parametros.actualizado_en = datetime.now(timezone.utc)

    audit.registrar(
        db,
        usuario_id=usuario_id,
        accion="ACTUALIZAR_PARAMETROS",
        entidad="parametro_asistencia",
        entidad_id=parametros.id,
        detalle={
            "campos": sorted(cambios),
            "tolerancia_min": parametros.tolerancia_min,
            "limite_falta_min": parametros.limite_falta_min,
            "umbral_alerta_faltas": parametros.umbral_alerta_faltas,
            "umbral_alerta_tardanzas": parametros.umbral_alerta_tardanzas,
            "umbral_inasistencia_pct": float(parametros.umbral_inasistencia_pct),
        },
        ip=ip,
    )
    db.commit()
    db.refresh(parametros)
    return parametros
