CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- Ex: 'DELETE_MEDICATION', 'FINALIZE_CONSULTATION'
  entity_type TEXT NOT NULL, -- Ex: 'applied_medications', 'consultations'
  entity_id UUID NOT NULL,
  details JSONB, -- Contexto extra (ex: o nome do medicamento apagado)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar Segurança de Nível de Linha (RLS)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Regras rigorosas:
-- 1. Qualquer pessoa autenticada pode INSERIR (O sistema vai usar isto para registar as ações)
CREATE POLICY "Allow inserts for authenticated users" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Apenas Administradores da mesma clínica podem LER (Para o futuro dashboard de relatórios)
CREATE POLICY "Allow select for clinic admins" ON audit_logs FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.clinic_id = audit_logs.clinic_id 
      AND profiles.role = 'admin'
  )
);