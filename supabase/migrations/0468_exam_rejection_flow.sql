-- 0468 — Fluxo de Rejeição de Exame (laboratório de referência).
-- Tudo aditivo e inerte enquanto a clínica não ligar a flag
-- clinics.flow_config.usa_fluxo_rejeicao_exame. Nenhum default novo, nenhum
-- trigger: colunas nascem NULL e só são escritas pelas actions gateadas.

-- ─── (a) Catálogo de motivos de rejeição, por clínica ────────────────────────
-- A lista definitiva é da clínica (editável pela UI); semeamos os motivos
-- comuns de rejeição de amostra no momento em que a clínica liga a flag.
CREATE TABLE IF NOT EXISTS exam_rejection_reasons (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL,             -- chave estável (ex.: lipemica)
  label       TEXT        NOT NULL,             -- rótulo exibido ao laboratório
  description TEXT,                             -- orientação ao cliente
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_rej_reason_clinic_code
  ON exam_rejection_reasons (clinic_id, code);
CREATE INDEX IF NOT EXISTS idx_exam_rej_reason_clinic
  ON exam_rejection_reasons (clinic_id, sort_order) WHERE is_active;

ALTER TABLE exam_rejection_reasons ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role (server actions já isolam por clinic_id).

-- ─── (b) Máquina de estados na LINHA COBRÁVEL do exame ───────────────────────
-- consultation_services é a única fonte de faturamento (generateInvoice,
-- generatePartialInvoice e rpc_absorb_services_into_open_invoice leem daqui),
-- então o estado do exame mora na própria linha: rejeitar a amostra e tirar o
-- exame da cobrança viram a MESMA operação, sem depender de alguém lembrar.
ALTER TABLE consultation_services
  -- NULL = linha fora do fluxo (comportamento atual, todos os outros clientes).
  ADD COLUMN IF NOT EXISTS exam_state TEXT
    CHECK (exam_state IS NULL OR exam_state IN
      ('pending','performed','rejected','recollect_requested','closed_no_recollect')),
  -- Quem rejeitou, quando, por quê (rastreabilidade exigida).
  ADD COLUMN IF NOT EXISTS exam_rejected_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exam_rejected_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exam_rejection_reason_id UUID REFERENCES exam_rejection_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exam_rejection_note      TEXT,
  -- Decisão do cliente (quem encaminhou): recoletar ou não.
  ADD COLUMN IF NOT EXISTS exam_client_decision TEXT
    CHECK (exam_client_decision IS NULL OR exam_client_decision IN ('recollect','no_recollect')),
  ADD COLUMN IF NOT EXISTS exam_decided_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exam_decided_by_kind  TEXT
    CHECK (exam_decided_by_kind IS NULL OR exam_decided_by_kind IN ('partner','tutor','staff')),
  ADD COLUMN IF NOT EXISTS exam_decided_by_label TEXT,
  -- Vínculo 1ª coleta ↔ recoleta: a coleta original NUNCA é apagada.
  ADD COLUMN IF NOT EXISTS exam_recollect_of_id UUID REFERENCES consultation_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exam_attempt_no      INT,
  -- Prazo/nova data de retorno da coleta (recoleta abre prazo novo).
  ADD COLUMN IF NOT EXISTS exam_return_deadline DATE,
  -- TRAVA DE COBRANÇA: enquanto não for NULL, a linha não entra em fatura.
  -- Só é escrita pelo fluxo gateado; para quem não usa a flag é sempre NULL.
  ADD COLUMN IF NOT EXISTS exam_billing_hold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exam_notified_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cs_exam_hold
  ON consultation_services (clinic_id, consultation_id)
  WHERE exam_billing_hold_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cs_exam_rejected
  ON consultation_services (clinic_id, exam_rejected_at DESC)
  WHERE exam_rejected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cs_exam_recollect_of
  ON consultation_services (exam_recollect_of_id)
  WHERE exam_recollect_of_id IS NOT NULL;

COMMENT ON COLUMN consultation_services.exam_billing_hold_at IS
  'Fluxo de rejeição de exame: enquanto preenchida, a linha NÃO entra em fatura. NULL para toda clínica sem a flag usa_fluxo_rejeicao_exame.';
COMMENT ON COLUMN consultation_services.exam_recollect_of_id IS
  'Linha da coleta anterior que esta recoleta substitui. A 1ª coleta é preservada com o motivo da rejeição.';
