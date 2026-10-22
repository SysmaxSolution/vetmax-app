-- 0498: tira do papel `anon` os privilégios de escrita em três tabelas
-- financeiras, e garante RLS ligado nas três.
--
-- Achado em 09/10/2026 comparando o schema de testes com o de produção
-- (scripts/deriva-dev-prod.mjs). As três tabelas têm, por DEFAULT PRIVILEGES
-- do Supabase, `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`
-- concedidos a `anon` — o papel de quem NÃO está autenticado:
--
--   bank_statement_entry_links  (vínculo extrato × título)
--   clinic_bank_integrations    (configuração bancária da clínica)
--   partner_clinic_commissions  (comissão de clínica parceira)
--
-- Hoje isso não é explorável: em produção o RLS está ligado e as três estão
-- com ZERO políticas, o que nega tudo para anon e authenticated — quem acessa
-- é o service_role das server actions, que ignora RLS. Ou seja, o grant está
-- inerte.
--
-- O problema é o que ele vira depois. No dia em que alguém criar uma política
-- permissiva nessas tabelas (no banco de testes elas JÁ têm uma política
-- `_tenant`), o grant deixa de ser inerte e `anon` passa a poder apagar
-- vínculo de conciliação e truncar a configuração bancária. Defesa em
-- profundidade: sem o grant, a política sozinha não abre a porta.
--
-- `authenticated` fica como está de propósito: no banco de testes a política
-- `_tenant` depende dele, e revogar aqui quebraria leitura legítima por token
-- de usuário. O que trava `authenticated` é a política, não o grant.
--
-- Aditiva e idempotente: REVOKE de privilégio ausente não é erro, e
-- ENABLE ROW LEVEL SECURITY em tabela que já tem é no-op.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_statement_entry_links',
    'clinic_bank_integrations',
    'partner_clinic_commissions'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
