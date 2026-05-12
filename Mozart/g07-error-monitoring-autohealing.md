# G-07 — Sistema de Monitoramento Autônomo de Erros e Auto-Healing

**Data:** 2026-05-12  
**Autor:** Mozart / Claude Code  
**Status:** Planejamento — Aguardando Aprovação  
**Prioridade:** P0 — Infraestrutura de Qualidade Contínua  
**Dependências:** Supabase (migration 0078 já aplicada), Vercel (projeto em produção), Anthropic API (Claude), Mozart Routines  

---

## Resumo Executivo

| Aspecto | Estado Atual | Meta com G-07 |
|---------|-------------|--------------|
| Captura de erros | Parcial — só frontend autenticado | 100% — frontend, server, Vercel runtime |
| Classificação | Manual (campo `severity`) | Automática P0/P1/P2 por IA |
| Plano de correção | Inexistente | Gerado automaticamente pelo Claude |
| Correção | Manual pelo dev | Autônoma via Routine aprovada |
| Validação | Manual | E2E Playwright automático pós-fix |
| Dashboard | Inexistente | `/dashboard/management/error-monitoring` |

**Problema central:** A tabela `error_logs` existe mas é passiva — os erros entram, ninguém os lê sistematicamente, ninguém os corrige de forma rastreável. O G-07 transforma esse sistema em um ciclo ativo: **Captura → Classifica → Planeja → Aprova → Corrige → Valida → Fecha.**

---

## Resumo Didático — Como Explicar Para Uma Criança

> Imagina que o sistema é uma escola. Toda vez que um aluno (usuário) tropeça e cai (erro), a escola escreve num caderninho o que aconteceu. Até aqui tudo bem — já temos esse caderninho.
>
> O problema é que ninguém lê o caderninho. Os tombos continuam acontecendo no mesmo lugar.
>
> O G-07 é como contratar um detetive inteligente (o Mozart/Claude) que:
> 1. **Lê todos os tombos** — inclusive os que acontecem na rua (Vercel) e não só dentro da escola
> 2. **Diz qual tombo é mais grave** — "esse dói muito" (P0), "esse dói um pouco" (P1), "esse mal arranhei" (P2)
> 3. **Escreve um plano de como consertar** cada lugar perigoso
> 4. **O diretor aprova** os planos mais importantes
> 5. **O detetive conserta sozinho** os lugares aprovados, sem precisar que o professor faça manualmente
> 6. **Confere se o conserto funcionou** — testa para garantir que ninguém vai tropeçar de novo
>
> Resultado: a escola fica mais segura automaticamente, dia após dia, sem o professor ter que fazer tudo à mão.

---

## 1. Diagnóstico — O Que Já Existe

### 1.1 Tabela `error_logs` (migration 0078) ✅
```sql
-- Campos existentes:
id, clinic_id, user_id, path, error_message, stack_trace,
user_journey (jsonb), severity ('error'|'warning'|'critical'), resolved, created_at
```
**Lacunas identificadas:**
- Sem campo `priority` (P0/P1/P2) estruturado para triagem
- Sem `module` (qual módulo da clínica gerou o erro)
- Sem `fingerprint` para deduplicação (mesmo erro ocorrendo 100x vira 100 registros)
- Sem `occurrence_count` para medir frequência
- Sem `fix_plan_id` (FK para o plano de correção)
- Sem `source` (client / server / vercel / edge)

### 1.2 Server Action `logClientError()` ✅
- Captura erros de componentes React autenticados
- **Lacuna:** Só funciona para usuário logado. Erros em páginas públicas, middleware, edge functions, e erros do servidor Next.js não são capturados.

### 1.3 O Que Não Existe ❌
- Captura de erros server-side (API routes, Server Actions com throw)
- Integração com Vercel Log Drains (erros de runtime, build, edge)
- Classificação automática P0/P1/P2
- Tabela de planos de correção (`fix_plans`)
- Dashboard de monitoramento na UI
- Rotina autônoma de correção (Mozart Routine)
- Notificação proativa (WhatsApp/email quando P0 ocorre)

---

