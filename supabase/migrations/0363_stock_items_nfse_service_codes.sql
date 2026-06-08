-- ════════════════════════════════════════════════════════════════════════════
-- 0363 — Códigos de serviço NFS-e por item (Faturamento Fase 3, ajuste 08/06/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Correção de arquitetura: o item da lista de serviço (LC 116) e o código
-- tributário do município são atributos DO SERVIÇO, não da clínica. Saem da
-- clinic_fiscal_config (que mantém apenas a alíquota ISS como padrão) e passam
-- a viver no cadastro de cada stock_item (is_service=true).
--
-- O buildNfsePayload resolve o código a partir do serviço; a alíquota continua
-- vindo da config (decisão do PO). Aditiva e idempotente.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS nfse_item_lista_servico TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS nfse_codigo_tributario_municipio TEXT;

COMMENT ON COLUMN stock_items.nfse_item_lista_servico IS
  'Item da lista de serviço (LC 116) para NFS-e — por serviço. Ex.: 5.07.';
COMMENT ON COLUMN stock_items.nfse_codigo_tributario_municipio IS
  'Código tributário do município (mapeia o item LC116 no município) para NFS-e — por serviço.';
