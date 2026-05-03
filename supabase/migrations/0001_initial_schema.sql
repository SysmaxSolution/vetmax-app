-- =============================================================================
-- VetMax — Migration 0001: Schema Inicial
-- Banco isolado e independente do HealthMax
-- Fluxo: Recepção > Triagem > Médico Vet > Exames/Internação > Farmácia > Alta
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABELAS
-- =============================================================================

-- 1. Clínicas (Tenants)
CREATE TABLE clinics (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Perfis de usuários (vinculados ao Supabase Auth)
--    Roles específicos do domínio veterinário
CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id   UUID REFERENCES clinics(id) ON DELETE SET NULL,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN (
                    'admin',        -- Administrador da clínica
                    'vet',          -- Médico Veterinário
                    'assistant',    -- Auxiliar Veterinário (triagem, medicação)
                    'receptionist', -- Recepcionista
                    'pharmacist'    -- Farmacêutico
                )) DEFAULT 'receptionist',
    crmv        TEXT,               -- Registro CRMV (obrigatório para role = 'vet')
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tutores (responsáveis pelos animais)
--    Regra de ouro: Um Tutor pode ter vários Patients (animais)
CREATE TABLE tutors (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    cpf         TEXT NOT NULL,
    email       TEXT,
    phone       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id, cpf)
);

-- 4. Patients (animais — vinculados ao Tutor)
CREATE TABLE patients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    tutor_id    UUID NOT NULL REFERENCES tutors(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    species     TEXT NOT NULL CHECK (species IN (
                    'dog', 'cat', 'bird', 'rabbit',
                    'rodent', 'reptile', 'fish', 'exotic'
                )),
    breed       TEXT,
    gender      TEXT CHECK (gender IN ('male', 'female', 'unknown')),
    neutered    BOOLEAN DEFAULT FALSE,
    birth_date  DATE,
    microchip   TEXT,
    photo_url   TEXT,
    notes       TEXT,               -- alergias, condições crônicas, observações permanentes
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Consultas (atendimento veterinário)
--    weight e temperature: preenchidos na triagem pelo assistant
CREATE TABLE consultations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    vet_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status          TEXT NOT NULL CHECK (status IN (
                        'scheduled_future', -- Agendamento futuro
                        'reception',        -- Animal chegou, aguarda check-in
                        'scheduled',        -- Aguardando triagem ou MV
                        'triage',           -- Em triagem com Auxiliar Vet
                        'in_progress',      -- Em consulta ativa com MV
                        'waiting_exam',     -- Aguardando resultado de exame
                        'medication',       -- Em medicação / internação
                        'completed',        -- Alta veterinária
                        'cancelled'         -- Cancelado
                    )) DEFAULT 'reception',
    -- Triagem (preenchidos pelo assistant — obrigatórios antes de avançar)
    weight          NUMERIC(5,2),           -- Peso em kg (ex: 12.50)
    temperature     NUMERIC(4,1),           -- Temperatura retal °C (ex: 38.5)
    triage_notes    TEXT,
    -- Clínico (preenchidos pelo vet)
    vet_notes       TEXT,                   -- Prontuário oficial CFMV
    audio_transcript    TEXT,               -- Transcrição bruta (voz → texto)
    suggested_diagnosis TEXT,               -- Sugestão de IA — NÃO é o prontuário
    is_reviewed_by_vet  BOOLEAN DEFAULT FALSE,
    -- Agendamento e pagamento
    appointment_date    TIMESTAMPTZ,
    payment_method  TEXT CHECK (payment_method IN ('cash', 'card', 'pix', 'insurance', 'other')),
    payment_status  TEXT CHECK (payment_status IN ('pending', 'paid')) DEFAULT 'pending',
    -- Metadados
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ÍNDICES DE PERFORMANCE
-- =============================================================================

CREATE INDEX idx_profiles_clinic        ON profiles(clinic_id);
CREATE INDEX idx_profiles_clinic_role   ON profiles(clinic_id, role);

CREATE INDEX idx_tutors_clinic          ON tutors(clinic_id);
CREATE INDEX idx_tutors_clinic_cpf      ON tutors(clinic_id, cpf);

CREATE INDEX idx_patients_clinic        ON patients(clinic_id);
CREATE INDEX idx_patients_tutor         ON patients(tutor_id);
CREATE INDEX idx_patients_clinic_tutor  ON patients(clinic_id, tutor_id);

CREATE INDEX idx_consultations_clinic   ON consultations(clinic_id);
CREATE INDEX idx_consultations_patient  ON consultations(patient_id);
CREATE INDEX idx_consultations_vet      ON consultations(vet_id);
CREATE INDEX idx_consultations_status   ON consultations(clinic_id, status, created_at);
CREATE INDEX idx_consultations_agenda   ON consultations(clinic_id, appointment_date)
    WHERE status = 'scheduled_future';

-- =============================================================================
-- FUNÇÃO RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_clinic_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- =============================================================================
-- TRIGGER updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consultations_updated_at
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE clinics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations  ENABLE ROW LEVEL SECURITY;

-- Clinics
CREATE POLICY "clinic_select_own"
  ON clinics FOR SELECT
  USING (id = get_user_clinic_id());

-- Profiles
CREATE POLICY "profiles_select_clinic"
  ON profiles FOR SELECT
  USING (clinic_id = get_user_clinic_id());

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Tutors
CREATE POLICY "tutors_clinic_isolation"
  ON tutors FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- Patients
CREATE POLICY "patients_clinic_isolation"
  ON patients FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- Consultations
CREATE POLICY "consultations_clinic_isolation"
  ON consultations FOR ALL
  USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
