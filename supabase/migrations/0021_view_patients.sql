-- Ativar a segurança nas tabelas
ALTER TABLE tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Apagar políticas antigas para evitar conflitos (se houver)
DROP POLICY IF EXISTS "Leitura de tutores" ON tutors;
DROP POLICY IF EXISTS "Leitura de pacientes" ON patients;

-- Criar políticas de leitura estritas (Só vê quem é da mesma clínica)
CREATE POLICY "Leitura de tutores" ON tutors FOR SELECT TO authenticated 
USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Leitura de pacientes" ON patients FOR SELECT TO authenticated 
USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));