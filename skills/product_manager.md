# Product Manager — Evolução, Melhoria Progressiva e Riscos do VetMax

**Data:** 2026-04-18
**Criticidade:** 🟠 IMPORTANTE — Leitura obrigatória antes de qualquer decisão de roadmap ou priorização de sprint.

---

## 🎯 Missão desta Skill

> Atuar como Gerente de Produto sênior do VetMax: analisar o estado real do produto, identificar o próximo passo de maior impacto, mapear riscos ativos e garantir que o desenvolvimento avance com visão de produto — não apenas com visão técnica.

**Quando usar:** Antes de iniciar uma nova sprint, ao avaliar uma nova feature request, ao fazer health check do produto, ou sempre que o usuário pedir análise de evolução, priorização ou riscos.

---

## 📊 Framework de Análise de Produto (executar sempre que invocada)

### PASSO 1 — Leia o estado atual
Antes de qualquer análise, leia obrigatoriamente:
1. `STATUS.md` — módulos completos, em andamento, pendentes
2. `BlueSprint.txt` — visão original do produto (premissas inalteráveis)
3. `SPRINT_NOTES.md` — histórico de decisões e o que foi entregue
4. `skills/security.md` — riscos de segurança e compliance ativos
5. `skills/legal_compliance.md` — obrigações CFMV e LGPD pendentes

### PASSO 2 — Mapa de Valor vs. Esforço
Para cada item em análise, classifique em duas dimensões:

```
ALTO VALOR │ Quick Win ★★★  │ Projeto Estratégico ★★
           │ (fazer agora)  │ (planejar com cuidado)
           ├────────────────┼──────────────────────
BAIXO VALOR│ Tarefa de Manutenção │ Evitar / Deferir
           │ (fazer se sobrar)   │ (não fazer)
           └────────────────┴──────────────────────
             BAIXO ESFORÇO    ALTO ESFORÇO
```

### PASSO 3 — Checklist de Risco por Categoria

#### 🔴 Riscos de Compliance (bloqueadores de produção)
- [ ] Receituário Azul implementado? (CFMV — obrigatório para controlados)
- [ ] Audit Trail ativo em todas as server actions críticas? (LGPD)
- [ ] `is_reviewed_by_vet` protegendo status `completed`? (prontuário legal)
- [ ] CPF de tutor não está sendo logado em plain text?
- [ ] Todas as rotas de API validam sessão Supabase antes de operar?

#### 🟠 Riscos de Segurança (validar a cada sprint)
- [ ] Novas tabelas adicionadas têm RLS + `clinic_id`?
- [ ] Novas rotas de API têm `getUser()` guard?
- [ ] Server actions com admin client têm `.eq('clinic_id', ...)` em UPDATE/DELETE?
- [ ] Dependências com `npm audit` — vulnerabilidades críticas?
- [ ] Chaves de API novas adicionadas ao `.env.local` (nunca hardcoded)?

#### 🟡 Riscos de Performance (avaliar a cada 3 sprints)
- [ ] Novas FKs criadas têm índice correspondente?
- [ ] Queries em tabelas grandes usam `.select()` com colunas explícitas (não `*`)?
- [ ] Paginação implementada em listagens com potencial de crescimento (>100 rows)?
- [ ] Índices compostos criados para queries com múltiplos filtros frequentes?

#### 🔵 Riscos de UX / Produto (avaliar a cada sprint)
- [ ] Fluxo crítico testado manualmente após mudança? (check-in → triagem → consulta → alta)
- [ ] Estados de loading/erro adequados em ações clínicas?
- [ ] Terminologia CFMV mantida? (Pet, Tutor, MV — nunca Paciente/Dono/Médico)
- [ ] Multi-tenancy validado visualmente? (dados de outra clínica nunca aparecem)

---

## 🗺️ Roadmap Vivo do VetMax

### ✅ Módulos Completos (não regredir)
| Módulo | Cobertura BlueSprint | Débito Técnico Ativo |
|--------|---------------------|----------------------|
| Recepção | ~90% | Tags comportamentais ricas pendentes |
| Triagem | 100% | — |
| Consultório (MV) | 100% | — |
| Exames | 100% | — |
| Internação | 100% | — |
| WhatsApp | 100% | — |
| Gestão (RBAC, Templates, Kanban) | 100% | — |
| Pet CRM | 100% | — |

### 🔴 Backlog de Alta Prioridade (ordenado por impacto)
1. **Receituário Azul** — Requisito CFMV. Campo `is_controlled` existe. ~2-3h.
2. **Audit Trail completo** — Requisito LGPD. Tabela existe (migration 0020). ~4-6h para instrumentar ~15 server actions.
3. ~~**Migration de Índices FK**~~ — ✅ Concluído em 2026-04-18 (migration 0030, 16 índices).

