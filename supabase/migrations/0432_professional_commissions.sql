-- 0432: 1.5 Motor de repasse dos profissionais — regras de comissão.
--
-- Por profissional, vincula serviço/produto (ou um padrão) a um valor FIXO ou
-- PERCENTUAL. Base para: (a) calcular quanto a clínica emite vs. quanto o
-- profissional recebe; (b) lançar a comissão no contas a pagar ao faturar. Aditiva.

CREATE TABLE IF NOT EXISTS professional_commissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  professional_id uuid NOT NULL,
  applies_to      text NOT NULL DEFAULT 'default',   -- 'default' | 'service' | 'product' | 'category'
  service_id      uuid,
  product_id      uuid,
  category        text,
  commission_type text NOT NULL,                     -- 'percent' | 'fixed'
  value           numeric NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pc_type_chk  CHECK (commission_type IN ('percent', 'fixed')),
  CONSTRAINT pc_value_chk CHECK (value >= 0),
  CONSTRAINT pc_scope_chk CHECK (applies_to IN ('default', 'service', 'product', 'category'))
);
CREATE INDEX IF NOT EXISTS idx_pc_clinic       ON professional_commissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_pc_professional ON professional_commissions(professional_id);
