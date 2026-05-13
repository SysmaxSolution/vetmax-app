-- =============================================================================
-- VetMax — Migration 0119: Funcionários por Clínica
-- G-10 Financeiro > Cadastros — Sub-aba Funcionários
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id        UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  name           TEXT          NOT NULL,
  role           TEXT          NOT NULL DEFAULT 'other',
  email          TEXT,
  phone          TEXT,
  cpf            VARCHAR(11),
  address        JSONB,
  hire_date      DATE,
  salary         NUMERIC(10,2),
  pix_key        TEXT,
  vacation_days  INT           NOT NULL DEFAULT 30,
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, cpf)
);

CREATE INDEX IF NOT EXISTS idx_employees_clinic
  ON public.employees (clinic_id);

CREATE INDEX IF NOT EXISTS idx_employees_user
  ON public.employees (user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_employees_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_employees_updated_at();

-- ── RLS employees ─────────────────────────────────────────────────────────────

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Leitura: todos da clínica, mas salary só via service_role (admin no backend)
CREATE POLICY "employees_select_clinic"
  ON public.employees FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Escrita (incluindo salary): apenas admin
CREATE POLICY "employees_write_admin"
  ON public.employees FOR ALL
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin' LIMIT 1
    )
  );

GRANT ALL    ON public.employees TO service_role;
GRANT SELECT ON public.employees TO authenticated;

COMMENT ON TABLE public.employees IS 'Funcionários por clínica. Campo salary é sensível — exibir apenas para admin.';
