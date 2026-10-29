-- 0475 — clinic_settings.reports_enabled
--
-- Motivo: `saveReportsEnabled`/`getReportsEnabled` (src/lib/actions/reports-g13.ts)
-- gravam e leem `clinic_settings.reports_enabled`, mas a coluna nunca foi criada
-- por migration alguma. Consequência medida: o `upsert` da tela de configuração
-- erra em silêncio e o `select` cai no REPORTS_DEFAULTS (tudo `true`) — ou seja,
-- a remoção do ALWAYS_ON (commit 123d80b0) não surtia efeito e o administrador
-- continuava sem conseguir desligar um relatório.
--
-- Decisão sobre DEFAULT: **sem DEFAULT, NULL permitido**. O código já trata
-- `null`/não-objeto como "usa os padrões" (todos ligados), que é exatamente o
-- comportamento histórico. Um DEFAULT '{}'::jsonb seria equivalente na leitura,
-- mas escreveria em todas as linhas existentes sem necessidade. NULL é a
-- ausência de configuração; o objeto só nasce quando o admin salva a tela.
--
-- Aditiva e idempotente (IF NOT EXISTS). Isolamento multi-tenant: a tabela já é
-- por `clinic_id` (uma linha por clínica) — a coluna herda esse isolamento.

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS reports_enabled jsonb;

COMMENT ON COLUMN public.clinic_settings.reports_enabled IS
  'Mapa {chave_do_relatorio: boolean} de quais relatórios ficam visíveis para a clínica. NULL = todos ligados (REPORTS_DEFAULTS).';

-- O PostgREST precisa recarregar o schema cache para enxergar a coluna nova;
-- sem isso o upsert continua devolvendo PGRST204 por ~1 min.
NOTIFY pgrst, 'reload schema';
