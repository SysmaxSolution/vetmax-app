-- =============================================================================
-- VetMax — Migration 0506: ciclo de repasse e valor intermediário do convênio
-- Clínica Animais · Fase 1 · item 1.9. Issue #66.
--
-- CONTEXTO
-- --------
-- A conferência do convênio AVA é a dor nº 8 do blueprint administrativo: a
-- Bruna confere "manual, diariamente, ordem de serviço uma a uma". O motor de
-- conciliação já existe (importação genérica de demonstrativo com de-para de
-- colunas, match, aplicação e estorno), e `petlove_remittances` já guarda
-- `period_start`/`period_end` — qualquer janela já é suportada.
--
-- Falta o que esta migration entrega: a REGRA do convênio sai do código e vai
-- para a configuração, decidida pelo Diretor em 17/10/2026.
--
--   1. Ciclo de repasse — diário, semanal, mensal ou período livre, com dia de
--      referência. Hoje a janela do fechamento é sempre digitada à mão.
--
--   2. Valor intermediário (coparticipação) fixo no nível do convênio —
--      percentual, valor fixo ou sem cobrança — como ALTERNATIVA ao split item
--      a item que já existe. Hoje, quando não há split cadastrado para o par
--      pet+item, o pet conveniado cai em particular puro e a tela exige que
--      alguém digite copay e repasse em cada atendimento. É exatamente o caso
--      da guia "ENCAMINHADA" da AVA, em que o tutor paga um valor intermediário.
--
--   3. O convênio passa a ser snapshotado na linha de serviço. Sem isso, se o
--      pet troca de convênio, não há como saber de quem era a cobrança de um
--      atendimento antigo — e o fechamento de um período fechado mudaria de
--      resultado depois. Snapshot é a regra da casa desde a 0188.
--
-- Colunas tipadas com CHECK em vez de chaves no `config` JSONB: isto define
-- dinheiro (quanto o tutor paga e quanto o convênio deve), e CHECK de banco é
-- contrato, enquanto JSONB solto é esperança.
--
-- Aditiva e idempotente. Com `copay_mode='per_item'` (o padrão) o
-- comportamento das clínicas atuais não muda em nada.
-- =============================================================================

BEGIN;

-- ─── 1. ciclo de repasse ────────────────────────────────────────────────────

ALTER TABLE insurance_providers
  ADD COLUMN IF NOT EXISTS repass_cycle     TEXT    NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS repass_cycle_day INTEGER;

ALTER TABLE insurance_providers DROP CONSTRAINT IF EXISTS insurance_providers_repass_cycle_check;
ALTER TABLE insurance_providers ADD  CONSTRAINT insurance_providers_repass_cycle_check
  CHECK (repass_cycle IN ('daily', 'weekly', 'monthly', 'custom'));

-- Semanal: 0 = domingo … 6 = sábado. Mensal: dia 1 a 31 (meses curtos caem no
-- último dia, resolvido no cálculo da janela). Diário e livre ignoram o campo.
ALTER TABLE insurance_providers DROP CONSTRAINT IF EXISTS insurance_providers_repass_cycle_day_check;
ALTER TABLE insurance_providers ADD  CONSTRAINT insurance_providers_repass_cycle_day_check
  CHECK (
    repass_cycle_day IS NULL
    OR (repass_cycle = 'weekly' AND repass_cycle_day BETWEEN 0 AND 6)
    OR (repass_cycle = 'monthly' AND repass_cycle_day BETWEEN 1 AND 31)
    OR repass_cycle IN ('daily', 'custom')
  );

COMMENT ON COLUMN insurance_providers.repass_cycle IS
  'Periodicidade do fechamento com o convenio: daily | weekly | monthly | custom (janela escolhida a mao).';
COMMENT ON COLUMN insurance_providers.repass_cycle_day IS
  'Dia de referencia do ciclo: 0-6 (domingo a sabado) no semanal, 1-31 no mensal. NULL nos demais.';

-- ─── 2. valor intermediário (coparticipação) ────────────────────────────────

ALTER TABLE insurance_providers
  ADD COLUMN IF NOT EXISTS copay_mode    TEXT          NOT NULL DEFAULT 'per_item',
  ADD COLUMN IF NOT EXISTS copay_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS copay_fixed   NUMERIC(10,2);

ALTER TABLE insurance_providers DROP CONSTRAINT IF EXISTS insurance_providers_copay_mode_check;
ALTER TABLE insurance_providers ADD  CONSTRAINT insurance_providers_copay_mode_check
  CHECK (copay_mode IN ('per_item', 'percent', 'fixed', 'none'));

-- Coerência: o modo escolhido exige o seu número, e dentro de faixa. Sem isto,
-- um convênio em 'percent' com percentual NULL faria o tutor pagar zero e a
-- clínica descobrir no fechamento.
ALTER TABLE insurance_providers DROP CONSTRAINT IF EXISTS insurance_providers_copay_coerencia_check;
ALTER TABLE insurance_providers ADD  CONSTRAINT insurance_providers_copay_coerencia_check
  CHECK (
    (copay_mode = 'percent' AND copay_percent IS NOT NULL AND copay_percent >= 0 AND copay_percent <= 100)
    OR (copay_mode = 'fixed' AND copay_fixed IS NOT NULL AND copay_fixed >= 0)
    OR copay_mode IN ('per_item', 'none')
  );

COMMENT ON COLUMN insurance_providers.copay_mode IS
  'Como sai o valor intermediario que o tutor paga: per_item (split cadastrado por pet+item, padrao e comportamento historico) | percent (percentual do total) | fixed (valor fixo por item) | none (tutor nao paga nada, convenio deve o total).';
COMMENT ON COLUMN insurance_providers.copay_percent IS
  'Percentual do total que fica com o tutor quando copay_mode = percent. O restante e o repasse devido pelo convenio.';
COMMENT ON COLUMN insurance_providers.copay_fixed IS
  'Valor fixo por item que fica com o tutor quando copay_mode = fixed. Nunca passa do total do item — o calculo trava no total.';

-- ─── 3. convênio snapshotado na linha de serviço ────────────────────────────

ALTER TABLE consultation_services
  ADD COLUMN IF NOT EXISTS insurance_provider_id UUID REFERENCES insurance_providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consultation_services_provider
  ON consultation_services (insurance_provider_id, created_at DESC)
  WHERE insurance_provider_id IS NOT NULL;

COMMENT ON COLUMN consultation_services.insurance_provider_id IS
  'Convenio vigente para o pet no momento do lancamento. Snapshot: preserva de quem era a cobranca mesmo que o pet troque de convenio depois, e mantem estavel o fechamento de um periodo ja fechado. NULL em linhas anteriores a 0506 e em atendimento particular.';

COMMIT;
