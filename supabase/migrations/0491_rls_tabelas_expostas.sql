-- 0491 — Fecha as tabelas que ficaram no schema `public` SEM RLS.
--
-- Alerta de segurança do Supabase (03/10/2026). Tabela em `public` sem RLS é
-- legível E gravável por qualquer um que tenha a URL do projeto + a chave
-- anônima — e a chave anônima é pública por natureza (vai no bundle do
-- navegador). Não é "difícil de achar": é aberto.
--
-- GRAVIDADE REAL — `pending_registrations` não é só leitura de cadastro:
-- o callback de confirmação de e-mail (src/app/auth/callback/route.ts) lê essa
-- tabela pelo e-mail e, se houver `clinic_id`, ANEXA o usuário recém-confirmado
-- àquela clínica como `receptionist`, sem outra validação. Com a tabela aberta,
-- bastava inserir uma linha com o próprio e-mail e o clinic_id de uma clínica
-- alvo, confirmar o cadastro, e entrar nela. Era escalonamento de privilégio.
--
-- Ligar RLS NÃO quebra nada: os 23 pontos do código que tocam estas tabelas
-- usam o service role (createAdminClient), que passa por cima de RLS. As
-- tabelas com `clinic_id` ganham policy de tenant por profundidade; a de
-- cadastro pendente fica sem policy (nega tudo), porque ela é escrita ANTES de
-- existir usuário autenticado — só o servidor pode mexer.

-- ── Cadastro pendente (produção e testes) ───────────────────────────────────
ALTER TABLE IF EXISTS pending_registrations ENABLE ROW LEVEL SECURITY;

-- ── Tabelas que ficaram abertas só no ambiente de testes ────────────────────
ALTER TABLE IF EXISTS clinic_bank_integrations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bank_statement_entry_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS partner_clinic_commissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='clinic_bank_integrations' AND column_name='clinic_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='clinic_bank_integrations'
                AND policyname='clinic_bank_integrations_tenant') THEN
    CREATE POLICY clinic_bank_integrations_tenant ON clinic_bank_integrations
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='bank_statement_entry_links' AND column_name='clinic_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='bank_statement_entry_links'
                AND policyname='bank_statement_entry_links_tenant') THEN
    CREATE POLICY bank_statement_entry_links_tenant ON bank_statement_entry_links
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='partner_clinic_commissions' AND column_name='clinic_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='partner_clinic_commissions'
                AND policyname='partner_clinic_commissions_tenant') THEN
    CREATE POLICY partner_clinic_commissions_tenant ON partner_clinic_commissions
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

COMMENT ON TABLE pending_registrations IS
  'Cadastro aguardando confirmação de e-mail. RLS ligada SEM policy de propósito: só o service role escreve, pois a linha nasce antes de existir usuário autenticado. O callback usa clinic_id daqui para anexar o usuário a uma clínica — deixar aberta permitia adesão indevida.';
