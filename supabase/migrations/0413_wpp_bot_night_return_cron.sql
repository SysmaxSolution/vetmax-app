-- 0413: Devolução automática de conversas ao bot noturno do WhatsApp (pg_cron)
--
-- Contexto (Almavet, 2026-07-14): conversas assumidas pela equipe ficam em
-- status 'human' para sempre e o bot noturno nunca responde clientes
-- recorrentes. Regra acordada com o cliente:
--   • 30 min após o INÍCIO do expediente do bot (ex.: janela 18:01→07:59
--     ⇒ às 18:31), conversas em modo humano SEM interação humana nos últimos
--     30 minutos voltam para o bot.
--   • Proteção de conversas pessoais: mensagem enviada pelo CELULAR da
--     clínica (fromMe) passa a conversa para 'human' imediatamente — handoff
--     já existente no webhook (route.ts de webhooks/whatsapp).
--
-- O job roda a cada 15 min e só age no slot [início+30, início+45) avaliado
-- no fuso da clínica (America/Sao_Paulo). Aplica-se apenas a bots ativos com
-- janela fixa (use_clinic_hours = false).
--
-- OBS: este arquivo foi aplicado manualmente em produção em 2026-07-14.
-- Reaplicar é seguro (unschedule + schedule).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('wpp-bot-night-return')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wpp-bot-night-return');

SELECT cron.schedule('wpp-bot-night-return', '*/15 * * * *', $JOB$
UPDATE whatsapp_conversations conv
SET status = 'bot'
FROM whatsapp_bot_config cfg
WHERE cfg.clinic_id = conv.clinic_id
  AND cfg.is_active
  AND COALESCE(cfg.use_clinic_hours, false) = false
  AND cfg.working_hours_start IS NOT NULL
  AND cfg.working_hours_end IS NOT NULL
  AND conv.status = 'human'
  -- slot [início+30, início+45) no fuso da clínica, com virada de meia-noite
  AND (
    SELECT CASE WHEN s <= e THEN cur >= s AND cur < e ELSE cur >= s OR cur < e END
    FROM (
      SELECT
        ((EXTRACT(hour FROM cfg.working_hours_start)*60 + EXTRACT(minute FROM cfg.working_hours_start))::int + 30) % 1440 AS s,
        ((EXTRACT(hour FROM cfg.working_hours_start)*60 + EXTRACT(minute FROM cfg.working_hours_start))::int + 45) % 1440 AS e,
        (EXTRACT(hour FROM (now() AT TIME ZONE 'America/Sao_Paulo'))*60 + EXTRACT(minute FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::int AS cur
    ) t
  )
  -- humano interagiu nos últimos 30 min? então continua com o humano
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_messages m
    WHERE m.conversation_id = conv.id
      AND m.sent_by = 'human'
      AND m.created_at > now() - interval '30 minutes'
  )
$JOB$);
