-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0412: via de administração na vacina (modelo CFMV da carteira)
-- ───────────────────────────────────────────────────────────────────────────
-- A carteira de vacinação CFMV (Res. 1321/2020) exige a VIA DE ADMINISTRAÇÃO de
-- cada ato vacinal (SC/IM/ID/oral/intranasal). Único campo do conteúdo mínimo
-- que ainda não existia em patient_vaccines (fabricante/lote/validade/dose vieram
-- na 0400). Aditiva, nullable.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS administration_route TEXT;

COMMENT ON COLUMN patient_vaccines.administration_route IS
  'Via de administração (SC, IM, ID, oral, intranasal) — exigência CFMV Res. 1321/2020.';
