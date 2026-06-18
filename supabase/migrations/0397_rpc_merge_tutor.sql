-- 0397_rpc_merge_tutor.sql
-- Unificação de tutores duplicados (típico da importação Petlove).
--
-- Quando o operador edita um cadastro e informa um CPF que já pertence a OUTRO
-- tutor da mesma clínica, o app chama este RPC para fundir o tutor de origem
-- (duplicado) no tutor de destino (canônico): reaponta TODAS as referências e
-- remove o duplicado. A função descobre as FKs dinamicamente via catálogo, então
-- nenhuma tabela que referencie tutors(id) fica para trás (evita erro de FK no
-- DELETE final). Atômica: qualquer falha desfaz tudo.

CREATE OR REPLACE FUNCTION rpc_merge_tutor(
  p_clinic_id uuid,
  p_from      uuid,
  p_into      uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r record;
BEGIN
  IF p_from = p_into THEN
    RAISE EXCEPTION 'Tutor de origem e destino são iguais.';
  END IF;

  -- Ambos precisam existir e pertencer à mesma clínica (isolamento multi-tenant).
  IF NOT EXISTS (SELECT 1 FROM tutors WHERE id = p_from AND clinic_id = p_clinic_id) THEN
    RAISE EXCEPTION 'Tutor de origem % não encontrado na clínica.', p_from;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tutors WHERE id = p_into AND clinic_id = p_clinic_id) THEN
    RAISE EXCEPTION 'Tutor de destino % não encontrado na clínica.', p_into;
  END IF;

  -- Reaponta toda coluna que tenha FK para tutors(id).
  FOR r IN
    SELECT con.conrelid::regclass::text AS tbl,
           att.attname                  AS col
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum   = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'tutors'::regclass
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col)
      USING p_into, p_from;
  END LOOP;

  -- Remove o duplicado já sem referências.
  DELETE FROM tutors WHERE id = p_from AND clinic_id = p_clinic_id;
END;
$$;
