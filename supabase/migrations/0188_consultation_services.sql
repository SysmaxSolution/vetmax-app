-- =============================================================================
-- VetMax — Migration 0188: refator do fluxo financeiro/serviços
--
-- Decisões arquiteturais (alinhadas com PO):
--   1. Catálogo passa a ser stock_items (is_service=TRUE) — fonte única.
--   2. clinic_catalog fica DEPRECATED (não migra dados existentes; clínicas
--      atuais continuam usando até o consumidor ser refatorado em commits
--      seguintes). Apenas clínicas NOVAS recebem seed automático.
--   3. visit_reason (enum no consultations) FICA como classificação clínica.
--      Não é o mesmo que serviço cobrado. Coexiste com consultation_services.
--   4. n:n via consultation_services com snapshot de price/name — vet pode
--      adicionar mais itens em qualquer momento (check-in, triagem,
--      consultório, checkout).
--   5. Snapshot na seleção: alteração futura do stock_items.unit_price NÃO
--      atualiza serviços já lançados na consulta (compromisso comercial
--      preservado).
-- =============================================================================

BEGIN;

-- ─── consultation_services (tabela de junção n:n) ──────────────────────────

CREATE TABLE IF NOT EXISTS consultation_services (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID         NOT NULL REFERENCES clinics(id)        ON DELETE CASCADE,
  consultation_id    UUID         NOT NULL REFERENCES consultations(id)  ON DELETE CASCADE,
  stock_item_id      UUID         NOT NULL REFERENCES stock_items(id)    ON DELETE RESTRICT,

  /** Snapshot do nome no momento da seleção — preserva display histórico
   *  mesmo se o item for renomeado no estoque depois. */
  name_snapshot      TEXT         NOT NULL,

  /** Snapshot do preço unitário no momento da seleção. NUNCA muda sozinho;
   *  o checkout exibe alerta se diferir do preço atual do stock_item. */
  price_snapshot     NUMERIC(10,2) NOT NULL CHECK (price_snapshot >= 0),

  quantity           NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),

  /** Em qual etapa do atendimento o item foi adicionado — auditoria de fluxo. */
  added_at_stage     TEXT         NOT NULL DEFAULT 'reception'
                                   CHECK (added_at_stage IN ('reception', 'triage', 'vet', 'checkout')),

  added_by           UUID         REFERENCES profiles(id) ON DELETE SET NULL,

  /** Quando o serviço é REMOVIDO (vet trocou de consulta para retorno, etc.),
   *  marcamos com cancelled_at em vez de DELETAR — preserva trilha de auditoria.
   *  Queries operacionais filtram WHERE cancelled_at IS NULL. */
  cancelled_at       TIMESTAMPTZ,
  cancelled_by       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  cancel_reason      TEXT,

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_services_consultation_active
  ON consultation_services (consultation_id, created_at ASC)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_consultation_services_clinic
  ON consultation_services (clinic_id);

CREATE INDEX IF NOT EXISTS idx_consultation_services_stock_item
  ON consultation_services (stock_item_id);

ALTER TABLE consultation_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_consultation_services" ON consultation_services;
CREATE POLICY "clinic_isolation_consultation_services"
  ON consultation_services FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- Touch updated_at em UPDATE
CREATE OR REPLACE FUNCTION fn_touch_consultation_services_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cs_updated_at ON consultation_services;
CREATE TRIGGER trg_cs_updated_at
  BEFORE UPDATE ON consultation_services
  FOR EACH ROW
  EXECUTE FUNCTION fn_touch_consultation_services_updated_at();

COMMENT ON TABLE consultation_services IS
  'Serviços/produtos lançados durante uma consulta (n:n consultations × stock_items). Snapshot de preço/nome preserva compromisso comercial; cancelled_at em vez de DELETE preserva auditoria.';

-- ─── DEPRECIAÇÃO de clinic_catalog ──────────────────────────────────────────

COMMENT ON TABLE clinic_catalog IS
  'DEPRECATED (2026-05-25). Migrado para stock_items (is_service=TRUE para serviços, is_service=FALSE para produtos). Não inserir novas linhas — consumidores devem ler de stock_items via searchServices(). Tabela permanece para retrocompat dos consumidores legados (billing.ts, catalog.ts, whatsapp-agent.ts) até serem refatorados nos commits 2 e 3.';

-- ─── Seed automático para clínicas NOVAS ────────────────────────────────────
-- Função que insere 2 serviços padrão (Consulta + Exame) em stock_items para
-- uma clínica recém-criada. Idempotente: pula nomes que já existem.

CREATE OR REPLACE FUNCTION fn_seed_default_services_for_clinic(p_clinic_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Consulta padrão (categoria vet_service)
  INSERT INTO stock_items (
    clinic_id, name, category, quantity, unit, min_quantity, unit_price,
    is_service, is_controlled, created_at, updated_at
  )
  SELECT
    p_clinic_id, 'Consulta Clínica', 'vet_service', 0, 'un', 0, 150.00,
    TRUE, FALSE, now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_items
    WHERE clinic_id = p_clinic_id
      AND is_service = TRUE
      AND lower(name) = 'consulta clínica'
  );

  -- Exame padrão
  INSERT INTO stock_items (
    clinic_id, name, category, quantity, unit, min_quantity, unit_price,
    is_service, is_controlled, created_at, updated_at
  )
  SELECT
    p_clinic_id, 'Exame Clínico', 'exam', 0, 'un', 0, 80.00,
    TRUE, FALSE, now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_items
    WHERE clinic_id = p_clinic_id
      AND is_service = TRUE
      AND lower(name) = 'exame clínico'
  );
END;
$$;

COMMENT ON FUNCTION fn_seed_default_services_for_clinic IS
  'Insere serviços padrão (Consulta Clínica + Exame Clínico) em stock_items para uma clínica. Idempotente. Chamada via trigger AFTER INSERT em clinics.';

-- Trigger: AFTER INSERT em clinics → seed automático
CREATE OR REPLACE FUNCTION fn_clinics_after_insert_seed_services()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM fn_seed_default_services_for_clinic(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinics_seed_default_services ON clinics;
CREATE TRIGGER trg_clinics_seed_default_services
  AFTER INSERT ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION fn_clinics_after_insert_seed_services();

COMMIT;
