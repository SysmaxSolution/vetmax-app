-- E1-S4: Torna soft-delete de mensagens imutável via trigger
-- Impede que deleted_at seja zerado após preenchido (proteção de integridade clínica).

CREATE OR REPLACE FUNCTION public.fn_prevent_undelete_message()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Mensagem excluída não pode ser restaurada'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_undelete ON public.chat_messages;
CREATE TRIGGER trg_prevent_undelete
  BEFORE UPDATE OF deleted_at ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_undelete_message();
