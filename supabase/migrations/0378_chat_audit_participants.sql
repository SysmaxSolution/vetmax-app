-- E1-S5: Audit trail de participação em chats (JOIN / LEFT)
-- Grava em audit_logs (tabela criada na migration 0020) toda entrada e saída de participantes.

CREATE OR REPLACE FUNCTION public.fn_audit_chat_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CHAT_PARTICIPANT_JOINED';
  ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    v_action := 'CHAT_PARTICIPANT_LEFT';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (
    clinic_id, user_id, action, entity_type, entity_id, details
  ) VALUES (
    NEW.clinic_id,
    COALESCE(auth.uid(), NEW.user_id),  -- NULL em triggers SECURITY DEFINER (sistema)
    v_action,
    'chat',
    NEW.chat_id,
    jsonb_build_object(
      'participant_user_id', NEW.user_id,
      'role',                NEW.role,
      'chat_id',             NEW.chat_id,
      'source',              CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chat_participant ON public.chat_participants;
CREATE TRIGGER trg_audit_chat_participant
  AFTER INSERT OR UPDATE OF left_at ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_chat_participant();
