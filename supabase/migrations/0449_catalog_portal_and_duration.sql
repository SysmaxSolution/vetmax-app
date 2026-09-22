-- 0449 — Campos por serviço (catálogo): publicação no portal + prazo médio.
-- Pedido do cliente (Animais): (1) marcar, por serviço, se o RESULTADO deve ir
-- obrigatoriamente ao Portal do Tutor; (2) definir um prazo/duração médio p/
-- estimar o bloco de agenda. Aditiva + idempotente.

BEGIN;

ALTER TABLE clinic_catalog
  ADD COLUMN IF NOT EXISTS publish_to_portal        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_duration_minutes integer;  -- prazo/duração médio do atendimento

COMMIT;
