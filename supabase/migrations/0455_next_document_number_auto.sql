-- 0455 — P0 (0.9): garantir que TODA OS nasça com número.
-- Nova RPC que emite o próximo número e, se a sequência ainda não existe,
-- auto-provisiona uma sequência default (idempotente, à prova de corrida) e
-- emite o nº 1. Também faz fallback: se não há sequência específica da empresa
-- faturante, usa a sequência geral do grupo (company_id NULL).
-- A next_document_number original é preservada (usada por RPS/NFS-e etc).

CREATE OR REPLACE FUNCTION next_document_number_auto(
  p_clinic_id  UUID,
  p_company_id UUID,
  p_doc_type   TEXT,
  p_prefix     TEXT DEFAULT '',
  p_padding    INT  DEFAULT 0
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zero   UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  v_num    BIGINT;
  v_prefix TEXT;
  v_pad    INT;
BEGIN
  -- 1) sequência específica da empresa faturante (ou geral quando p_company_id é NULL)
  UPDATE document_number_sequences
     SET next_number = next_number + 1, updated_at = NOW()
   WHERE clinic_id = p_clinic_id
     AND doc_type  = p_doc_type
     AND COALESCE(company_id, v_zero) = COALESCE(p_company_id, v_zero)
     AND is_active
   RETURNING next_number - 1, prefix, padding INTO v_num, v_prefix, v_pad;

  -- 2) fallback: sequência geral do grupo (company_id NULL) quando a específica não existe
  IF v_num IS NULL AND p_company_id IS NOT NULL THEN
    UPDATE document_number_sequences
       SET next_number = next_number + 1, updated_at = NOW()
     WHERE clinic_id = p_clinic_id
       AND doc_type  = p_doc_type
       AND company_id IS NULL
       AND is_active
     RETURNING next_number - 1, prefix, padding INTO v_num, v_prefix, v_pad;
  END IF;

  -- 3) auto-provisiona a sequência específica (idempotente) e emite o nº 1
  IF v_num IS NULL THEN
    BEGIN
      INSERT INTO document_number_sequences (clinic_id, company_id, doc_type, prefix, next_number, padding, is_active)
      VALUES (p_clinic_id, p_company_id, p_doc_type, COALESCE(p_prefix, ''), 1, GREATEST(COALESCE(p_padding, 0), 0), TRUE);
    EXCEPTION WHEN unique_violation THEN
      NULL; -- outra transação criou a sequência ao mesmo tempo; seguimos para o UPDATE
    END;

    UPDATE document_number_sequences
       SET next_number = next_number + 1, updated_at = NOW()
     WHERE clinic_id = p_clinic_id
       AND doc_type  = p_doc_type
       AND COALESCE(company_id, v_zero) = COALESCE(p_company_id, v_zero)
       AND is_active
     RETURNING next_number - 1, prefix, padding INTO v_num, v_prefix, v_pad;
  END IF;

  IF v_num IS NULL THEN
    RAISE EXCEPTION 'Falha ao emitir número (clinic=%, company=%, doc_type=%)', p_clinic_id, p_company_id, p_doc_type;
  END IF;

  RETURN COALESCE(v_prefix, '') || LPAD(v_num::TEXT, GREATEST(COALESCE(v_pad, 0), LENGTH(v_num::TEXT)), '0');
END;
$$;
