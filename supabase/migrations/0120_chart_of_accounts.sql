-- =============================================================================
-- VetMax — Migration 0117: Expansão de bank_accounts + chart_of_accounts
-- G-10 Financeiro > Cadastros Auxiliares
-- =============================================================================

-- ── Adiciona coluna ispb em bank_accounts (se não existir) ────────────────────
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS ispb TEXT;

-- ── Plano de Contas ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  code        VARCHAR(20) NOT NULL,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('receita', 'despesa', 'ativo', 'passivo')),
  parent_id   UUID        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, code)
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_clinic
  ON public.chart_of_accounts (clinic_id);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent
  ON public.chart_of_accounts (parent_id);

-- ── RLS chart_of_accounts ─────────────────────────────────────────────────────

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_of_accounts_select_clinic"
  ON public.chart_of_accounts FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "chart_of_accounts_write_admin"
  ON public.chart_of_accounts FOR ALL
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin' LIMIT 1
    )
  );

GRANT ALL    ON public.chart_of_accounts TO service_role;
GRANT SELECT ON public.chart_of_accounts TO authenticated;

-- ── Seed: 20 contas padrão veterinárias ──────────────────────────────────────
-- Inseridas para cada clínica existente (is_system=true, não editável pelo usuário)

CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(p_clinic_id UUID)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.chart_of_accounts (clinic_id, code, name, type, is_system) VALUES
    -- Receitas
    (p_clinic_id, '1.1', 'Consultas',             'receita', true),
    (p_clinic_id, '1.2', 'Exames Diagnósticos',   'receita', true),
    (p_clinic_id, '1.3', 'Cirurgias',              'receita', true),
    (p_clinic_id, '1.4', 'Banho e Tosa',           'receita', true),
    (p_clinic_id, '1.5', 'Internação',             'receita', true),
    (p_clinic_id, '1.6', 'Vacinação',              'receita', true),
    (p_clinic_id, '1.7', 'Venda de Medicamentos',  'receita', true),
    (p_clinic_id, '1.8', 'Venda de Produtos',      'receita', true),
    (p_clinic_id, '1.9', 'Plano de Saúde Animal',  'receita', true),
    (p_clinic_id, '1.10','Outras Receitas',         'receita', true),
    -- Despesas
    (p_clinic_id, '2.1', 'Salários e Pró-labore',  'despesa', true),
    (p_clinic_id, '2.2', 'Encargos Sociais',        'despesa', true),
    (p_clinic_id, '2.3', 'Aluguel',                 'despesa', true),
    (p_clinic_id, '2.4', 'Água e Energia',           'despesa', true),
    (p_clinic_id, '2.5', 'Materiais Veterinários',  'despesa', true),
    (p_clinic_id, '2.6', 'Medicamentos e Insumos',  'despesa', true),
    (p_clinic_id, '2.7', 'Manutenção e Reparos',    'despesa', true),
    (p_clinic_id, '2.8', 'Marketing e Publicidade', 'despesa', true),
    (p_clinic_id, '2.9', 'Impostos e Taxas',        'despesa', true),
    (p_clinic_id, '2.10','Outras Despesas',          'despesa', true)
  ON CONFLICT (clinic_id, code) DO NOTHING;
$$;

-- Executa seed para todas as clínicas existentes
SELECT public.seed_default_chart_of_accounts(id) FROM public.clinics;

COMMENT ON TABLE public.chart_of_accounts IS 'Plano de contas por clínica. is_system=true indica contas padrão não editáveis.';
