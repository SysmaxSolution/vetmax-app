# VetMax Skills Architecture

**Última atualização:** 2026-04-06  
**Status:** 🟢 Ativo e Vinculante

---

## O que é este diretório?

Este diretório contém os **Documentos de Verdade Arquitetural** do VetMax. Cada skill é um arquivo `.md` que encapsula regras não-negociáveis para uma dimensão específica do sistema.

**Analogia:** Se VetMax fosse uma clínica, estas skills seriam os *protocolos clínicos*, *manuais de administração*, *leis que regem o exercício*, e *processos de qualidade*.

---

## 🎯 Skills Críticas (Bloqueadores de Produção)

Estas 5 skills DEVEM ser implementadas **ANTES de qualquer deploy**:

| Skill | Criticidade | Propósito |
|-------|-------------|----------|
| **security.md** | 🔴 CRÍTICO | JWT, RBAC, secrets, audit logging |
| **testing.md** | 🔴 CRÍTICO | Unit/integration/E2E, coverage 80% |
| **monitoring.md** | 🔴 CRÍTICO | Logs JSON, Sentry, alertas, health checks |
| **error_handling.md** | 🟠 IMPORTANTE | Classificação de erros, retry, UX |
| **validation.md** | 🟠 IMPORTANTE | Validações clínicas, regras de negócio |

---

## 📚 Skills Complementares

| Skill | Propósito | Quando Ler |
|-------|----------|-----------|
| **product_manager.md** | Roadmap, riscos, priorização de sprint, métricas de saúde | Antes de iniciar sprint, ao avaliar features ou riscos |
| **clinical_flow.md** | Fluxo clínico veterinário, CFMV | Implementando módulos de consulta, triagem |
| **database.md** | Schema PostgreSQL, RLS, multi-tenancy | Adicionando tabelas, queries, migrations |
| **legal_compliance.md** | LGPD, CFMV, Anvisa, prescrições | Tocando dados do tutor, receituário |
| **development.md** | Next.js, Server Actions, Design System | Criando features, componentes |
| **infrastructure.md** | Docker, portas, Supabase CLI | Configuração de ambiente |
| **ai_and_rag.md** | Transcrição de voz, IA veterinária | Triagem por voz, sugestões |
| **self_evolution.md** | Auto-documentação, SPRINT_NOTES | Fim de cada sprint |

---

## 🔴 Regras de Ouro (aplica-se a TUDO)

### 1. **Tutor ≠ Pet**
- **Tutor** = Cliente financeiro, responsável legal, dados sensíveis (LGPD)
- **Pet** = Paciente clínico, histórico médico, sigilo profissional (CFMV)

### 2. **Multi-Tenancy é Lei**
- **TODA** query DEVE filtrar por `clinic_id`
- **TODA** nova tabela DEVE ter `clinic_id` como coluna obrigatória

### 3. **Prontuário é Documento Legal**
- Uma vez criado, um registro clínico **nunca é deletado**, apenas marcado como `is_archived`
- `is_reviewed_by_vet` é a trava para movimentação de status

### 4. **Design System é Piedra Angular**
- Todas as cores, spacing, tipografia seguem Tailwind slate palette
- Sem exceções, sem "ajustes rápidos"

### 5. **VetMax roda na Porta 4000**
- HealthMax: 3000
- VetMax: 4000
- Nunca alterar sem comunicação com todo o time

---

## 📝 Nota de Sincronização

**HealthMax e VetMax compartilham as skills universais:**
- ✅ `security.md` — sincronizada
- ✅ `testing.md` — sincronizada
- ✅ `monitoring.md` — sincronizada
- ✅ `error_handling.md` — sincronizada

**Cada projeto mantém suas próprias skills de domínio:**
- VetMax: `clinical_flow.md`, `validation.md` (veterinária), `ai_and_rag.md` (veterinária)
- HealthMax: `clinical_flow.md`, `validation.md` (médica), `ai_and_rag.md` (médica)

---

**Última review:** 2026-04-06
