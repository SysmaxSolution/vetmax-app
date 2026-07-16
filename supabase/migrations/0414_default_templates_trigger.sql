-- ════════════════════════════════════════════════════════════════════════════
-- 0414 — Layouts padrão automáticos para clínicas novas
--
-- 1) Tabela-biblioteca `default_document_templates`: guarda a versão canônica
--    dos 9 documentos essenciais (Res. CFMV 1.321/2020 + Port. SVS/MS 344/98).
--    Populada/atualizada por scripts/seed-default-canva-templates.mjs.
-- 2) Trigger AFTER INSERT em `clinics`: copia a biblioteca para toda clínica
--    recém-cadastrada — exceto Almavet (layouts próprios, regra de negócio).
--
-- Fail-open: erro na cópia NUNCA bloqueia o cadastro da clínica (o signup é
-- mais importante que o seed; incidente de cadastro de 09/07 é precedente).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.default_document_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  type             text NOT NULL,
  engine           text NOT NULL DEFAULT 'canva-native',
  extracted_fields jsonb,
  canvas_state     jsonb,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT default_document_templates_name_type_key UNIQUE (name, type)
);

COMMENT ON TABLE public.default_document_templates IS
  'Biblioteca canônica dos layouts padrão de documentos (motor canva-native). '
  'Fonte: scripts/seed-default-canva-templates.mjs. Copiada para clínicas novas '
  'pelo trigger clinics_seed_default_templates.';

-- Tabela de sistema: sem policies — apenas service_role e funções
-- SECURITY DEFINER acessam. RLS ligado nega acesso a authenticated/anon.
ALTER TABLE public.default_document_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.seed_default_templates_for_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Almavet mantém apenas os layouts próprios (regra de negócio)
  IF NEW.name ILIKE '%almavet%' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.document_templates
         (clinic_id, name, type, engine, extracted_fields, canvas_state)
  SELECT NEW.id, d.name, d.type, d.engine, d.extracted_fields, d.canvas_state
    FROM public.default_document_templates d
   WHERE d.is_active
     AND d.canvas_state IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.document_templates t
            WHERE t.clinic_id = NEW.id
              AND t.name = d.name
              AND t.type = d.type
         );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[seed_default_templates_for_clinic] clinic %: % — cadastro segue sem os layouts padrão',
    NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinics_seed_default_templates ON public.clinics;
CREATE TRIGGER clinics_seed_default_templates
  AFTER INSERT ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_templates_for_clinic();

COMMENT ON TRIGGER clinics_seed_default_templates ON public.clinics IS
  'Copia os layouts padrão (default_document_templates) para toda clínica nova, exceto Almavet.';
