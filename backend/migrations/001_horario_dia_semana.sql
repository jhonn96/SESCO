-- ============================================================================
-- SESCO · Agrega el día de la semana a los bloques de horario
--
-- Permite representar la grilla semanal (lunes a viernes) de cada curso.
-- Es idempotente: se puede ejecutar más de una vez sin error.
--
-- Ejecución:
--   psql -U <usuario> -d sesco_db -f 001_horario_dia_semana.sql
-- ============================================================================

BEGIN;

-- 1. Nueva columna con valor por defecto para no romper los datos existentes.
ALTER TABLE horario
    ADD COLUMN IF NOT EXISTS dia_semana varchar(10) NOT NULL DEFAULT 'lunes';

-- 2. Catálogo cerrado de días hábiles.
ALTER TABLE horario
    DROP CONSTRAINT IF EXISTS ck_horario_dia_semana;
ALTER TABLE horario
    ADD CONSTRAINT ck_horario_dia_semana
    CHECK (dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes'));

-- 3. Índice para consultar la grilla de un curso por día.
CREATE INDEX IF NOT EXISTS ix_horario_curso_dia
    ON horario (curso_id, dia_semana);

COMMIT;
