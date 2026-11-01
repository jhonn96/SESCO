"""Capa de negocio de usuarios.

Reglas:
- La CI es única y la contraseña se guarda hasheada, nunca en claro.
- El rol debe existir en el catálogo.
- No se puede cambiar el rol de un usuario que ya tiene perfil de estudiante,
  profesor o tutor (quedaría un perfil huérfano).
- No se puede eliminar ni desactivar al último director activo.
"""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import Conflicto, NoEncontrado, Prohibido, ReglaNegocio, traducir_integridad
from app.core.orden import orden_persona
from app.core.security import hash_password
from app.models import Estudiante, Profesor, Rol, Tutor, Usuario
from app.schemas.enums import IDS_ROL, RolNombre
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate


def _condiciones(
    *, rol_id: int | None, activo: bool | None, q: str | None
) -> list:
    condiciones = []
    if rol_id is not None:
        condiciones.append(Usuario.rol_id == rol_id)
    if activo is not None:
        condiciones.append(Usuario.activo.is_(activo))
    if q:
        patron = f"%{q.strip()}%"
        condiciones.append(
            or_(
                Usuario.ci.ilike(patron),
                Usuario.nombres.ilike(patron),
                Usuario.apellidos.ilike(patron),
            )
        )
    return condiciones


def listar(
    db: Session,
    *,
    rol_id: int | None = None,
    activo: bool | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Usuario], int]:
    condiciones = _condiciones(rol_id=rol_id, activo=activo, q=q)
    total = db.scalar(
        select(func.count()).select_from(Usuario).where(*condiciones)
    ) or 0
    items = list(
        db.scalars(
            select(Usuario)
            .options(joinedload(Usuario.rol))
            .where(*condiciones)
            .order_by(*orden_persona())
            .offset(skip)
            .limit(limit)
        )
    )
    return items, total


def obtener(db: Session, usuario_id: int) -> Usuario:
    usuario = db.scalar(
        select(Usuario)
        .options(joinedload(Usuario.rol))
        .where(Usuario.id == usuario_id)
    )
    if usuario is None:
        raise NoEncontrado(f"No existe el usuario {usuario_id}")
    return usuario


def ci_disponible(db: Session, ci: str) -> bool:
    """Indica si la cédula puede usarse (no existe otro usuario con ella)."""
    normalizada = ci.strip().lower()
    existentes = db.scalar(
        select(func.count())
        .select_from(Usuario)
        .where(func.lower(func.btrim(Usuario.ci)) == normalizada)
    )
    return not existentes


def _validar_rol(db: Session, rol_id: int) -> None:
    if db.get(Rol, rol_id) is None:
        raise NoEncontrado(f"No existe el rol {rol_id}")


def _validar_perfil(db: Session, usuario: Usuario, nuevo_rol_id: int) -> None:
    """Impide dejar huérfano un perfil 1:1 al cambiar de rol."""
    if nuevo_rol_id == usuario.rol_id:
        return
    esperados = (
        (Estudiante, IDS_ROL[RolNombre.ESTUDIANTE], "estudiante"),
        (Profesor, IDS_ROL[RolNombre.PROFESOR], "profesor"),
        (Tutor, IDS_ROL[RolNombre.TUTOR], "tutor"),
    )
    for modelo, rol_esperado, etiqueta in esperados:
        if db.get(modelo, usuario.id) is not None and nuevo_rol_id != rol_esperado:
            raise Conflicto(
                f"El usuario tiene perfil de {etiqueta}; no puede cambiar a otro rol"
            )


def _es_ultimo_director_activo(db: Session, usuario: Usuario) -> bool:
    if usuario.rol_id != IDS_ROL[RolNombre.DIRECTOR] or not usuario.activo:
        return False
    otros = db.scalar(
        select(func.count())
        .select_from(Usuario)
        .where(
            Usuario.rol_id == IDS_ROL[RolNombre.DIRECTOR],
            Usuario.activo.is_(True),
            Usuario.id != usuario.id,
        )
    )
    return not otros


def crear(db: Session, datos: UsuarioCreate) -> Usuario:
    _validar_rol(db, datos.rol_id)
    usuario = Usuario(
        ci=datos.ci.strip(),
        nombres=datos.nombres.strip(),
        apellidos=datos.apellidos.strip(),
        password_hash=hash_password(datos.password),
        rol_id=datos.rol_id,
        activo=True,
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un usuario con esa cédula",
            referencia="El rol indicado no existe",
        ) from exc
    return obtener(db, usuario.id)


def actualizar(db: Session, usuario_id: int, datos: UsuarioUpdate) -> Usuario:
    usuario = obtener(db, usuario_id)
    cambios = {
        campo: valor
        for campo, valor in datos.model_dump(exclude_unset=True).items()
        if valor is not None
    }

    if "rol_id" in cambios:
        _validar_rol(db, cambios["rol_id"])
        _validar_perfil(db, usuario, cambios["rol_id"])

    if cambios.get("activo") is False and _es_ultimo_director_activo(db, usuario):
        raise Conflicto("No se puede desactivar al último director activo")

    if "rol_id" in cambios and cambios["rol_id"] != usuario.rol_id:
        if _es_ultimo_director_activo(db, usuario):
            raise Conflicto("No se puede cambiar el rol del último director activo")

    if "password" in cambios:
        usuario.password_hash = hash_password(cambios.pop("password"))

    for campo, valor in cambios.items():
        setattr(usuario, campo, valor)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise traducir_integridad(
            exc,
            duplicado="Ya existe un usuario con esa cédula",
            referencia="Los datos del usuario no son válidos",
        ) from exc
    return obtener(db, usuario_id)


def eliminar(db: Session, usuario_id: int, *, current_user_id: int) -> None:
    if usuario_id == current_user_id:
        raise Prohibido("No puede eliminar su propia cuenta")
    usuario = obtener(db, usuario_id)
    if _es_ultimo_director_activo(db, usuario):
        raise Conflicto("No se puede eliminar al último director activo")
    db.delete(usuario)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflicto(
            "El usuario tiene registros asociados (asistencias, tutorías, avisos...); "
            "desactívelo en lugar de eliminarlo"
        ) from exc
