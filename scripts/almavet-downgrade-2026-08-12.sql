-- Downgrade temporário Almavet (ordem do Diretor 12/08/2026)
-- EXECUTAR SOMENTE APÓS o deploy do checkout specialized (commit na main).
-- Snapshot prévio: scripts/almavet-snapshot-2026-08-12.json
-- Reversão de emergência: scripts/restore-almavet.mjs
BEGIN;

-- 1) Assinatura: mensalidade 49,90 + estado pendente + snapshot de restauração
--    (payment_payload.restore é lido pelo webhook no PAYMENT_CONFIRMED para
--    devolver a clínica EXATAMENTE ao estado atual)
UPDATE tenant_subscriptions SET
  custom_price        = 49.90,
  lifecycle_state     = 'pending',
  is_grandfathered    = false,
  last_payment_status = 'PENDING',
  billing_cycle       = 'monthly',
  updated_at          = now(),
  payment_payload     = coalesce(payment_payload, '{}'::jsonb) || jsonb_build_object(
    'restore', jsonb_build_object(
      'contract_keys',  (select jsonb_agg(module_key order by module_key)
                           from clinic_contracted_modules
                          where clinic_id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae'),
      'active_modules', (select active_modules from clinics
                          where id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae'),
      'flow_config',    (select flow_config from clinics
                          where id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae')
    )
  )
WHERE clinic_id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae';

-- 2) Contratos: desativa tudo EXCETO caixa, cadastros (edição de preços) e mentor
UPDATE clinic_contracted_modules
   SET is_active = false, updated_at = now()
 WHERE clinic_id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae'
   AND module_key NOT IN ('cashier', 'registry', 'mentor');

-- 3) Camada técnica (menu) + flags de fluxo restritos
UPDATE clinics SET
  active_modules = '["reception","patients","consultation","management","cashier","registry","mentor"]'::jsonb,
  flow_config    = flow_config || '{"internacao_completa": false, "centro_cirurgico": false, "tef_integration": false}'::jsonb
WHERE id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae';

COMMIT;

-- Verificação
SELECT plan_name, status, lifecycle_state, custom_price, is_grandfathered,
       payment_payload->'restore'->'contract_keys' IS NOT NULL AS restore_ok
  FROM tenant_subscriptions
 WHERE clinic_id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae';
SELECT active_modules FROM clinics WHERE id = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae';