### 🟡 Backlog de Média Prioridade
4. **Calculadora de Prescrição** — Peso + medicamento → dose mg/kg via IA. ~2h.
5. **Tags comportamentais ricas** — "Agressivo", "Cardiopata" no Pet CRM. ~2-3h.
6. **Rate limiting nas rotas de IA** — Proteção contra abuso de tokens. ~1h.

### 🔵 Backlog de Baixa Prioridade (dívida técnica)
7. ~~Eliminar `any` implícitos em `voice-map-fields.ts`, `consultations.ts`, `appointments.ts`~~ ✅ 2026-04-18
8. ~~Remover dependências órfãs: `pdfjs-dist`, `pg-connection-string`~~ ✅ 2026-04-18
9. ~~Escopar `localStorage` por `userId` em `HospitalizationDetailModal`~~ ✅ 2026-04-18
10. ~~Adicionar auth em `onboarding/page.tsx` antes de buscar `clinic_id`~~ ✅ 2026-04-18

---

## 📈 Métricas de Saúde do Produto

### Segurança (atualizado 2026-04-18)
| Indicador | Status |
|-----------|--------|
| Cobertura RLS | ✅ 100% (22/22 tabelas) |
| Rotas de API autenticadas | ✅ 100% após Fix Fase 1 |
| Multi-tenancy nas actions | ✅ 100% após Fix Fase 1 |
| Rotas admin com SQL direto | ✅ Eliminadas (2026-04-18) |
| FKs com índice | ✅ 100% (47/47 FKs) — migration 0030 aplicada em 2026-04-18 |

### Compliance
| Requisito | Status |
|-----------|--------|
| CFMV — Prontuário legal (`is_reviewed_by_vet`) | ✅ |
| CFMV — Receituário Azul | ❌ Pendente |
| LGPD — Audit Trail | ⚠️ Tabela existe, instrumentação incompleta |
| LGPD — CPF não logado | ✅ |
| LGPD — Dados escopados por clínica | ✅ |

---

## 🧠 Regras de Priorização (não negociáveis)

### Regra 1 — Compliance Antes de Feature
> Nenhuma nova feature entra enquanto houver bloqueador de compliance CFMV ou LGPD aberto.
> Receituário Azul e Audit Trail completo devem preceder qualquer expansão de módulo.

### Regra 2 — Segurança como Pré-condição
> Toda nova rota de API ou server action deve passar pelo checklist de segurança desta skill antes de ser merged.
> Se a feature abre buraco de segurança, ela não está pronta.

### Regra 3 — Não Crescer em Largura Antes de Consolidar em Profundidade
> VetMax tem 8 módulos completos. Antes de criar um 9º módulo, garantir que os 8 existentes têm:
> - Testes mínimos (skill `testing.md`)
> - Audit Trail (LGPD)
> - Rate limiting em rotas de IA

### Regra 4 — Uma Migration por Sprint de Débito
> A cada sprint, incluir pelo menos 1 migration de manutenção (índices, constraints, cleanup).
> Débito de banco de dados acumula silenciosamente e explode em produção.

### Regra 5 — BlueSprint é Norte, não Teto
> O `BlueSprint.txt` define as premissas universais. Features além do BlueSprint são bem-vindas
> **se** não violam as premissas e **se** passam no checklist Valor × Esforço acima.

---

## 📋 Template de Análise de Sprint (usar ao iniciar cada sprint)

```markdown
## Análise de Sprint — YYYY-MM-DD

### Estado do Produto
- Módulos ativos: X/8
- Cobertura RLS: XX%
- Itens de compliance pendentes: X

### Proposta de Sprint
- Item 1: [feature] — Valor: ALTO/MÉDIO/BAIXO — Esforço: ~Xh
- Item 2: [feature] — Valor: ALTO/MÉDIO/BAIXO — Esforço: ~Xh
- Item de débito: [manutenção] — Obrigatório por Regra 4

### Riscos Identificados
- [risco 1]: [mitigação]

### Definição de Pronto (DoD)
- [ ] Checklist de segurança desta skill passado
- [ ] Migration de banco aditiva (sem DROP)
- [ ] STATUS.md atualizado
- [ ] SPRINT_NOTES.md atualizado
```

---

**Última revisão:** 2026-04-18 — Health Check 100% zerado
**Próxima revisão obrigatória:** Início da sprint de Receituário Azul
