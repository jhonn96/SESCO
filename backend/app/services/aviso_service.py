"""Capa de negocio de avisos y citaciones (RF-10).

Reglas
------
- Publican y editan el **Director** y los **Profesores**; el autor solo puede
  modificar/eliminar lo suyo, el Director puede gestionar cualquier aviso.
- La audiencia son **tutores y profesores activos**. Si ``destinatarios`` se
  omite, el aviso se difunde a todos; las **citaciones** exigen destinatarios
  explícitos.
- Al publicar se crea una fila ``aviso_destinatario`` por destinatario con
  ``entregado_en``; el destinatario marca ``leido_en`` y ``confirmado_en``.
- Un tutor solo ve los avisos dirigidos a él y no puede leer/confirmar los
  ajenos.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core import audit
from app.core.exceptions import Conflicto, NoEncontrado, Prohibido, ReglaNegocio
from app.models import Aviso, AvisoDestinatario, Usuario
from app.schemas.aviso import (
    AvisoCreate,
    AvisoDestinatarioResponse,
    AvisoResponse,
    AvisoUpdate,
)
from app.schemas.enums import IDS_ROL, RolNombre, TipoAviso
from app.services import qr_service

ROLES_AUDIENCIA = (IDS_ROL[RolNombre.TUTOR], IDS_ROL[RolNombre.PROFESOR])


# --------------------------------------------------------------------------
# Consultas auxiliares
# --------------------------------------------------------------------------


def _es_tutor(usuario: Usuario) -> bool:
    return usuario.rol_id == IDS_ROL[RolNombre.TUTOR]


def _es_director(usuario: Usuario) -> bool:
    return usuario.rol_id == IDS_ROL[RolNombre.DIRECTOR]


def _estadisticas(
    db: Session, aviso_ids: list[int]
) -> dict[int, tuple[int, int, int]]:
    """``aviso_id -> (total destinatarios, leídos, confirmados)``."""
    if not aviso_ids:
        return {}
    filas = db.execute(
        select(
            Aviso.id,
            func.count(AvisoDestinatario.usuario_id),
            func.count(AvisoDestinatario.leido_en),
            func.count(AvisoDestinatario.confirmado_en),
        )
        .outerjoin(AvisoDestinatario, AvisoDestinatario.aviso_id == Aviso.id)
        .where(Aviso.id.in_(aviso_ids))
        .group_by(Aviso.id)
    ).all()
    return {
        aviso_id: (int(total), int(leidos), int(confirmados))
        for aviso_id, total, leidos, confirmados in filas
    }


def _dto(
    aviso: Aviso,
    *,
    estadisticas: tuple[int, int, int] | None = None,
    destinatarios: list[AvisoDestinatario] | None = None,
) -> AvisoResponse:
    total, leidos, confirmados = estadisticas or (0, 0, 0)
    return AvisoResponse(
        id=aviso.id,
        autor_id=aviso.autor_id,
        titulo=aviso.titulo,
        contenido=aviso.contenido,
        tipo=aviso.tipo,
        importante=aviso.importante,
        fecha_cita=aviso.fecha_cita,
        publicado_en=aviso.publicado_en,
        autor=aviso.autor,
        destinatarios=[
            AvisoDestinatarioResponse.model_validate(destinatario)
            for destinatario in (destinatarios or [])
        ],
        total_destinatarios=total,
        leidos=leidos,
        confirmados=confirmados,
    )


def _cargar(db: Session, aviso_id: int) -> Aviso:
    aviso = db.scalar(
        select(Aviso)
        .options(joinedload(Aviso.autor).joinedload(Usuario.rol))
        .where(Aviso.id == aviso_id)
    )
    if aviso is None:
        raise NoEncontrado(f"No existe el aviso {aviso_id}")
    return aviso


# --------------------------------------------------------------------------
# Publicación
# --------------------------------------------------------------------------


def _resolver_destinatarios(
    db: Session, datos: AvisoCreate
) -> list[int]:
    """Valida los ids indicados o calcula la audiencia completa."""
    if datos.destinatarios:
        ids = sorted(set(datos.destinatarios))
        validos = set(
            db.scalars(
                select(Usuario.id).where(
                    Usuario.id.in_(ids),
                    Usuario.activo.is_(True),
                    Usuario.rol_id.in_(ROLES_AUDIENCIA),
                )
            )
        )
        invalidos = [usuario_id for usuario_id in ids if usuario_id not in validos]
        if invalidos:
            raise ReglaNegocio(
                "Los destinatarios deben ser usuarios activos con rol tutor o "
                f"profesor; inválidos: {invalidos}"
            )
        return ids

    if datos.tipo == TipoAviso.CITACION:
        raise ReglaNegocio("Una citación requiere destinatarios explícitos")

    return list(
        db.scalars(
            select(Usuario.id)
            .where(
                Usuario.activo.is_(True),
                Usuario.rol_id.in_(ROLES_AUDIENCIA),
            )
            .order_by(Usuario.id)
        )
    )


def crear(
    db: Session,
    *,
    datos: AvisoCreate,
    autor: Usuario,
    ip: str | None = None,
) -> AvisoResponse:
    destinatarios = _resolver_destinatarios(db, datos)
    aviso = Aviso(
        autor_id=autor.id,
        titulo=datos.titulo,
        contenido=datos.contenido,
        tipo=datos.tipo.value,
        importante=datos.importante,
        fecha_cita=datos.fecha_cita,
    )
    db.add(aviso)
    db.flush()

    entregado = qr_service.ahora_local()
    for usuario_id in destinatarios:
        db.add(
            AvisoDestinatario(
                aviso_id=aviso.id,
                usuario_id=usuario_id,
                entregado_en=entregado,
            )
        )

    audit.registrar(
        db,
        usuario_id=autor.id,
        accion="PUBLICAR_AVISO",
        entidad="aviso",
        entidad_id=aviso.id,
        detalle={
            "tipo": aviso.tipo,
            "importante": aviso.importante,
            "destinatarios": len(destinatarios),
        },
        ip=ip,
    )
    db.commit()
    return obtener(db, aviso.id, usuario=autor)


# --------------------------------------------------------------------------
# Edición y borrado
# --------------------------------------------------------------------------


def _validar_gestion(aviso: Aviso, usuario: Usuario) -> None:
    if not _es_director(usuario) and aviso.autor_id != usuario.id:
        raise Prohibido("Solo el autor del aviso o un Director puede modificarlo")


def actualizar(
    db: Session,
    *,
    aviso_id: int,
    datos: AvisoUpdate,
    usuario: Usuario,
    ip: str | None = None,
) -> AvisoResponse:
    aviso = _cargar(db, aviso_id)
    _validar_gestion(aviso, usuario)

    cambios: dict[str, Any] = datos.model_dump(exclude_unset=True)
    tipo = cambios.get("tipo", aviso.tipo)
    fecha_cita = cambios.get("fecha_cita", aviso.fecha_cita)
    if tipo == TipoAviso.CITACION.value and fecha_cita is None:
        raise ReglaNegocio("Una citación requiere fecha_cita")

    for campo, valor in cambios.items():
        if campo == "tipo":
            valor = valor.value
        setattr(aviso, campo, valor)

    audit.registrar(
        db,
        usuario_id=usuario.id,
        accion="ACTUALIZAR_AVISO",
        entidad="aviso",
        entidad_id=aviso.id,
        detalle={"campos": sorted(cambios)},
        ip=ip,
    )
    db.commit()
    return obtener(db, aviso.id, usuario=usuario)


def eliminar(
    db: Session,
    *,
    aviso_id: int,
    usuario: Usuario,
    ip: str | None = None,
) -> None:
    aviso = _cargar(db, aviso_id)
    _validar_gestion(aviso, usuario)
    titulo = aviso.titulo

    # No hay ON DELETE CASCADE en el esquema: se borran primero las entregas.
    db.execute(
        delete(AvisoDestinatario).where(AvisoDestinatario.aviso_id == aviso.id)
    )
    db.delete(aviso)
    audit.registrar(
        db,
        usuario_id=usuario.id,
        accion="ELIMINAR_AVISO",
        entidad="aviso",
        entidad_id=aviso.id,
        detalle={"titulo": titulo},
        ip=ip,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El aviso tiene entregas registradas y no puede eliminarse"
        ) from exc


# --------------------------------------------------------------------------
# Consulta
# --------------------------------------------------------------------------


def listar(
    db: Session,
    *,
    usuario: Usuario,
    tipo: TipoAviso | None = None,
    importante: bool | None = None,
    solo_mios: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[AvisoResponse], int]:
    tutor = _es_tutor(usuario)
    bandeja = tutor or solo_mios

    condiciones: list[Any] = []
    if tipo is not None:
        condiciones.append(Aviso.tipo == tipo.value)
    if importante is not None:
        condiciones.append(Aviso.importante.is_(importante))

    base = select(Aviso).options(joinedload(Aviso.autor).joinedload(Usuario.rol))
    conteo = select(func.count()).select_from(Aviso)
    if bandeja:
        base = base.join(
            AvisoDestinatario, AvisoDestinatario.aviso_id == Aviso.id
        ).where(AvisoDestinatario.usuario_id == usuario.id)
        conteo = conteo.join(
            AvisoDestinatario, AvisoDestinatario.aviso_id == Aviso.id
        ).where(AvisoDestinatario.usuario_id == usuario.id)
        # Solo la entrega del usuario actual (no se exponen los demás).
        base = base.options(
            selectinload(
                Aviso.destinatarios.and_(AvisoDestinatario.usuario_id == usuario.id)
            ).joinedload(AvisoDestinatario.usuario)
        )

    total = db.scalar(conteo.where(*condiciones)) or 0
    avisos = list(
        db.scalars(
            base.where(*condiciones)
            .order_by(Aviso.publicado_en.desc(), Aviso.id.desc())
            .offset(skip)
            .limit(limit)
        )
    )

    estadisticas = _estadisticas(db, [aviso.id for aviso in avisos])
    return [
        _dto(
            aviso,
            estadisticas=estadisticas.get(aviso.id),
            destinatarios=list(aviso.destinatarios) if bandeja else None,
        )
        for aviso in avisos
    ], total


def obtener(db: Session, aviso_id: int, *, usuario: Usuario) -> AvisoResponse:
    aviso = _cargar(db, aviso_id)

    if _es_tutor(usuario):
        filtrados = list(
            db.scalars(
                select(AvisoDestinatario)
                .options(joinedload(AvisoDestinatario.usuario).joinedload(Usuario.rol))
                .where(
                    AvisoDestinatario.aviso_id == aviso.id,
                    AvisoDestinatario.usuario_id == usuario.id,
                )
            )
        )
        if not filtrados:
            raise Prohibido("El aviso no está dirigido a usted")
        destinatarios = filtrados
    else:
        destinatarios = list(
            db.scalars(
                select(AvisoDestinatario)
                .options(joinedload(AvisoDestinatario.usuario).joinedload(Usuario.rol))
                .where(AvisoDestinatario.aviso_id == aviso.id)
                .order_by(AvisoDestinatario.usuario_id)
            )
        )

    estadisticas = _estadisticas(db, [aviso.id]).get(aviso.id)
    return _dto(aviso, estadisticas=estadisticas, destinatarios=destinatarios)


# --------------------------------------------------------------------------
# Lectura y confirmación por parte del destinatario
# --------------------------------------------------------------------------


def _entrega(db: Session, aviso_id: int, usuario_id: int) -> AvisoDestinatario:
    entrega = db.get(AvisoDestinatario, (aviso_id, usuario_id))
    if entrega is None:
        raise Prohibido("El aviso no está dirigido a usted")
    return entrega


def marcar_leido(
    db: Session, *, aviso_id: int, usuario_id: int
) -> AvisoDestinatario:
    entrega = _entrega(db, aviso_id, usuario_id)
    if entrega.leido_en is None:
        entrega.leido_en = qr_service.ahora_local()
        db.commit()
        db.refresh(entrega)
    return entrega


def confirmar(
    db: Session,
    *,
    aviso_id: int,
    usuario_id: int,
    ip: str | None = None,
) -> AvisoDestinatario:
    entrega = _entrega(db, aviso_id, usuario_id)
    if entrega.confirmado_en is not None:
        return entrega

    ahora = qr_service.ahora_local()
    if entrega.leido_en is None:
        entrega.leido_en = ahora
    entrega.confirmado_en = ahora

    audit.registrar(
        db,
        usuario_id=usuario_id,
        accion="CONFIRMAR_AVISO",
        entidad="aviso",
        entidad_id=aviso_id,
        detalle={"aviso_id": aviso_id},
        ip=ip,
    )
    db.commit()
    db.refresh(entrega)
    return entrega
