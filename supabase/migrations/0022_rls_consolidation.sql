-- =============================================================================
-- VetMax — Migration 0022: RLS Consolidation & Multi-Tenancy Enforcement
-- Garante que TODAS as tabelas clínicas filtrem por clinic_id via RLS
-- =============================================================================

-- 1. Otimizar a função get_user_clinic_id() com IMMUTABLE
CREATE OR REPLACE FUNCTION get_user_clinic_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Dropar políticas antigas que possam estar duplicadas ou conflitantes
-- (Usar DROP IF EXISTS para evitar erros se não existirem)

-- Clinics policies
DROP POLICY IF EXISTS "clinic_select_own" ON clinics;
DROP POLICY IF EXISTS "clinic_insert_own" ON clinics;

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_clinic" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Tutors policies
DROP POLICY IF EXISTS "tutors_clinic_isolation" ON tutors;

-- Patients policies
DROP POLICY IF EXISTS "patients_clinic_isolation" ON patients;

-- Consultations policies
DROP POLICY IF EXISTS "consultations_clinic_isolation" ON consultations;

-- Applied Medications policies
DROP POLICY IF EXISTS "clinic_isolation_applied_medications" ON applied_medications;

-- Referrals policies
DROP POLICY IF EXISTS "clinic_isolation_referrals" ON referrals_and_external_rx;

-- Document Templates policies
DROP POLICY IF EXISTS "clinic_isolation_document_templates" ON document_templates;
DROP POLICY IF EXISTS "admin_manage_templates" ON document_templates;

-- Patient Documents policies
DROP POLICY IF EXISTS "clinic_isolation_patient_documents" ON patient_documents;

-- Appointments policies
DROP POLICY IF EXISTS "appointments_clinic_select" ON appointments;
DROP POLICY IF EXISTS "appointments_clinic_insert" ON appointments;
DROP POLICY IF EXISTS "appointments_clinic_update" ON appointments;
DROP POLICY IF EXISTS "appointments_clinic_delete" ON appointments;

-- Patient Attachments policies
DROP POLICY IF EXISTS "attachments_select" ON patient_attachments;
DROP POLICY IF EXISTS "attachments_insert" ON patient_attachments;
DROP POLICY IF EXISTS "attachments_delete" ON patient_attachments;

-- Invoices policies
DROP POLICY IF EXISTS "invoices_select" ON invoices;
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
DROP POLICY IF EXISTS "invoices_update" ON invoices;

-- Invoice Items policies
DROP POLICY IF EXISTS "invoice_items_select" ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert" ON invoice_items;

-- Clinic Catalog policies
DROP POLICY IF EXISTS "catalog_select" ON clinic_catalog;
DROP POLICY IF EXISTS "catalog_insert" ON clinic_catalog;
DROP POLICY IF EXISTS "catalog_update" ON clinic_catalog;
DROP POLICY IF EXISTS "catalog_delete" ON clinic_catalog;

-- Patient Vaccines policies
DROP POLICY IF EXISTS "clinic_members_select_vaccines" ON patient_vaccines;
DROP POLICY IF EXISTS "clinic_members_insert_vaccines" ON patient_vaccines;
DROP POLICY IF EXISTS "clinic_members_delete_vaccines" ON patient_vaccines;

-- Hospitalizations policies
DROP POLICY IF EXISTS "clinic_isolation" ON hospitalizations;

-- Audit Logs policies
DROP POLICY IF EXISTS "Allow inserts for authenticated users" ON audit_logs;
DROP POLICY IF EXISTS "Allow select for clinic admins" ON audit_logs;

-- =============================================================================
-- 3. RECRIA AS POLÍTICAS DE RLS — PADRONIZADAS E COMPLETAS
-- =============================================================================

-- ─── CLINICS ───────────────────────────────────────────────────────────────
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinics_select_own"
  ON clinics FOR SELECT
  USING (id = get_user_clinic_id());

