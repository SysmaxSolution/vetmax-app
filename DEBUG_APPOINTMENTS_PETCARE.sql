-- ═════════════════════════════════════════════════════════════════════════════
-- DEBUG: Verificação de Vazamento de Agendamentos
-- Clínica: PetCare (ID: 021c9c22-0f9a-4492-bebb-e9bb1c08a3b6)
-- ═════════════════════════════════════════════════════════════════════════════
-- EXECUTE ISTO NO SUPABASE CONSOLE → SQL EDITOR
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUANTOS AGENDAMENTOS NA PETCARE?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) as total_agendamentos_petcare
FROM appointments
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AGENDAMENTOS POR DATA NA PETCARE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  DATE(appointment_datetime) as data,
  COUNT(*) as total
FROM appointments
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid
GROUP BY DATE(appointment_datetime)
ORDER BY data DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AGENDAMENTOS PARA 2026-04-16 NA PETCARE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) as agendamentos_petcare_hoje
FROM appointments
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid
  AND DATE(appointment_datetime) = '2026-04-16';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. USUÁRIOS DA PETCARE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  full_name,
  role
FROM profiles
WHERE clinic_id = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. QUAL CLÍNICA POSSUI OS AGENDAMENTOS DE 2026-04-16?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  clinic_id,
  COUNT(*) as total_agendamentos
FROM appointments
WHERE DATE(appointment_datetime) = '2026-04-16'
GROUP BY clinic_id
ORDER BY total_agendamentos DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TODAS AS CLÍNICAS E SEUS AGENDAMENTOS
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.id,
  c.name,
  COUNT(a.id) as total_agendamentos,
  COUNT(CASE WHEN DATE(a.appointment_datetime) = '2026-04-16' THEN 1 END) as agendamentos_hoje
FROM clinics c
LEFT JOIN appointments a ON c.id = a.clinic_id
GROUP BY c.id, c.name
ORDER BY total_agendamentos DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. DETALHES DOS 3 AGENDAMENTOS DE 2026-04-16
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  a.id,
  c.name as clinic_name,
  a.clinic_id,
  a.appointment_datetime,
  a.status,
  a.reason
FROM appointments a
LEFT JOIN clinics c ON a.clinic_id = c.id
WHERE DATE(a.appointment_datetime) = '2026-04-16'
ORDER BY a.appointment_datetime;
