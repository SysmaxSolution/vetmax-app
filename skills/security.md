# Security — Autenticação, Autorização, Secrets, Audit Logging

**Data:** 2026-04-06  
**Criticidade:** 🔴 CRÍTICO — Bloqueador de Produção

---

## 🔐 Regra de Ouro

> **Nenhuma informação sensível é logada em plain text.**  
> **Todo acesso a dados é auditado.**  
> **Secrets NUNCA ficam no código.**

---

## 🔑 Autenticação (Supabase Auth)

**Fluxo:**
1. Usuário faz login com email + senha
2. Supabase retorna JWT token
3. Token armazenado em `httpOnly` cookie (seguro contra XSS)
4. TODA requisição inclui token no header `Authorization: Bearer <token>`

**Proibições:**
- ❌ Armazenar senha em plain text (hash com bcrypt, Supabase faz)
- ❌ Armazenar JWT em localStorage (vulnerável a XSS)
- ❌ Token com expiração > 1 hora (refresh token strategy)
- ❌ Session sem re-autenticação após 24h

---

## 👥 Autorização (RBAC)

**Roles Permitidos:**
- `admin` — Acesso total, gestão de usuários, faturamento
- `vet` — Consultas, prescrições, prontuários
- `assistant` — Triagem, exames (execução)
- `receptionist` — Agendamentos, check-in, pacientes
- `pharmacist` — Prescrições (dispensação), receituário

**Regra de Negócio:**
- Receptionist NÃO pode ver diagnósticos (CFMV sigilo)
- Pharmacist NÃO pode prescrever (só dispensar)
- Vet NÃO pode fazer check-in (receptionist faz)

**RLS Policy Pattern:**
```sql
CREATE POLICY "role_based_access"
  ON consultations FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'vet'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'assistant'
    )
  );
```

---

## 🔒 Secrets Management

**Arquivos sensíveis:**
```
.env.local (Git-ignored)
├─ NEXT_PUBLIC_SUPABASE_URL (público)
├─ NEXT_PUBLIC_SUPABASE_ANON_KEY (público, read-only)
├─ SUPABASE_SERVICE_ROLE_KEY (SECRETO — servidor apenas)
├─ OPENAI_API_KEY (SECRETO)
└─ JWT_SECRET (SECRETO)
```

**Regras:**
- ✅ .env.local em `.gitignore`
- ✅ Service role key NUNCA expostos no client
- ✅ Usar `process.env` (server-side) ou `process.env.NEXT_PUBLIC_*` (client)
- ✅ Secrets em Vercel/Supabase vault (não arquivo)

**Proibição:**
- ❌ Commitar `.env.local`
- ❌ Usar SUPABASE_SERVICE_ROLE_KEY no client
- ❌ Logar API keys em console.log()

---

## 📋 Audit Logging (OBRIGATÓRIO)

**Tabela: `audit_logs`**
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action VARCHAR(50), -- 'create', 'update', 'delete', 'prescribe', 'dispense'
  resource_type VARCHAR(50), -- 'consultation', 'prescription', 'patient'
  resource_id UUID,
  old_values JSONB, -- antes da alteração
  new_values JSONB, -- depois da alteração
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**O que logar:**
- ✅ Criaçãode consultas (quem, quando)
- ✅ Prescrições (quem prescreveu, dosagem, medicamento)
- ✅ Receituário azul gerado (quem, quando, número)
- ✅ Acesso a prontuários (quem viu, quando)
- ✅ Exclusão/arquivamento (quem, quando, por quê)

**O que NÃO logar:**
- ❌ Senhas
- ❌ Tokens JWT
- ❌ CPF em plain text (apenas últimos 4 dígitos)

---

## 🚨 Data Encryption

**Em repouso:**
- Supabase criptografa automaticamente (PostgreSQL encryption)
- Sensível: CPF, telefone, endereço do tutor

**Em trânsito:**
- SEMPRE HTTPS (não HTTP)
- TLS 1.3 mínimo
- HSTS header obrigatório

---

## 🛡️ OWASP Top 10 Prevention

| Risco | Mitigação |
|-------|-----------|
| SQL Injection | Supabase parameterized queries (não concatenar) |
| XSS | Sanitizar inputs, Content-Security-Policy header |
| CSRF | CSRF token em forms, SameSite cookie policy |
| Broken Auth | Supabase Auth (não custom), JWT expiration |
| XXE | Não fazer parsing de XML (usar JSON) |
| Sensitive Data | RLS policies, encryption, audit logs |
| Injection | Input validation, parameterized queries |
| DoS | Rate limiting, request size limits |
| Deserialization | JSON parsing (não pickle/serialize) |
| Outdated Libs | npm audit, dependabot, updates regulares |

---

**Última revisão:** 2026-04-06  
**Status:** ✅ Obrigatório antes de produção
