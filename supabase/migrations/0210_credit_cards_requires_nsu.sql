-- =============================================================================
-- VetMax — Migration 0210: credit_cards.requires_nsu (Sprint 2026-05-30)
--
-- Algumas maquininhas (POS Cielo, Stone, Rede) imprimem NSU e Nº de Liberação
-- e a recepção tem que digitar manualmente para conciliar a fatura. Outras
-- formas — cartão tokenizado in-app, link de pagamento, voucher refeição —
-- não geram esses códigos, e exigir os dois trava o fluxo do caixa.
--
-- A flag controla a obrigatoriedade no PaymentMethodModal/CardSelectionModal:
-- requires_nsu = true  → ambos os campos obrigatórios
-- requires_nsu = false → campos opcionais (default)
--
-- Default false p/ não quebrar nada que já roda. PO marca caso a caso na tela
-- Cadastros > Formas de Pagamento.
-- =============================================================================

BEGIN;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS requires_nsu boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.credit_cards.requires_nsu IS
  'Quando true, o modal de recebimento (PDV/Caixa) exige NSU e Nº de Liberação. Útil para maquininhas POS que imprimem esses códigos. Default false (opcional).';

COMMIT;