-- ─── PROFILES ──────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_clinic"
  ON profiles FOR SELECT
  USING (clinic_id = get_user_clinic_id());

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ─── TUTORS ────────────────────────────────────────────────────────────────
ALTER TABLE tutors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tutors_clinic_isolation"
  ON tutors FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── PATIENTS ──────────────────────────────────────────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_clinic_isolation"
  ON patients FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── CONSULTATIONS ─────────────────────────────────────────────────────────
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultations_clinic_isolation"
  ON consultations FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── APPLIED_MEDICATIONS ───────────────────────────────────────────────────
ALTER TABLE applied_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applied_medications_clinic_isolation"
  ON applied_medications FOR ALL
  TO authenticated
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── REFERRALS_AND_EXTERNAL_RX ────────────────────────────────────────────
ALTER TABLE referrals_and_external_rx ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_clinic_isolation"
  ON referrals_and_external_rx FOR ALL
  TO authenticated
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── DOCUMENT_TEMPLATES ────────────────────────────────────────────────────
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_templates_clinic_isolation"
  ON document_templates FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── PATIENT_DOCUMENTS ─────────────────────────────────────────────────────
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_documents_clinic_isolation"
  ON patient_documents FOR ALL
  TO authenticated
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── APPOINTMENTS ──────────────────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_clinic_isolation"
  ON appointments FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── PATIENT_ATTACHMENTS ───────────────────────────────────────────────────
ALTER TABLE patient_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_attachments_clinic_isolation"
  ON patient_attachments FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── INVOICES ──────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_clinic_isolation"
  ON invoices FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── INVOICE_ITEMS (herdado via invoice) ───────────────────────────────────
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_clinic_isolation"
  ON invoice_items FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE clinic_id = get_user_clinic_id()
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices WHERE clinic_id = get_user_clinic_id()
    )
  );

-- ─── CLINIC_CATALOG ────────────────────────────────────────────────────────
ALTER TABLE clinic_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_catalog_isolation"
  ON clinic_catalog FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── PATIENT_VACCINES ──────────────────────────────────────────────────────
ALTER TABLE patient_vaccines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_vaccines_clinic_isolation"
  ON patient_vaccines FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── HOSPITALIZATIONS ──────────────────────────────────────────────────────
ALTER TABLE hospitalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospitalizations_clinic_isolation"
  ON hospitalizations FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ─── AUDIT_LOGS ────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Inserts: qualquer usuário autenticado pode registrar suas ações
CREATE POLICY "audit_logs_insert"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Selects: apenas admins da mesma clínica podem ver logs
CREATE POLICY "audit_logs_select"
  ON audit_logs FOR SELECT TO authenticated
  USING (
    clinic_id = get_user_clinic_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================================================
-- 4. VERIFICAÇÃO E ÍNDICES
-- =============================================================================

-- Garantir que todas as tabelas críticas tenham índices de clinic_id
-- (já devem existir, mas reforçamos aqui)

CREATE INDEX IF NOT EXISTS idx_applied_medications_clinic
  ON applied_medications(clinic_id);

CREATE INDEX IF NOT EXISTS idx_referrals_clinic
  ON referrals_and_external_rx(clinic_id);

CREATE INDEX IF NOT EXISTS idx_document_templates_clinic
  ON document_templates(clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_clinic
  ON patient_documents(clinic_id);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic
  ON appointments(clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_attachments_clinic
  ON patient_attachments(clinic_id);

CREATE INDEX IF NOT EXISTS idx_invoices_clinic
  ON invoices(clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_catalog_clinic
  ON clinic_catalog(clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_vaccines_clinic
  ON patient_vaccines(clinic_id);

CREATE INDEX IF NOT EXISTS idx_hospitalizations_clinic
  ON hospitalizations(clinic_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic
  ON audit_logs(clinic_id);

-- =============================================================================
-- 5. VALIDAÇÃO
-- =============================================================================

-- Log da consolidação
RAISE NOTICE 'RLS Consolidation Complete: Multi-tenancy enforcement activated for all clinic-related tables';