## 2. Arquitetura do Sistema G-07

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAMADA DE CAPTURA                           │
│                                                                 │
│  [React ErrorBoundary] → logClientError()  (já existe)         │
│  [Next.js API Routes]  → logServerError()  (novo)              │
│  [Vercel Log Drains]   → /api/webhooks/vercel-logs  (novo)     │
│  [Edge Middleware]     → logEdgeError()    (novo)              │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌──────────────────────────▼──────────────────────────────────────┐
│                   TABELA error_logs (estendida)                 │
│  + priority, module, fingerprint, occurrence_count,             │
│    fix_plan_id, source                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌──────────────────────────▼──────────────────────────────────────┐
│              MOTOR DE CLASSIFICAÇÃO (Claude API)                │
│  POST /api/admin/classify-errors                                │
│  → Lê erros sem priority → Claude analisa → atribui P0/P1/P2  │
│  → Agrupa por fingerprint → atualiza occurrence_count          │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌──────────────────────────▼──────────────────────────────────────┐
│                   TABELA fix_plans (nova)                       │
│  id, title, priority, status, description_md, claude_analysis, │
│  affected_fingerprints[], branch_name, pr_url, test_results,   │
│  created_at, approved_at, approved_by                          │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌──────────────────────────▼──────────────────────────────────────┐
│           MOTOR DE PLANEJAMENTO (Claude API via Mozart)         │
│  POST /api/admin/generate-fix-plan                              │
│  → Claude lê error_logs agrupados → gera plano técnico         │
│  → Salva em fix_plans com status = 'pending_approval'          │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌──────────────────────────▼──────────────────────────────────────┐
│                   APROVAÇÃO HUMANA (Dashboard)                  │
│  /dashboard/management/error-monitoring                         │
│  → Gestor aprova/rejeita planos                                │
│  → status = 'approved'                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌──────────────────────────▼──────────────────────────────────────┐
│            ROTINA DE CORREÇÃO AUTÔNOMA (Mozart Routine)         │
│  Cron: /api/cron/auto-fix (a cada 6h)                          │
│  → Busca fix_plans WHERE status = 'approved'                   │
│  → Claude Code: cria branch fix/plan-{id}                      │
│  → Aplica correções nos arquivos indicados                     │
│  → Roda: npm run test:e2e --spec=<módulo>                      │
│  → Se testes OK: abre PR + status = 'pr_opened'               │
│  → Se testes FAIL: status = 'fix_failed' + notifica           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Schema de Banco de Dados

### 3.1 Extensão da tabela `error_logs` (migration 0108)
```sql
-- Migration 0108: Estender error_logs para G-07
ALTER TABLE error_logs
  ADD COLUMN IF NOT EXISTS priority       text CHECK (priority IN ('P0','P1','P2')) DEFAULT 'P1',
  ADD COLUMN IF NOT EXISTS module         text,        -- 'reception','triage','vet','cashier',...
  ADD COLUMN IF NOT EXISTS fingerprint    text,        -- hash(path + error_message) para dedup
  ADD COLUMN IF NOT EXISTS occurrence_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source         text NOT NULL DEFAULT 'client', -- 'client'|'server'|'vercel'|'edge'
  ADD COLUMN IF NOT EXISTS fix_plan_id    uuid REFERENCES fix_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint, clinic_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_priority ON error_logs(priority, resolved, created_at DESC);
```

### 3.2 Nova tabela `fix_plans` (migration 0108)
```sql
CREATE TABLE IF NOT EXISTS fix_plans (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text        NOT NULL,
  priority             text        NOT NULL CHECK (priority IN ('P0','P1','P2')),
  status               text        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN (
                                     'draft','pending_approval','approved',
                                     'in_progress','pr_opened','completed',
                                     'fix_failed','rejected'
                                   )),
  affected_modules     text[]      NOT NULL DEFAULT '{}',
  affected_fingerprints text[]     NOT NULL DEFAULT '{}',
  error_summary        text,       -- resumo humano do problema
  description_md       text,       -- plano técnico gerado pelo Claude (Markdown)
  claude_analysis      jsonb,      -- JSON com análise estruturada do Claude
  branch_name          text,       -- ex: 'fix/plan-abc123'
  pr_url               text,       -- URL do PR no GitHub após correção
  test_results         jsonb,      -- resultado do Playwright pós-fix
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  approved_at          timestamptz,
  approved_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fix_plans_status ON fix_plans(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fix_plans_approved ON fix_plans(status) WHERE status = 'approved';

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_fix_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fix_plans_updated_at
  BEFORE UPDATE ON fix_plans
  FOR EACH ROW EXECUTE FUNCTION update_fix_plans_updated_at();

-- RLS: apenas admin/manager da plataforma lê fix_plans
-- (acesso via service_role no cron e via perfil role='admin' no dashboard)
ALTER TABLE fix_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only_fix_plans"
  ON fix_plans FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')
  ));

COMMENT ON TABLE fix_plans IS 'Planos de correção autônoma de bugs. Gerados por IA, aprovados por humanos, executados por Mozart Routine.';
```

