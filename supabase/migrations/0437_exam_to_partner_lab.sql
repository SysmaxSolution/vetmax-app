-- 0437: 1.11 F2 — enviar exame a laboratório parceiro.
-- Novo status 'awaiting_lab_result' (mantém o exame na fila) + laboratório de
-- destino + prazo de retorno na consulta. Aditiva.
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS lab_partner_clinic_id uuid;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS lab_return_deadline date;
-- adiciona 'awaiting_lab_result' ao CHECK de status (recria o constraint)
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid='consultations'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) ILIKE '%status%' AND pg_get_constraintdef(oid) ILIKE '%waiting_exam%';
  IF cname IS NOT NULL THEN EXECUTE 'ALTER TABLE consultations DROP CONSTRAINT '||quote_ident(cname); END IF;
  ALTER TABLE consultations ADD CONSTRAINT consultations_status_check CHECK (status = ANY (ARRAY[
    'scheduled_future','reception','scheduled','triage','in_progress','waiting_exam',
    'awaiting_lab_result','medication','completed','cancelled','hospitalized',
    'revisao_pos_internacao','awaiting_review']));
END $$;
