-- 0188_audit_logs_lgpd.sql
-- Estende a tabela audit_logs existente com colunas LGPD (TC-LGP-004).
-- Tabela já tem: id, clinic_id, user_id, action, entity_type, entity_id, details, created_at.
-- Adiciona: data_subject_id, data_type, access_type, purpose, ip_address, user_agent.
-- Adiciona RPC rpc_log_data_access.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS data_subject_id UUID,
  ADD COLUMN IF NOT EXISTS data_type       TEXT,
  ADD COLUMN IF NOT EXISTS access_type     TEXT,
  ADD COLUMN IF NOT EXISTS purpose         TEXT,
  ADD COLUMN IF NOT EXISTS ip_address      INET,
  ADD COLUMN IF NOT EXISTS user_agent      TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_subject ON public.audit_logs(data_subject_id);

-- Remove versões anteriores da função (assinaturas distintas) para permitir alterar defaults.
DROP FUNCTION IF EXISTS public.rpc_log_data_access(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_log_data_access(UUID, UUID, TEXT, TEXT, UUID, TEXT);

-- RPC para registrar acesso a dados sensíveis (LGPD art. 37).
-- SECURITY DEFINER para permitir escrita mesmo em contextos client-side
-- onde o JWT pertence ao usuário (validação de clinic_id é feita aqui).
CREATE OR REPLACE FUNCTION public.rpc_log_data_access(
  p_clinic_id       UUID,
  p_data_subject_id UUID,
  p_data_type       TEXT,
  p_entity_type     TEXT,
  p_entity_id       UUID,
  p_access_type     TEXT,
  p_purpose         TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_user_clinic  UUID;
  v_log_id       UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'rpc_log_data_access requer usuário autenticado';
  END IF;

  SELECT clinic_id INTO v_user_clinic FROM public.profiles WHERE id = v_user_id;
  IF v_user_clinic IS NULL OR v_user_clinic <> p_clinic_id THEN
    RAISE EXCEPTION 'rpc_log_data_access: clinic_id (%) não pertence ao usuário', p_clinic_id;
  END IF;

  INSERT INTO public.audit_logs (
    clinic_id, user_id, data_subject_id,
    data_type, entity_type, entity_id, access_type, purpose,
    action, details
  ) VALUES (
    p_clinic_id, v_user_id, p_data_subject_id,
    p_data_type, p_entity_type, p_entity_id, p_access_type, p_purpose,
    -- Colunas legadas mantidas com valor sentinela para compat:
    'LGPD_LOG', jsonb_build_object('data_type', p_data_type, 'access_type', p_access_type)
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_log_data_access(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
