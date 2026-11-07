"""Configuración central de SESCO.

Todas las variables se leen del entorno (o de un archivo ``.env`` en
``backend/``) usando ``pydantic-settings``. Los valores por defecto permiten
levantar el proyecto en local sin configuración adicional, salvo la
contraseña de PostgreSQL.
"""

from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros de la aplicación, la base de datos y la seguridad."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Aplicación ---
    app_name: str = "SESCO API"
    app_version: str = "0.1.0"
    environment: str = Field(default="development", pattern="^(development|staging|production)$")
    debug: bool = False
    api_prefix: str = "/api"

    # --- Base de datos (PostgreSQL 16) ---
    # El esquema de referencia (20 tablas, 3FN) vive en sesco_db.sql
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "sesco"
    db_user: str = "postgres"
    db_password: str = ""
    db_schema: str = "public"

    # --- Seguridad / JWT ---
    jwt_secret: str = "cambiar-en-produccion"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    refresh_token_expire_minutes: int = 10080  # 7 días

    # --- CORS (frontend Vite en desarrollo) ---
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # --- SQLAlchemy ---
    sql_echo: bool = False

    # --- Tareas programadas ---
    cierre_jornada_automatico: bool = True
    cierre_jornada_intervalo_min: int = Field(default=15, ge=1)

    @property
    def database_url(self) -> str:
        """URL de conexión para SQLAlchemy con credenciales escapadas."""
        user = quote_plus(self.db_user)
        password = quote_plus(self.db_password)
        return f"postgresql+psycopg2://{user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"


@lru_cache
def get_settings() -> Settings:
    """Devuelve una única instancia de ``Settings`` (cacheada)."""
    return Settings()


settings = get_settings()
