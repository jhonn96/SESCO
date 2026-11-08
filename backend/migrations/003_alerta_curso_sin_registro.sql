-- ============================================================================
-- SESCO - Alertas de cursos sin registro de asistencia (RF-07)
--
-- Permite que la tabla alerta represente dos situaciones:
--   1. Alertas por estudiante (faltas, tardanzas, inasistencia).
--   2. Alertas por curso cuando no hubo ningún registro de asistencia en el
--      día (tipo 'curso_sin_registro').
--
-- Para el segundo caso, estudiante_id deja de ser obligatorio y se agrega
-- curso_id. Es idempotente: se puede ejecutar más de una vez sin error.
--
-- Ejecución:
--   psql -U <usuario> -d sesco_db -f 003_alerta_curso_sin_registro.sql
-- ============================================================================

BEGIN;

-- 1. El curso pasa a ser el sujeto de la alerta; el estudiante es opcional.
ALTER TABLE alerta
    ALTER COLUMN estudiante_id DROP NOT NULL;

ALTER TABLE alerta
    ADD COLUMN IF NOT EXISTS curso_id bigint;

-- 2. Nuevo catálogo de tipos.
ALTER TABLE alerta
    DROP CONSTRAINT IF EXISTS ck_alerta_tipo;
ALTER TABLE alerta
    DROP CONSTRAINT IF EXISTS alerta_tipo_check;
ALTER TABLE alerta
    ADD CONSTRAINT ck_alerta_tipo
    CHECK (
        tipo IN ('faltas', 'tardanzas', 'inasistencia', 'curso_sin_registro')
    );

-- 3. Integridad referencial y consulta por curso.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'alerta_curso_id_fkey'
    ) THEN
        ALTER TABLE alerta
            ADD CONSTRAINT alerta_curso_id_fkey
            FOREIGN KEY (curso_id) REFERENCES curso (id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_alerta_curso
    ON alerta (curso_id, atendida);

-- 4. La vista de pendientes debe conservar las alertas de curso (sin
--    estudiante), resolviendo el curso desde alerta.curso_id.
CREATE OR REPLACE VIEW public.v_alertas_pendientes AS
 SELECT al.id,
    al.tipo,
    al.dia,
    (((u.apellidos)::text || ' '::text) || (u.nombres)::text) AS estudiante,
    c.nivel,
    c.grado,
    c.paralelo,
    al.detalle
   FROM (((public.alerta al
     LEFT JOIN public.usuario u ON ((u.id = al.estudiante_id)))
     LEFT JOIN public.estudiante e ON ((e.usuario_id = al.estudiante_id)))
     LEFT JOIN public.curso c ON ((c.id = COALESCE(e.curso_id, al.curso_id))))
  WHERE (NOT al.atendida);

COMMIT;