---

## 4. Novos Endpoints API

### 4.1 Captura Server-Side
**Arquivo:** `src/lib/error-logger.ts` (utilitário global)
```typescript
// Função universal chamada em qualquer catch no servidor
export async function logServerError(opts: {
  path: string
  error: Error
  source: 'server' | 'api' | 'edge'
  module?: string
  userId?: string
  clinicId?: string
}) { /* insere em error_logs via service_role */ }
```

### 4.2 Vercel Log Drain
**Arquivo:** `src/app/api/webhooks/vercel-logs/route.ts`
```typescript
// Recebe webhook do Vercel com logs de runtime
// Headers: x-vercel-signature para validar autenticidade
// Filtra: level === 'error' | 'fatal'
// Mapeia: deploymentId → path, message → error_message
// Chama: logServerError({ source: 'vercel', ... })
```

### 4.3 Classificação por IA
**Arquivo:** `src/app/api/admin/classify-errors/route.ts`
```typescript
// Cron: executa a cada 1h via /api/cron/classify-errors
// 1. Busca error_logs WHERE priority IS NULL (ou DEFAULT) LIMIT 100
// 2. Agrupa por fingerprint (hash do path+message)
// 3. Manda para Claude API com system prompt de classificação
// 4. Claude retorna: priority (P0/P1/P2), module, severity_reason
// 5. Atualiza error_logs com os campos classificados
// 6. Se P0: dispara notificação WhatsApp para admin
```

### 4.4 Geração de Plano de Correção
**Arquivo:** `src/app/api/admin/generate-fix-plan/route.ts`
```typescript
// Chamado manualmente ou após threshold (ex: mesmo erro >10x em 24h)
// 1. Busca cluster de erros por fingerprint
// 2. Recupera stack_trace e user_journey de todos
// 3. Lê os arquivos de código fonte relevantes
// 4. Chama Claude API com contexto completo
// 5. Claude retorna: description_md, affected_files[], fix_steps[], test_commands[]
// 6. Insere em fix_plans com status = 'pending_approval'
```

### 4.5 Rotina de Correção Autônoma
**Arquivo:** `src/app/api/cron/auto-fix/route.ts`
```typescript
// Executa a cada 6h via Vercel Cron Jobs
// 1. SELECT * FROM fix_plans WHERE status = 'approved' ORDER BY priority
// 2. Para cada plano:
//    a. Cria branch: git checkout -b fix/plan-{id}
//    b. Aplica mudanças nos arquivos indicados em claude_analysis
//    c. Roda: npx playwright test --grep <módulo> --reporter=json
//    d. Se PASS: git push + gh pr create + UPDATE fix_plans SET status='pr_opened'
//    e. Se FAIL: UPDATE fix_plans SET status='fix_failed', test_results={...}
//    f. NUNCA commita direto na main (regra CLAUDE.md)
```

---

## 5. Dashboard UI — `/dashboard/management/error-monitoring`

