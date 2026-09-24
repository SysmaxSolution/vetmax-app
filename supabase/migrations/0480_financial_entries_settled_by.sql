-- 0480 — Rastreabilidade da baixa: quem deu baixa no título, e quando.
--
-- PEDIDO (Bruna, treinamento financeiro 18/09/2026):
--   "eu quero saber, na hora, se foi uma pessoa do caixa que deu baixa"
--
-- LEVANTAMENTO — o dado NÃO existia para o caminho dominante.
--   • `financial_entries.created_by` guarda quem CRIOU o título, não quem o
--     baixou. Em `baixarTitulo` (src/lib/actions/financial.ts) a baixa integral
--     escrevia apenas status/payment_date/payment_method/settlement_bank_id/
--     interest/discount — nenhum ator. Na baixa parcial o filho `paid` herdava
--     `created_by` do pai, o que é ainda pior: parece ator e não é.
--   • `central_cashier.recorded_by` + `central_cashier.session_id` JÁ registram
--     o operador, mas só existem quando a baixa nasceu no caixa e o título tem
--     `cashier_entry_id` preenchido. Medição no banco de testes em 24/09/2026:
--     114 recebíveis pagos, apenas 4 com `cashier_entry_id` (3,5%).
--   Conclusão: a trilha do caixa cobre uma fração; a baixa manual da tela de
--   Financeiro não deixava rastro nenhum. Por isso as colunas abaixo.
--
-- Aditiva e idempotente (IF NOT EXISTS). Sem DEFAULT: NULL = baixa anterior a
-- esta migration (ou baixa cujo ator não foi registrado), e a UI mostra isso
-- explicitamente em vez de inventar um nome.
--
-- Multi-tenancy: colunas em tabela já isolada por `clinic_id`; nenhuma política
-- de RLS precisa mudar.

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS settled_by uuid,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

COMMENT ON COLUMN public.financial_entries.settled_by IS
  'profiles.id do operador que deu baixa no título. NULL = não registrado (baixa anterior a 0480) — resolver então por cashier_entry_id -> central_cashier.recorded_by.';
COMMENT ON COLUMN public.financial_entries.settled_at IS
  'Timestamp real da baixa (quando o clique aconteceu). Difere de payment_date, que é a data-competência informada pelo operador.';

-- FK sem validação retroativa: não queremos que a migration falhe por causa de
-- um perfil removido em base antiga. NOT VALID + ON DELETE SET NULL preserva o
-- título se o funcionário for desligado e o perfil apagado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_entries_settled_by_fkey'
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT financial_entries_settled_by_fkey
      FOREIGN KEY (settled_by) REFERENCES public.profiles(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- Índice só para o filtro "baixas de fulano no período", que é a consulta do
-- relatório. Parcial: linhas sem ator não interessam ao índice.
CREATE INDEX IF NOT EXISTS idx_financial_entries_settled_by
  ON public.financial_entries (clinic_id, settled_by, payment_date)
  WHERE settled_by IS NOT NULL;

-- ─── Backfill do que já dá para saber ────────────────────────────────────────
-- Só onde existe vínculo explícito com o lançamento de caixa. Não chutamos por
-- "sessão aberta na data": duas pessoas podem operar o mesmo caixa.
UPDATE public.financial_entries fe
SET    settled_by = cc.recorded_by,
       settled_at = cc.created_at
FROM   public.central_cashier cc
WHERE  fe.cashier_entry_id = cc.id
  AND  fe.clinic_id        = cc.clinic_id
  AND  fe.status           = 'paid'
  AND  fe.settled_by IS NULL
  AND  cc.recorded_by IS NOT NULL;

NOTIFY pgrst, 'reload schema';
