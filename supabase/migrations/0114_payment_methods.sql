-- =============================================================================
-- VetMax — Migration 0114: Modalidades de Pagamento por Clínica
-- G-09 Módulo Financeiro Core
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN (
                'cash', 'pix', 'credit_card', 'debit_card',
                'boleto', 'transfer', 'check', 'other'
              )),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_clinic
  ON public.payment_methods (clinic_id);

CREATE OR REPLACE FUNCTION public.seed_default_payment_methods(p_clinic_id UUID)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.payment_methods (clinic_id, name, type) VALUES
    (p_clinic_id, 'Dinheiro',          'cash'),
    (p_clinic_id, 'PIX',               'pix'),
    (p_clinic_id, 'Cartão de Crédito', 'credit_card'),
    (p_clinic_id, 'Cartão de Débito',  'debit_card'),
    (p_clinic_id, 'Boleto',            'boleto'),
    (p_clinic_id, 'Transferência',     'transfer'),
    (p_clinic_id, 'Cheque',            'check'),
    (p_clinic_id, 'Outros',            'other')
  ON CONFLICT (clinic_id, name) DO NOTHING;
$$;

COMMENT ON TABLE public.payment_methods IS 'Modalidades de pagamento/recebimento configuráveis por clínica.';