### 5.1 Estrutura de Abas
```
┌──────────────────────────────────────────────────────────┐
│  🔴 Erros Ativos (42)  │  📋 Planos (8)  │  ✅ Resolvidos │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Aba "Erros Ativos"
- Tabela com colunas: `Módulo | Prioridade | Mensagem | Ocorrências | Última vez | Ação`
- Badge colorido: P0=vermelho pulsante, P1=laranja, P2=amarelo
- Botão "Gerar Plano" por linha (chama `/api/admin/generate-fix-plan`)
- Filtros: por módulo, prioridade, período

### 5.3 Aba "Planos de Correção"
- Card por plano com: título, prioridade, módulos afetados, status, preview do `description_md`
- Status flow visual: `Draft → Pendente Aprovação → Aprovado → Em Progresso → PR Aberto → Concluído`
- Botões: "Aprovar", "Rejeitar", "Ver Detalhes"
- Seção expandível com o plano técnico completo em Markdown

### 5.4 Arquivos a Criar
```
src/app/dashboard/management/error-monitoring/
  └── page.tsx                 ← página principal SSR
src/components/management/
  ├── ErrorMonitoringDashboard.tsx  ← componente principal com abas
  ├── ErrorLogTable.tsx             ← tabela de erros com filtros
  └── FixPlanCard.tsx               ← card de plano com aprovação
src/lib/actions/
  └── fix-plans.ts                  ← getFixPlans, approveFixPlan, rejectFixPlan
```

---

## 6. Integração Vercel Log Drains

### 6.1 Configuração no Painel Vercel
1. `Settings → Log Drains → Add Drain`
2. Endpoint: `https://<dominio>/api/webhooks/vercel-logs`
3. Secret: variável `VERCEL_LOG_DRAIN_SECRET` (adicionar ao `.env.local` e Vercel Env)
4. Eventos: `error`, `fatal`, `lambda-error`

### 6.2 Validação de Autenticidade
```typescript
import { createHmac } from 'crypto'

function verifyVercelSignature(payload: string, signature: string): boolean {
  const expected = createHmac('sha1', process.env.VERCEL_LOG_DRAIN_SECRET!)
    .update(payload).digest('hex')
  return `sha1=${expected}` === signature
}
```

---

## 7. Protocolo de Notificação P0

Quando um erro P0 é classificado:
1. Imediatamente: notificação WhatsApp via Evolution API para admin da clínica
2. Se mesmo P0 ocorrer >5x em 1h: escala para número do suporte SysMax
3. Mensagem template:
```
🚨 *ERRO CRÍTICO (P0) — VetMax*
Módulo: {{module}}
Erro: {{error_message}}
Ocorrências: {{count}} nos últimos 60min
Caminho: {{path}}
Plano de correção em geração...
```

---

## 8. Plano de Sprints

### Sprint G-07-A — Fundação do Banco (Estimativa: 3h)
- [ ] Migration 0108: estender `error_logs` + criar `fix_plans`
- [ ] Aplicar migration no Supabase remoto
- [ ] Atualizar `logClientError()` para incluir `fingerprint`, `module`, `source`
- [ ] Criar `logServerError()` utilitário global em `src/lib/error-logger.ts`
- [ ] Adicionar `try/catch` + `logServerError()` nas principais API routes
- [ ] Testes unitários: `logServerError()` e deduplicação por fingerprint

### Sprint G-07-B — Captura Vercel + Classificação IA (Estimativa: 4h)
- [ ] Endpoint `POST /api/webhooks/vercel-logs` com validação HMAC
- [ ] Configurar Log Drain no painel Vercel
- [ ] Adicionar `VERCEL_LOG_DRAIN_SECRET` ao `.env.local` e Vercel Env
- [ ] Endpoint `GET /api/cron/classify-errors` com Claude API
- [ ] System prompt de classificação (P0/P1/P2 com critérios claros)
- [ ] Cron Job no `vercel.json` para classificação a cada 1h
- [ ] Notificação WhatsApp para P0 (integração Evolution API existente)
- [ ] Testes: mock do webhook Vercel, mock da resposta Claude

### Sprint G-07-C — Motor de Planejamento IA (Estimativa: 4h)
- [ ] Endpoint `POST /api/admin/generate-fix-plan`
- [ ] Server Actions: `getFixPlans()`, `approveFixPlan()`, `rejectFixPlan()`, `getErrorClusters()`
- [ ] Prompt engineering para geração de planos técnicos (com contexto do código)
- [ ] Leitura do código fonte relevante no prompt (arquivos indicados no stack_trace)
- [ ] Salvar plano em `fix_plans` com `description_md` e `claude_analysis` estruturado
- [ ] Auto-trigger: se mesmo fingerprint >10x em 24h → gera plano automaticamente

