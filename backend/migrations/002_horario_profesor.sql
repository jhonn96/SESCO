-- ============================================================================
-- SESCO - Asigna un profesor a cada bloque de horario
--
-- Agrega horario.profesor_id (FK a profesor.usuario_id), rellena los bloques
-- existentes con el asesor del curso (o el primer profesor asignado) y exige
-- que todo bloque tenga docente. Es idempotente: se puede ejecutar más de una
-- vez sin error.
--
-- Ejecución:
--   psql -U <usuario> -d sesco_db -f 002_horario_profesor.sql
-- ============================================================================

BEGIN;

-- 1. Nueva columna; queda nullable hasta completar el relleno.
ALTER TABLE horario
    ADD COLUMN IF NOT EXISTS profesor_id bigint;

-- 2. Relleno de los bloques existentes: se prioriza al asesor del curso.
UPDATE horario h
SET profesor_id = (
    SELECT pc.profesor_id
    FROM profesor_curso pc
    WHERE pc.curso_id = h.curso_id
    ORDER BY pc.es_asesor DESC, pc.profesor_id
    LIMIT 1
)
WHERE h.profesor_id IS NULL;

-- 3. Integridad referencial con el perfil del profesor.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'horario_profesor_id_fkey'
    ) THEN
        ALTER TABLE horario
            ADD CONSTRAINT horario_profesor_id_fkey
            FOREIGN KEY (profesor_id) REFERENCES profesor(usuario_id);
    END IF;
END
$$;

-- 4. Índice para resolver choques de agenda por profesor y día.
CREATE INDEX IF NOT EXISTS ix_horario_profesor_dia
    ON horario (profesor_id, dia_semana);

-- 5. Obligatoriedad. Si algun curso no tenia profesores asignados se avisa y
--    se conserva la columna nullable para no romper la migracion.
DO $$
DECLARE
    sin_profesor bigint;
BEGIN
    SELECT count(*) INTO sin_profesor FROM horario WHERE profesor_id IS NULL;
    IF sin_profesor = 0 THEN
        ALTER TABLE horario ALTER COLUMN profesor_id SET NOT NULL;
    ELSE
        RAISE NOTICE
            'Quedan % bloques sin profesor; asigne un docente antes de exigir NOT NULL',
            sin_profesor;
    END IF;
END
$$;

COMMIT;
