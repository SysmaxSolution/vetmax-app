-- 0399_pet_active_attendance.sql
-- Trava de unicidade de atendimento por pet (Sprint Almavet 2026-06-20, item URGENTE).
--
-- Hoje é possível inserir o mesmo pet várias vezes na fila/fluxo (múltiplas
-- consultas abertas em paralelo). Esta função retorna, se houver, o atendimento
-- ATIVO do pet — usada pelas server actions de check-in para bloquear duplicidade
-- e avisar EM QUE módulo o pet está e COM QUAL profissional.
--
-- Aditiva e idempotente. A consulta avança por status (1 registro), então basta
-- detectar uma consulta aberta para saber o módulo atual do pet.

CREATE OR REPLACE FUNCTION pet_active_attendance(
  p_clinic_id  UUID,
  p_patient_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_prof   TEXT;
  v_id     UUID;
BEGIN
  -- Consulta em qualquer etapa ativa do fluxo (recepção → internado).
  -- Exclui scheduled_future (agendamento futuro), completed e cancelled.
  SELECT c.id, c.status, COALESCE(p.full_name, 'Recepção')
    INTO v_id, v_status, v_prof
  FROM consultations c
  LEFT JOIN profiles p ON p.id = c.vet_id
  WHERE c.clinic_id  = p_clinic_id
    AND c.patient_id = p_patient_id
    AND c.status IN ('reception','scheduled','triage','in_progress','waiting_exam','medication','hospitalized')
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'has_active',     true,
      'consultation_id', v_id,
      'status',         v_status,
      'professional',   v_prof,
      'module', CASE v_status
        WHEN 'reception'    THEN 'Recepção'
        WHEN 'scheduled'    THEN 'Recepção'
        WHEN 'triage'       THEN 'Triagem'
        WHEN 'in_progress'  THEN 'Consultório'
        WHEN 'waiting_exam' THEN 'Exames'
        WHEN 'medication'   THEN 'Medicação'
        WHEN 'hospitalized' THEN 'Internação'
        ELSE 'Atendimento'
      END
    );
  END IF;

  RETURN jsonb_build_object('has_active', false);
END;
$$;

GRANT EXECUTE ON FUNCTION pet_active_attendance(UUID, UUID) TO authenticated, service_role;
