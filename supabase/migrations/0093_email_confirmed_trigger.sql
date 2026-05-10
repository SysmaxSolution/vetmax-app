-- Migration 0093: Trigger de criação de clínica ao confirmar e-mail (G-01)
-- Resolve bug mobile onde o callback /auth/callback falha por PKCE sem cookies.
-- A clínica é criada diretamente no banco quando email_confirmed_at é setado,
-- independente do browser ou fluxo de autenticação usado.

CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_name text;
  v_full_name   text;
  v_clinic_id   uuid;
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

  -- Fonte primária: user_metadata (passado no signUp)
  v_full_name   := NEW.raw_user_meta_data->>'full_name';
  v_clinic_name := NEW.raw_user_meta_data->>'clinic_name';

  -- Fallback: tabela pending_registrations
  IF v_clinic_name IS NULL OR v_clinic_name = '' THEN
    SELECT full_name, clinic_name
      INTO v_full_name, v_clinic_name
      FROM public.pending_registrations
     WHERE lower(email) = lower(NEW.email)
     LIMIT 1;
  END IF;

  -- Sem nome de clínica = usuário de convite ou fluxo externo, não criar
  IF v_clinic_name IS NULL OR v_clinic_name = '' THEN
    RETURN NEW;
  END IF;

  -- Cria clínica com status pending (aguarda aprovação Sysmax)
  INSERT INTO public.clinics (name, status)
  VALUES (v_clinic_name, 'pending')
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
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_confirmed();