### Sprint G-07-D — Dashboard UI (Estimativa: 5h)
- [ ] Página `/dashboard/management/error-monitoring/page.tsx`
- [ ] Componente `ErrorMonitoringDashboard.tsx` com abas (Erros / Planos / Resolvidos)
- [ ] Componente `ErrorLogTable.tsx` com filtros, badges P0/P1/P2, paginação
- [ ] Componente `FixPlanCard.tsx` com preview Markdown e botões Aprovar/Rejeitar
- [ ] Realtime: supabase channel para novo P0 → toast de alerta imediato
- [ ] Adicionar link ao menu de Gestão (`ManagementWorkspace.tsx`)
- [ ] Testes E2E: fluxo completo de visualizar erro → gerar plano → aprovar

### Sprint G-07-E — Rotina de Correção Autônoma (Estimativa: 6h)
- [ ] Endpoint `GET /api/cron/auto-fix` (protegido por `CRON_SECRET`)
- [ ] Lógica de leitura dos planos aprovados (status = 'approved')
- [ ] Integração com Claude Code SDK para aplicar alterações em arquivos
- [ ] Git: criar branch `fix/plan-{id}`, commit, push
- [ ] GitHub: abrir PR via `gh pr create` com body do `description_md`
- [ ] Playwright: executar testes do módulo afetado, capturar resultado
- [ ] Atualizar `fix_plans` com status final e `test_results`
- [ ] Cron Job no `vercel.json` para auto-fix a cada 6h
- [ ] Adicionar ao Mozart MEMORY.md: lista de planos aprovados

---

## 9. Critérios de Classificação P0/P1/P2

| Prioridade | Critério | Exemplos | SLA Correção |
|-----------|---------|---------|-------------|
| **P0** — Crítico | Bloqueia fluxo principal OU dado perdido | Login quebrado, consulta não salva, caixa não fecha | < 4h |
| **P1** — Alto | Funcionalidade importante degradada | Exame não carrega, PDF não gera, triagem com erro | < 24h |
| **P2** — Médio | UI quebrada ou fluxo alternativo com falha | Tooltip errado, filtro não funciona, loading preso | < 72h |

---

## 10. Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Rotina autônoma commita código com bug | Média | NUNCA commita em main; só PR para aprovação humana |
| Vercel Log Drain sobrecarrega DB | Baixa | Rate limit: max 100 logs/min; debounce por fingerprint |
| Claude gera plano incorreto | Média | Plano sempre passa por aprovação humana antes de executar |
| Custo API Claude explode | Baixa | Cache de análises por fingerprint; limite 50 classificações/hora |
| Dados pessoais em logs | Baixa | `user_journey` armazena apenas IDs/paths (LGPD em vigor desde 0078) |

---

## 11. KPIs de Aceite

- [ ] 100% dos erros de runtime Vercel chegam ao banco em < 2 min
- [ ] Classificação P0/P1/P2 automática em < 5 min após captura
- [ ] P0 dispara notificação WhatsApp em < 1 min
- [ ] Dashboard carrega lista de erros em < 1s (SSR + índices)
- [ ] Rotina autônoma executa plano aprovado e abre PR em < 15 min
- [ ] Taxa de correção bem-sucedida (testes passando após auto-fix) > 70%

---

## Próximos Passos — Action Items

| # | Ação | Prioridade | Quem |
|---|------|-----------|------|
| 1 | Aprovar este plano para iniciar Sprint G-07-A | P0 | Diretor |
| 2 | Adicionar `VERCEL_LOG_DRAIN_SECRET` ao `.env.local` e Vercel Env | P0 | Dev/Diretor |
| 3 | Iniciar Sprint G-07-A (banco + captura) | P0 | Mozart/Claude Code |
| 4 | Configurar Log Drain no painel Vercel após Sprint B | P1 | Diretor (acesso ao painel) |
| 5 | Definir número WhatsApp para alertas P0 | P1 | Diretor |
