# G-08 — Auth & Cadastro Aprimorado

**Status:** Em execução  
**Data de aprovação:** 2026-05-12  
**Sprint:** VetMax Feature Sprint

---

## Objetivo

Ampliar os métodos de autenticação do VetMax de e-mail/senha para incluir Google OAuth e telefone/OTP, além de expandir o formulário de cadastro com campos de nome de usuário, telefone, busca de clínica e auto-preenchimento via CNPJ.

---

## Escopo

| Item | Status |
|---|---|
| G08-1: Google OAuth (Supabase config + UI) | ✅ Implementado |
| G08-2: Phone/OTP (Supabase SMS + UI) | ✅ Implementado |
| G08-3: Login multi-método (tabs: Email / Google / Telefone) | ✅ Implementado |
| G08-4: Cadastro expandido (username, phone, clinic search, CNPJ) | ✅ Implementado |
| G08-5: CNPJ auto-fill via `publica.cnpj.ws` | ✅ Implementado |
| G08-6: Avatar sync de OAuth para `profiles.photo_url` | ✅ Implementado |

---

## Decisões Técnicas

### Login Multi-Método
A página `/login` mantém `'use client'` e usa 3 tabs (`email` | `google` | `phone`). Google OAuth e phone OTP são iniciados pelo browser via `@supabase/ssr` browser client. Após verificação bem-sucedida de OTP/OAuth, a server action `completeAuthSession()` finaliza o fluxo (seta cookie `vetmax-role`, trata multi-clínica, redireciona).

### Google OAuth
- Local: habilitado em `supabase/config.toml` com `enabled = true`
- Produção: configurar no painel Supabase → Authentication → Providers → Google (Client ID + Secret do Google Cloud Console)
- Env vars necessárias: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
- Callback URI a registrar no Google Console: `https://<project>.supabase.co/auth/v1/callback`

### Phone/SMS OTP
- Provider: Twilio (configurar em produção via Supabase dashboard)
- Formato: E.164 — o campo de telefone aceita DDD+número; o frontend prepend `+55`
- Local dev: funciona apenas com Twilio configurado (ou test numbers no config.toml)
- Env vars necessárias: `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` (já no config.toml)

### Avatar Sync OAuth
No `/auth/callback` (route handler), ao detectar login OAuth (`app_metadata.provider !== 'email'`), sincroniza `user_metadata.avatar_url` → `profiles.photo_url` (somente se `photo_url` estiver null).

### Cadastro — Joining Existing Clinic
Quando o usuário seleciona uma clínica existente:
- `clinic_id` é armazenado em `pending_registrations`
- `clinic_name` fica null (permitido após migration 0113)
- Após confirmação de e-mail, o callback cria um registro em `user_clinics` com `status = 'pending'`
- Admin da clínica precisa aprovar (fluxo de convite a implementar em G-14)

### CNPJ Lookup
- API pública: `https://publica.cnpj.ws/cnpj/{14_digits}`
- Fetch 100% client-side (sem server action — evita CORS e simplifica)
- Debounce: dispara quando 14 dígitos preenchidos
- Auto-preenche: `nome_fantasia` ou `razao_social` no campo "Nome da Clínica"
- Os dados completos (`cnpj_data jsonb`) são salvos em `clinics` após aprovação

---

## Migrations

### 0113 — `profiles.username` + `pending_registrations` expande
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE pending_registrations
  ALTER COLUMN clinic_name DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id),
  ADD COLUMN IF NOT EXISTS cnpj text;
```

### 0114 — `clinics` dados fiscais
```sql
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS cnpj_data jsonb,
  ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS clinics_cnpj_unique ON clinics(cnpj) WHERE cnpj IS NOT NULL;
```

---

## Arquivos Alterados

| Arquivo | Tipo |
|---|---|
| `supabase/config.toml` | Edit — Google OAuth + SMS enable |
| `supabase/migrations/0113_auth_username.sql` | Create |
| `supabase/migrations/0114_clinics_cnpj.sql` | Create |
| `src/lib/actions/auth.ts` | Edit — `searchClinics`, `completeAuthSession`, `signUpWithClinic` |
| `src/app/auth/callback/route.ts` | Edit — OAuth routing + avatar sync |
| `src/app/login/page.tsx` | Rewrite — multi-tab |
| `src/app/register/page.tsx` | Rewrite — campos expandidos |

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Google OAuth não funciona em local dev sem credenciais | UI exibe erro amigável; fluxo de e-mail não é afetado |
| SMS OTP sem Twilio configurado | Botão "Enviar Código" exibe erro claro; outros métodos disponíveis |
| CNPJ API fora do ar | Erro exibido, campos preenchíveis manualmente |
| `pending_registrations.clinic_name NOT NULL` quebra upsert | Migration 0113 remove a constraint NOT NULL |
| Username duplicado | Constraint UNIQUE no banco; action valida antes do signUp |
