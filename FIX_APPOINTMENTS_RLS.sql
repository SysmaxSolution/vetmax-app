-- ═════════════════════════════════════════════════════════════════════════════
-- FIX: Correção de Vazamento de Agendamentos (RLS)
-- ═════════════════════════════════════════════════════════════════════════════
-- EXECUTE ISTO NO SUPABASE CONSOLE → SQL EDITOR
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROPAR AS 4 POLICIES ANTIGAS (conflitantes)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "appointments_clinic_select" ON appointments;
DROP POLICY IF EXISTS "appointments_clinic_insert" ON appointments;
DROP POLICY IF EXISTS "appointments_clinic_update" ON appointments;
DROP POLICY IF EXISTS "appointments_clinic_delete" ON appointments;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CRIAR UMA ÚNICA POLICY CONSOLIDADA E EFETIVA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "appointments_isolate_by_clinic"
  ON appointments FOR ALL
  TO authenticated
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    clinic_id = (
      SELECT clinic_id FROM public.profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═════════════════════════════════════════════════════════════════════════════

-- Verificar que só existe 1 policy agora
SELECT
  policyname,
  qual as "USING clause",
  with_check as "WITH CHECK clause"
FROM pg_policies
WHERE tablename = 'appointments' AND schemaname = 'public'
ORDER BY policyname;

-- ─────────────────────────────────────────────────────────────────────────────
-- Informações de DEBUG
-- ─────────────────────────────────────────────────────────────────────────────

-- Quantas clínicas existem?
SELECT id, name FROM clinics;

-- Quantos usuários/profiles?
SELECT id, full_name, role, clinic_id FROM profiles ORDER BY full_name;

-- Quantos agendamentos TOTAIS por clínica?
SELECT
  clinic_id,
  COUNT(*) as total_agendamentos,
  COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as agendamentos_ativos
FROM appointments
GROUP BY clinic_id
ORDER BY total_agendamentos DESC;

-- Agendamentos por data (teste de RLS com sua clínica)
SELECT
  DATE(appointment_datetime) as data,
  COUNT(*) as total
FROM appointments
WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
GROUP BY DATE(appointment_datetime)
ORDER BY data DESC;
