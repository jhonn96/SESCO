"""Generación y validación del QR dinámico (TOTP, RFC 6238).

Reglas:
- Código de **8 dígitos**, ventana tomada de ``parametro_asistencia.qr_ventana_seg``.
- Contenido: ``SESCO|ID_ESTUDIANTE|CODIGO``.
- La validación admite **una ventana de tolerancia** por desfase de reloj.

Formato de ``estudiante.secreto_qr`` (columna ``bytea``)
--------------------------------------------------------
El dataset demo guarda 32 bytes aleatorios crudos, mientras que los perfiles
creados por la API guardan el texto base32 producido por
``pyotp.random_base32()``. ``normalizar_secreto`` acepta ambos: si el
contenido es base32 válido se usa tal cual; si no, se codifica en base32 para
que pyotp lo pueda consumir. Así el QR funciona con los dos orígenes sin
migrar datos.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pyotp

from app.core.exceptions import ReglaNegocio

#: Bolivia no aplica horario de verano: UTC-4 todo el año.
ZONA_HORARIA = timezone(timedelta(hours=-4))

PREFIJO_QR = "SESCO"
DIGITOS_QR = 8
TOLERANCIA_VENTANAS = 1


@dataclass(frozen=True)
class CodigoQR:
    """Código vigente de un estudiante, listo para dibujarse como QR."""

    estudiante_id: int
    codigo: str
    contenido: str
    ventana: int
    ventana_seg: int
    expira_en: datetime
    segundos_restantes: int


def ahora_local() -> datetime:
    """Hora actual en la zona del colegio (UTC-4)."""
    return datetime.now(ZONA_HORARIA)


def normalizar_secreto(secreto: bytes) -> str:
    """Devuelve el secreto como texto base32 apto para pyotp.

    Acepta tanto el texto base32 que guarda la API como los bytes aleatorios
    crudos del dataset demo.
    """
    if not secreto:
        raise ReglaNegocio("El estudiante no tiene una semilla QR configurada")

    try:
        texto = secreto.decode("ascii")
        relleno = "=" * (-len(texto) % 8)
        base64.b32decode(texto + relleno, casefold=True)
        return texto
    except (UnicodeDecodeError, binascii.Error, ValueError):
        return base64.b32encode(secreto).decode("ascii")


def _totp(secreto: bytes, ventana_seg: int) -> pyotp.TOTP:
    if ventana_seg <= 0:
        raise ReglaNegocio("La ventana del QR debe ser mayor que cero")
    return pyotp.TOTP(normalizar_secreto(secreto), digits=DIGITOS_QR, interval=ventana_seg)


def ventana_actual(ventana_seg: int, momento: datetime | None = None) -> int:
    """Contador TOTP (``epoch // ventana_seg``), igual que ``qr_uso.ventana``."""
    instante = momento or ahora_local()
    return int(instante.timestamp() // ventana_seg)


def generar_codigo(
    secreto: bytes,
    ventana_seg: int,
    momento: datetime | None = None,
) -> tuple[str, int]:
    """Genera el código vigente y su número de ventana."""
    ventana = ventana_actual(ventana_seg, momento)
    return _totp(secreto, ventana_seg).generate_otp(ventana), ventana


def validar_codigo(
    secreto: bytes,
    codigo: str,
    ventana_seg: int,
    *,
    tolerancia: int = TOLERANCIA_VENTANAS,
    momento: datetime | None = None,
) -> int | None:
    """Valida el código y devuelve la ventana con la que coincide.

    Se prueban la ventana actual y las ``tolerancia`` anteriores y posteriores
    (desfase de reloj entre el celular y el servidor). Devuelve ``None`` si
    ninguna coincide.
    """
    codigo = (codigo or "").strip()
    if len(codigo) != DIGITOS_QR or not codigo.isdigit():
        return None

    totp = _totp(secreto, ventana_seg)
    actual = ventana_actual(ventana_seg, momento)
    candidatas = [actual]
    for salto in range(1, tolerancia + 1):
        candidatas.extend((actual - salto, actual + salto))

    for ventana in candidatas:
        if hmac.compare_digest(totp.generate_otp(ventana), codigo):
            return ventana
    return None


def construir_contenido(estudiante_id: int, codigo: str) -> str:
    return f"{PREFIJO_QR}|{estudiante_id}|{codigo}"


def parsear_contenido(contenido: str) -> tuple[int, str]:
    """Separa ``SESCO|ID|CODIGO`` y valida su forma básica."""
    partes = (contenido or "").strip().split("|")
    if len(partes) != 3 or partes[0] != PREFIJO_QR:
        raise ReglaNegocio(
            "El contenido del QR no es válido; se esperaba SESCO|ID_ESTUDIANTE|CODIGO"
        )
    if not partes[1].isdigit() or int(partes[1]) <= 0:
        raise ReglaNegocio("El identificador del estudiante en el QR no es válido")
    codigo = partes[2]
    if len(codigo) != DIGITOS_QR or not codigo.isdigit():
        raise ReglaNegocio(f"El código del QR debe tener {DIGITOS_QR} dígitos")
    return int(partes[1]), codigo


def generar_para_estudiante(
    *,
    estudiante_id: int,
    secreto: bytes,
    ventana_seg: int,
    momento: datetime | None = None,
) -> CodigoQR:
    instante = momento or ahora_local()
    codigo, ventana = generar_codigo(secreto, ventana_seg, instante)
    expira = datetime.fromtimestamp((ventana + 1) * ventana_seg, tz=timezone.utc).astimezone(
        ZONA_HORARIA
    )
    segundos = max(0, int(expira.timestamp() - instante.timestamp()))
    return CodigoQR(
        estudiante_id=estudiante_id,
        codigo=codigo,
        contenido=construir_contenido(estudiante_id, codigo),
        ventana=ventana,
        ventana_seg=ventana_seg,
        expira_en=expira,
        segundos_restantes=segundos,
    )
