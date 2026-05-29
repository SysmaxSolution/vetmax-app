-- =============================================================================
-- VetMax — Migration 0208: alinha handle_email_confirmed() ao Freemium PLG
--
-- Contexto:
--  A função handle_email_confirmed() (trigger AFTER UPDATE em auth.users) é
--  quem REALMENTE cria a clínica quando o email é confirmado — o callback
--  Next.js em /auth/callback chega depois e retorna early ao ver
--  profile.clinic_id já preenchido.
--
--  A versão anterior dessa função (legado pré-Freemium) inseria a clínica
--  com:  INSERT INTO clinics (name, status) VALUES (..., 'pending');
--  hardcoded → toda clínica nova caía na tela "Clínica em Análise" do
--  dashboard/layout.tsx (gate `clinicStatus === 'pending'`).
--
--  O refator Freemium PLG (migrations 0189–0190) mudou o default de
--  clinics.status para 'active' e removeu o status='pending' do callback
--  Next.js — mas esqueceu esse trigger Postgres, que continuou inserindo
--  pending. Resultado: o PLG ficou bloqueado em produção.
--
-- O que muda:
--  1. INSERT em clinics deixa de passar status → herda o default 'active'
--     (migration 0190).
--  2. INSERT passa business_type lido de pending_registrations, garantindo
--     que o trigger AFTER INSERT trg_clinics_freemium_seed (0189) acerte
--     os active_modules do segmento certo (vet_clinic vs pet_aesthetics).
--  3. Leitura de pending_registrations passa a também trazer business_type
--     e a respeitar valores já vindos em raw_user_meta_data (fonte primária).
--
-- Idempotente (CREATE OR REPLACE). Não altera o trigger nem a coluna.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_name   text;
  v_full_name     text;
  v_business_type text;
  v_clinic_id     uuid;
  v_pending       record;
BEGIN
  -- Só dispara quando email_confirmed_at é RECÉM definido
  IF NEW.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Evita duplicata: se já tem clinic_id, não refaz
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.id AND clinic_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Fonte primária: user_metadata (gravado em supabase.auth.signUp options.data)
  v_full_name   := NEW.raw_user_meta_data->>'full_name';
  v_clinic_name := NEW.raw_user_meta_data->>'clinic_name';

  -- Complementa com pending_registrations (única fonte de business_type/cnpj)
  SELECT full_name, clinic_name, business_type
    INTO v_pending
    FROM public.pending_registrations
   WHERE lower(email) = lower(NEW.email)
   LIMIT 1;

  IF FOUND THEN
    v_full_name     := COALESCE(NULLIF(v_full_name,   ''), v_pending.full_name);
    v_clinic_name   := COALESCE(NULLIF(v_clinic_name, ''), v_pending.clinic_name);
    v_business_type := v_pending.business_type;
  END IF;

  -- Sem nome de clínica = usuário de convite ou fluxo externo, não criar
  IF v_clinic_name IS NULL OR v_clinic_name = '' THEN
    RETURN NEW;
  END IF;

  -- Cria clínica SEM passar status — herda o default 'active' da coluna
  -- (migration 0190 Freemium PLG). Passa business_type para que o trigger
  -- trg_clinics_freemium_seed (0189) acerte os active_modules.
  INSERT INTO public.clinics (name, business_type)
  VALUES (
    v_clinic_name,
    COALESCE(NULLIF(v_business_type, ''), 'vet_clinic')
  )
  RETURNING id INTO v_clinic_id;

  -- Cria/atualiza perfil
  INSERT INTO public.profiles (id, clinic_id, full_name, role)
  VALUES (
    NEW.id,
    v_clinic_id,
    COALESCE(NULLIF(v_full_name, ''), split_part(NEW.email, '@', 1)),
    'admin'
  )
  ON CONFLICT (id) DO UPDATE SET
    clinic_id = v_clinic_id,
    full_name = COALESCE(NULLIF(v_full_name, ''), split_part(NEW.email, '@', 1)),
    role      = 'admin';

  -- Vínculo multi-clínica
  INSERT INTO public.user_clinics (user_id, clinic_id, role)
  VALUES (NEW.id, v_clinic_id, 'admin')
  ON CONFLICT (user_id, clinic_id) DO NOTHING;

  -- Remove registro temporário
  DELETE FROM public.pending_registrations WHERE lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_email_confirmed() IS
  'Trigger AFTER UPDATE em auth.users: ao confirmar email, cria clinics+profiles+user_clinics. Refator Freemium 2026-05-29 (0208): deixou de hardcodar status=pending (herda default active de 0190) e passa business_type do pending_registrations para acionar fn_clinics_after_insert_freemium (0189) com o segmento correto.';

COMMIT;
