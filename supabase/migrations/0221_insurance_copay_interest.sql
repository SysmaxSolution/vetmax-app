-- =============================================================================
-- VetMax — Migration 0221: Juros/Taxa sobre coparticipação Petlove (Épico A)
-- Sprint Caixa Unificado + Juros Petlove — reunião 04/06/2026.
--
-- Regra de negócio (decisões do PO Q1/Q5 + transcrição ~51:27/~55:25):
--   - % cadastrado NO SERVIÇO (não no cartão) — cobre taxa da maquininha +
--     impostos da clínica;
--   - incide APENAS sobre a coparticipação (nunca no repasse Petlove);
--   - aplicado SOMENTE quando a forma de pagamento é cartão (crédito/débito);
--   - arredondamento POR ITEM (Q5); split misto → proporcional ao valor que
--     passou no cartão (Q1).
-- =============================================================================

-- % de taxa sobre a coparticipação quando pago no cartão (por serviço)
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS insurance_card_interest_percent NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (insurance_card_interest_percent >= 0 AND insurance_card_interest_percent <= 100);

COMMENT ON COLUMN stock_items.insurance_card_interest_percent IS
  'Taxa % aplicada sobre a coparticipação do convênio quando o tutor paga no cartão. Inclui maquininha + impostos. 0 = sem taxa.';

-- Juros efetivamente cobrado por item coberto (auditoria por linha da fatura)
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS coparticipation_interest NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN invoice_items.coparticipation_interest IS
  'Valor de taxa adm. cobrado sobre a coparticipação desta linha (cartão). Não compõe expected_value do repasse.';

-- Snapshot do juros na linha da consulta (imutável, auditoria CFMV)
ALTER TABLE consultation_services
  ADD COLUMN IF NOT EXISTS interest_snapshot NUMERIC(10,2);

COMMENT ON COLUMN consultation_services.interest_snapshot IS
  'Juros sobre a coparticipação aplicado nesta consulta (cartão). NULL = não houve.';

-- Total de taxa adm. da fatura (conferência rápida no caixa/recibo)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS copay_interest NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN invoices.copay_interest IS
  'Σ taxa administrativa (juros de coparticipação no cartão) embutida no total desta fatura.';
