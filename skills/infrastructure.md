# Infrastructure — Docker, Portas, Supabase CLI

**Data:** 2026-04-06  
**Platform:** Windows 11 / WSL2

---

## 🚀 Portas (NUNCA Alterar Sem Comunicação)

| Serviço | Porta | Obs |
|---------|-------|-----|
| HealthMax | 3000 | Humana (médica) |
| VetMax | 4000 | Veterinária |
| Supabase | 5432 | PostgreSQL |

---

## 🐳 Docker Local

**Iniciar ambiente:**
```bash
docker-compose up -d
```

**Supabase CLI:**
```bash
supabase start
supabase stop
supabase db push
```

---

## 📝 Variáveis de Ambiente

**`.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

---

## 🚢 Deploy

**Supabase:** Auto-deploys via GitHub  
**Vercel:** Staging (preview) + Production

---

**Última revisão:** 2026-04-06
