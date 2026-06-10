-- 0367 — Complemento do grandfathering (0365): contratos a partir de FLOW FLAGS.
-- O backfill 0365 copiou apenas clinics.active_modules; módulos gated por
-- clinics.flow_config (internacao_completa/centro_cirurgico → catálogo
-- hospitalization_surgery) ficaram sem linha contratada. Sem isto, qualquer
-- sync do contrato (subscribe/downgrade/runbook specialized) DESLIGARIA as
-- flags dessas clínicas. Genérico: vale para qualquer módulo futuro do
-- catálogo que use flow_flags. Idempotente.
BEGIN;

INSERT INTO clinic_contracted_modules (clinic_id, module_key)
  SELECT DISTINCT c.id, cat.module_key
  FROM clinics c
  JOIN subscription_module_catalog cat
    ON cardinality(cat.flow_flags) > 0
  JOIN LATERAL unnest(cat.flow_flags) AS f(flag) ON TRUE
  WHERE (c.flow_config ->> f.flag)::boolean IS TRUE
  ON CONFLICT (clinic_id, module_key) DO NOTHING;

COMMIT;
