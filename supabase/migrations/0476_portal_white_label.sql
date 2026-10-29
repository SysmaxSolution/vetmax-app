-- 0476 — White-label do Portal do Tutor por clínica.
--
-- Duas coisas, ambas ADITIVAS e idempotentes:
--
-- 1) `clinics.portal_slug` — o contexto de clínica na URL (`/portal/c/<slug>`).
--    Sem ele o portal não tem como saber "de quem" é a página quando o mesmo
--    tutor é atendido em duas clínicas. Único (parcial, ignorando NULL) e
--    preenchido a partir do nome, com tratamento de colisão (`-2`, `-3`…).
--
-- 2) `clinic_portal_themes` — a identidade visual (cores, fonte de título,
--    capa, frase do herói). Tabela NOVA em vez de colunas em `clinic_settings`
--    de propósito:
--      · `clinic_settings` é larga, quente e compartilhada por vários módulos —
--        o incidente de `reports_enabled` (0475) mostrou o custo de fazer o
--        schema dela derivar;
--      · esta é lida no caminho PÚBLICO do portal (por tutor não autenticado no
--        Supabase), então quanto menor a linha e mais restrito o objeto, melhor;
--      · cardinalidade 1:1 com a clínica, ciclo de vida próprio, e dá para
--        acrescentar campos de tema sem tocar em nada do resto do sistema.
--
-- Nenhum DROP, nenhum RENAME, nenhum trigger. Clínica sem linha em
-- `clinic_portal_themes` continua vendo o tema PADRÃO (o mesmo de hoje).

-- ── 1) Slug por clínica ──────────────────────────────────────────────────────
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS portal_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinics_portal_slug
  ON clinics (portal_slug) WHERE portal_slug IS NOT NULL;

-- Backfill: só preenche quem está NULL. Rodar de novo não mexe em nada.
DO $$
DECLARE
  r        RECORD;
  base     text;
  cand     text;
  n        integer;
BEGIN
  FOR r IN SELECT id, name FROM clinics WHERE portal_slug IS NULL ORDER BY created_at NULLS LAST, id LOOP
    -- translate() em vez da extensão `unaccent`: não exige extensão instalada
    -- e cobre o acervo do português sem depender de collation.
    base := regexp_replace(
              regexp_replace(
                lower(translate(coalesce(r.name, ''),
                  'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                  'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
              '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g');
    base := left(base, 40);
    base := regexp_replace(base, '-+$', '', 'g');
    IF base = '' THEN base := 'clinica'; END IF;

    cand := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM clinics WHERE portal_slug = cand) LOOP
      n := n + 1;
      cand := regexp_replace(left(base, 40 - length('-' || n)), '-+$', '', 'g') || '-' || n;
    END LOOP;

    UPDATE clinics SET portal_slug = cand WHERE id = r.id;
  END LOOP;
END $$;

-- ── 2) Tema do portal por clínica ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_portal_themes (
  clinic_id          uuid PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  bg_color           text,
  surface_color      text,
  primary_color      text,
  primary_dark_color text,
  accent_color       text,
  text_color         text,
  muted_color        text,
  border_color       text,
  heading_font       text,
  cover_image_url    text,
  tagline            text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Multi-tenancy: a PK já é o clinic_id (uma linha por clínica, sem chance de
-- vazamento por linha órfã). RLS restringe a leitura/escrita autenticada à
-- própria clínica; o portal público lê pelo service_role (admin client), que
-- ignora RLS por definição e já aplica o isolamento em código.
ALTER TABLE clinic_portal_themes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_portal_themes' AND policyname='clinic_portal_themes_tenant') THEN
    CREATE POLICY clinic_portal_themes_tenant ON clinic_portal_themes
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;
