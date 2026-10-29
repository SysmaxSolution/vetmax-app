# Relatório de Testes Pré-Produção — SYSVETMAX

**Worktree:** `C:\sysvetmax-dev` · **Branch:** `feature/treinamento` · **HEAD:** `ea8a8662`
**Deploy testado:** https://sysvetmax-dev.vercel.app (deployment `dpl_5RvZix8NE2zDrE1Zse7Vfbze8Dwy`, criado 24/09 12:08, aliasado)
**Banco:** Supabase dev `claqxwckiihknclhmzvf` · **Data:** 2026-09-24
**Natureza:** execução real (build, testes, HTTP contra o deploy, escrita/limpeza no banco dev).
A clínica de demonstração **Sys Demo (`ad1c3fca`) não foi alterada** — todos os testes de flag rodaram
numa clínica `[QA]` criada e destruída pelo próprio script.

---

## 1. Veredito

**NÃO está pronto para produção — falta 1 item de dados e 2 itens de configuração, todos de baixo custo.**
O código em si passou em tudo que foi possível medir: type check limpo em `src/`, 1.622 testes verdes,
isolamento por flag provado rotina a rotina no deploy real, caminho do dinheiro do exame intacto com a
flag desligada, endpoints sensíveis fechados. O que impede a virada **não é o código, é a preparação do
ambiente de produção** (ver §9).

---

## 2. Saúde do build

| Item | Resultado |
|---|---|
| `rm -f ./.next/cache/.tsbuildinfo ./tsconfig.tsbuildinfo && NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` | **21 erros — 0 deles em `src/`** |
| Erros em `src/` | **0** |
| Erros em `tests/` | 21 (8 arquivos) |
| Type check do build da Vercel | **passou** (`Finished TypeScript in 84s` no log do deployment) |

Os 21 erros estão todos em arquivos de teste que **este lote não tocou** (`git diff main...HEAD -- tests/`
não lista nenhum deles): `tests/unit/subscription-pricing.test.ts` (10× `starterBase` faltando em
`PlanPricingInput`), `patients.test.ts`, `cashier-math.test.ts`, `billing-helpers.test.ts`,
`age-calculator.test.ts`, `evolution-format-phone.test.ts`, `microchip-iso11784.test.ts`
(`TS2393 Duplicate function implementation`) e `tests/e2e/sprint-master-i20-fuso-horario.spec.ts`.
**Classificação: pré-existentes.** Não quebram o deploy (o type check da Vercel passa), mas mantêm o
`tsc --noEmit` vermelho, o que anula o valor do comando como sinal de saúde.

⚠️ **Armadilha confirmada em campo:** a primeira execução do `tsc` (em background, com os caches
apagados) terminou com **saída vazia e exit code 0** — falso positivo. A mesma execução em primeiro
plano reportou os 21 erros. **Não confie em execução de `tsc` cuja saída venha vazia.**

**`next build` local não foi executado** (instrução explícita — memória limitada). A prova final continua
sendo o build da Vercel.

---

## 3. Suíte de testes

| Suíte | Comando | Suites | Testes | Falhas | Pulados |
|---|---|---|---|---|---|
| Unitária | `npx jest --testPathPattern=tests/unit --maxWorkers=2 --ci` | 94 | **1.552** | **0** | 0 |
| Integração | `npx jest --testPathPattern=tests/integration --maxWorkers=1 --ci` | 6 | **70** | **0** | 0 |

**Total: 1.622 testes, 0 falhas, 0 skips.** Não estourou memória; não foi preciso lotear.
A suíte de integração inclui `cross-tenant-isolation`, `rls-roles`, `lgpd` e `concurrency-race-condition`.

**E2E Playwright não foi executado** (exige servidor e sessões autenticadas — ver §8).

---

## 4. Scripts de verificação em `scripts/`

| Script | Resultado |
|---|---|
| `verify-exam-rejection.mjs` | ✅ **16 verificações OK · 0 falhas** |
| `verify-portal.mjs` | ✅ isolamento OK (pet próprio visível, pet alheio HTTP 404, sem cookie = tela de login) |
| `verify-imaging.mjs` | ✅ E2E OK — estudo criado, imagem no storage, página pública do vet solicitante renderizou |
| `verify-booking.mjs` | ✅ CONFIG→UI OK (portal OFF = indisponível · RECEPTION = form de solicitação · DIRECT = horários livres) |
| `verify-flag-isolation.mjs` *(criado nesta bateria)* | ✅ **26 verificações OK · 0 falhas** |
| `test-cashier-closing-regression.mjs` | ✅ regressão −113 OK (trigger atribuiu `session_id`, fechamento estável) |
| `verify-saas-phase1.mjs` | ⚠️ roda, mas é **dump de inspeção**, não tem asserção — não produz pass/fail |
| `verify-saas-phase15.mjs` | ⚠️ idem |
| `verify-almavet-fechamento.mjs` | ❌ **quebra no dev** — `TypeError: Cannot read properties of undefined (reading 'id')`: o script assume a clínica **Almavet**, que não existe no banco dev. É script de inspeção de produção. **Pré-existente, não relacionado a este lote.** |

Os quatro últimos leem `process.env.DATABASE_URL`, que não está no `.env.local`; foram executados
apontando a variável para o pooler do dev.

---

## 5. Isolamento por flag (bloco mais importante)

Script novo: **`scripts/verify-flag-isolation.mjs`** (credenciais lidas do `.env.local`, nada hardcoded).
Cria uma clínica `[QA] Isolamento de Rotinas` com **todos os módulos ativos e contratados** e assinatura
enterprise (para o paywall de plano nunca mascarar o resultado), um usuário admin descartável com senha
aleatória, e um atendimento em fila de exame. Faz **login real** via `@supabase/ssr` — que gera os cookies
exatamente como o app espera — navega por HTTP e destrói tudo no fim.

**Resultado: 26 verificações OK · 0 falhas.**

| Flag | Menu OFF/ON | Rota OFF/ON | Superfície OFF/ON |
|---|---|---|---|
| `portal_enabled` | ✅ / ✅ | ✅ / ✅ `/dashboard/portal-mensagens` | — |
| `usa_imagem` | ✅ / ✅ | ✅ / ✅ `/dashboard/imaging` | — |
| `usa_treinamento` | ✅ / ✅ | ✅ / ✅ `/dashboard/treinamento` | — |
| `usa_convenios` | — | ✅ / ✅ `/dashboard/financial/insurance-reconciliation` | ✅ / ✅ link em `/dashboard/financial` |
| `usa_boleto` | — | — | ✅ / ✅ aba **Boletos** em `/dashboard/financial` |
| `usa_laboratorio` | — | — | ✅ / ✅ painel de resultados em `/dashboard/exams/<id>` |
| `usa_fluxo_rejeicao_exame` | — | — | ✅ / ✅ painel de realização em `/dashboard/exams/<id>` |
| `vaccine_recall_enabled` | — | — | ✅ / ✅ seleção do cron (`flow_config @> {"vaccine_recall_enabled":true}`) |
| `cancela_custo_lab_na_recusa` | — | — | ✅ leitura estrita (`ausente ≠ ligada`) |
| `estorna_exame_faturado_na_recusa` | — | — | ✅ leitura estrita (`ausente ≠ ligada`) |

**Camada de action.** Além do menu e da rota, as server actions recusam com a flag desligada —
`clinicFlowFlag(...) + routineOffError(...)` em `boletos.ts`, `boleto-cobranca.ts`, `exam-results.ts`
(`usa_laboratorio`), `imaging.ts` (`usa_imagem`) e `portal-chat.ts` (`portal_enabled`);
`exam-rejection.ts` tem gate próprio (`flagOn`, `FLAG_OFF`). **Exceção:** `usa_convenios` **não tem guarda
em action** — só a página e os links. Risco baixo (a tela é filtrada por tenant), mas está fora do padrão.

### Duas armadilhas de teste encontradas (importantes para quem repetir a bateria)

1. **`trg_clinics_freemium_seed`** (AFTER INSERT em `clinics`) **reescreve `active_modules`** com o pacote
   freemium. Quem criar clínica de teste com módulos no INSERT roda o teste com 3 módulos e conclui
   "a rotina não aparece nem com a flag ligada" — **falso negativo**. Os módulos têm de ir num UPDATE.
2. **As rotas gateadas respondem HTTP 200 mesmo quando negam acesso.** O `redirect()` do gate acontece
   depois de o shell do Next ter sido enviado (streaming), então o status não muda. Asserção tem de ser
   sobre o **conteúdo renderizado**. Ambas estão documentadas no cabeçalho do script.

---

## 6. Endpoints sensíveis (HTTP, contra o deploy)

| Requisição | Esperado | Obtido |
|---|---|---|
| `GET /api/cron/vaccine-recall` sem header | 401 | ✅ **401** `{"error":"Unauthorized"}` |
| `GET /api/cron/vaccine-recall` com `Bearer errado` | 401 | ✅ **401** |
| `POST /api/webhooks/sicoob-cobranca` sem key | 401 | ✅ **401** `{"error":"unauthorized"}` |
| `POST /api/webhooks/sicoob-cobranca?token=abc123` | 401 | ✅ **401** |
| `GET /portal` | tela de login, sem dados | ✅ 200, "Área do Tutor", sem vazamento |
| `GET /parceiro` | tela de login, sem dados | ✅ 200, "Portal do Veterinário", pede código de acesso |
| `GET /public/verificar/CODIGO-INVALIDO-123` | negativa limpa | ✅ 200, **"Documento não encontrado"** |
| `GET /public/laudo/img_tokeninvalido999` | negativa limpa | ✅ 200, **"Link inválido."** |
| `GET /public/vaccines/<uuid inexistente>` | 404 | ✅ **404** |

Nenhuma das respostas contém `service_role`, JWT, string de conexão ou endpoint REST do Supabase.

O cron ficou **fail-closed** (`if (!secret || auth !== 'Bearer '+secret) return 401`), corrigindo o
fail-open apontado na auditoria (P0-3a). O webhook Sicoob resolve o boleto por **token da conta**
(`bank_accounts.boleto_webhook_token`, migration 0473) e, em caso de ambiguidade, **falha
explicitamente em vez de adivinhar** — corrige o P2-3.

---

## 7. Integridade do caminho do dinheiro

`scripts/verify-exam-rejection.mjs` reexecutado no banco dev — **16/16**:

* **Flag desligada:** linha com `exam_billing_hold_at` preenchido **continua sendo faturada**, linha comum
  faturada, caixa somou os dois serviços (R$ 150). **Comportamento idêntico ao anterior à 0468/0469.**
* **Flag ligada:** exame não realizado **não vira título**; caixa cobrou só os R$ 50 do realizado.
* **Recoleta:** 1ª coleta preservada com motivo e decisão do cliente, recoleta vinculada
  (`exam_recollect_of_id`), nasce travada, só entra na fatura ao ser liberada — cobrança única (R$ 150).

Flag da Sys Demo restaurada pelo próprio script ao valor original (`true`).

---

## 8. Migrations

| Verificação | Resultado |
|---|---|
| Prefixos duplicados em `supabase/migrations` | ✅ **nenhum** (362 arquivos). A colisão `0464` da auditoria foi resolvida no commit `36cd1c7a` (renumeração para 0470+) |
| Lacuna de numeração | 0432 e 0465–0467 ausentes — buracos, não colisões; inofensivos |
| Objetos de 0468–0474 no banco **dev** | ✅ **21/21 presentes** |

Conferidos: tabelas `exam_rejection_reasons`, `clinic_vaccine_recall_runs`, `training_videos`,
`training_quiz_questions`, `training_module_access`, `training_progress`, `training_quiz_attempts`,
`training_reports`; colunas `consultation_services.exam_state / exam_billing_hold_at /
exam_rejection_reason_id / exam_recollect_of_id / exam_client_decision / exam_attempt_no /
exam_return_deadline / exam_decided_by_kind` e `bank_accounts.boleto_webhook_token`; funções
`rpc_absorb_services_into_open_invoice`, `next_nosso_numero`, `next_document_number_auto`.
**RLS habilitada nas 8 tabelas novas.**

---

## 9. Status por rotina

| Rotina | Status | Observação |
|---|---|---|
| Portal do Tutor (área, pré-consulta, chat) | ⚠️ **com ressalva** | Isolamento de dados ✅. Mas `portal_enabled` **não gateia o login** — ver F-1 |
| Portal do Parceiro (vet solicitante) | ⚠️ **com ressalva** | Funciona; **não existe** `partner_portal_enabled` — ver F-2 |
| Visualizador DICOM / módulo Imagem | ✅ **OK** | Flag `usa_imagem` provada em menu + rota + action; página pública do laudo OK |
| Laboratório (exam_results, analitos, HL7) | ⚠️ **com ressalva** | UI e actions gateadas por `usa_laboratorio` ✅; `/api/lab/*` é gateado só pelo token do agente — ver F-3 |
| Boletos Sicoob | ✅ **OK** | Aba, actions e webhook gateados; webhook fail-closed e por conta |
| NFS-e por empresa | ❓ **não testado** | Exige token Focus NFe e emissão real — fora do que dá para provar no dev |
| Compras → Contas a Pagar | ❓ **não testado** | Depende de fluxo logado com NF-e; decisão do Diretor é que o default `true` está correto |
| Livro de Controlados | ❓ **não testado** na UI | Testes unitários (`controlled-ledger`) passam; `is_human_use=false` retroativo continua pendente de revisão manual |
| Conciliação de convênios (Vetplan/AVA) | ⚠️ **com ressalva** | Página e links gateados por `usa_convenios` ✅; **sem guarda em action** |
| Agendamento online | ✅ **OK** | `verify-booking.mjs` prova os 3 modos |
| Chat do portal | ✅ **OK** | Action gateada por `portal_enabled` |
| Pré-consulta | ✅ **OK** | Dentro do `/portal`, gateada pelo acesso do tutor |
| Recall de vacina | ✅ **OK** | Cron fail-closed, flag própria `vaccine_recall_enabled`, `clinic_vaccine_recall_runs` garante 1×/dia/clínica |
| Relatórios novos | ✅ **OK** | `ALWAYS_ON` removido (`123d80b0`); as 12 chaves novas estão em `ReportsEnabled` |
| Academia de Treinamento | ✅ **OK** | Menu + rota gateados; 6 tabelas presentes no dev |
| Fluxo de rejeição de exame | ✅ **OK** | 16/16 no caminho do dinheiro + painel gateado |
| Correções da Tarefa 0 | ✅ **OK** | Flags por rotina, webhook Sicoob, cron configurável, custo do lab, estorno, fila de exames |

---

## 10. Falhas e achados

### Novos (introduzidos/observados nesta bateria)

**F-1 · `portal_enabled` não protege o login do Portal do Tutor — CONFIRMADO POR TESTE**
Criei uma clínica sem a chave `portal_enabled`, gerei uma sessão de tutor válida e acessei `/portal`:
**HTTP 200 e o pet apareceu.** `getTutorContext` (`src/lib/portal/session.ts:18`) não consulta
`flow_config`; a flag só decide se o WhatsApp é enviado (`tutor-portal.ts:312,339`).
Não é vazamento cross-tenant (o tutor só vê os pets dele — `canAccessPatient` cruza `tutor_id`+`clinic_id`),
e ninguém entra sem um código gerado pela própria clínica. É uma rotina **ativa sem ativação**.
*Severidade: média. Era o P2-1 da auditoria; continua aberto.*

**F-2 · Portal do Parceiro sem flag de ativação**
`grep -rn partner_portal_enabled src/` não retorna nada. Único controle é a existência do código.
*Severidade: baixa (inerte sem código). Era o P2-2; continua aberto.*

**F-3 · `/api/lab/worklist` e `/api/lab/results` não consultam `usa_laboratorio`**
São autenticadas pelo token do agente (e o `clinic_id` vem sempre do agente resolvido, nunca do payload —
isolamento correto). Mas uma clínica que desligue a rotina continua aceitando POST de resultado de um
agente já provisionado. *Severidade: baixa.*

**F-4 · `usa_convenios` sem guarda em server action** — só página e UI. *Severidade: baixa.*

**F-5 · 3 dos 6 últimos deploys do `sysvetmax-dev` terminaram em `● Error`**
O build completou (`Build Completed in /vercel/output [3m]`); a falha foi no passo **"Deploying outputs"**.
Não é erro de código. Merece olhar antes da virada, porque a virada depende de um deploy limpo.

### Pré-existentes (não deste lote)

* **P-1** · 21 erros de `tsc` em `tests/` (§2). Não quebram o deploy; quebram o `tsc` como sinal de saúde.
* **P-2** · `scripts/verify-almavet-fechamento.mjs` quebra fora de produção (assume clínica Almavet).
* **P-3** · `verify-saas-phase1/15.mjs` são dumps sem asserção — não servem como gate.

---

## 11. O que NÃO foi possível testar

| Item | Motivo |
|---|---|
| Navegação logada com a conta real de suporte | `process.env.DEV_SYSMAX_PASSWORD` **não existe** nesta máquina e o `.env.local` só tem as 4 chaves do Supabase. Conforme a instrução, **não tentei adivinhar senha**. Contornado criando um usuário admin descartável com senha aleatória — o que deu cobertura autenticada equivalente |
| `next build` local | Instrução explícita (memória limitada). O type check da Vercel cobre |
| E2E Playwright (`npm run test:e2e`) | Exige servidor e seeds de sessão; fora do escopo desta bateria |
| NFS-e real (Focus NFe) | Exige token e clínica fiscal ativa |
| Interfaceamento físico do laboratório (URIT BH-5100, BIOBASE BK-200) | Depende da visita presencial — é a etapa 1 da estratégia de virada |
| Compras → Contas a Pagar e Livro de Controlados na UI | Exigem XML de NF-e e catálogo de controlados revisado |
| Estado da **produção** | Nada foi executado contra `yivjuhurcadxtllmkkqd` |

---

## 12. O que falta para virar (checklist objetivo)

**Bloqueadores de dados/configuração — nenhum é código:**

1. **Backfill `usa_convenios = true`** para quem já usa conciliação em produção, **antes** do deploy:
   `UPDATE clinics SET flow_config = COALESCE(flow_config,'{}'::jsonb) || '{"usa_convenios":true}'::jsonb
    WHERE 'petlove_reconciliation' = ANY(active_modules);`
   Sem isso a Animais abre o Financeiro e a Conciliação sumiu.
2. **Ligar em produção, na Animais, as flags das rotinas que ela vai usar** — `portal_enabled`,
   `usa_imagem`, `usa_laboratorio`, `usa_boleto`, `usa_treinamento`, `usa_fluxo_rejeicao_exame`,
   `vaccine_recall_enabled` (esta **só com o "sim" explícito do cliente** — dispara WhatsApp diário).
   Atenção: em produção o ID da Animais é **`3c6d06ad`**, não `ad1c3fca`.
3. **Confirmar `CRON_SECRET` (ou `KEEPALIVE_SECRET`) no ambiente de produção.** O cron agora é
   fail-closed: **sem a variável ele devolve 401 e o recall simplesmente não roda**. No projeto dev só
   existe `KEEPALIVE_SECRET` (o `CRON_SECRET` **não** está setado).
4. **Aplicar as migrations 0409→0474 por script controlado, objeto a objeto.** `supabase db push` é
   perigoso nos dois ambientes (o registro em `schema_migrations` para em 0408 na prod e 0420 no dev).
5. **Investigar as falhas de "Deploying outputs"** (F-5) antes de contar com um deploy limpo.

**Recomendado antes de entrar o cliente nº 2 (não bloqueia a Animais):** F-1, F-2, F-3, F-4 e a revisão
manual de `is_human_use` no catálogo de controlados.

---

## 13. Como reproduzir

```bash
cd C:/sysvetmax-dev
rm -f ./.next/cache/.tsbuildinfo ./tsconfig.tsbuildinfo
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit     # saída vazia = suspeite, rode de novo

npx jest --testPathPattern="tests/unit"        --maxWorkers=2 --ci
npx jest --testPathPattern="tests/integration" --maxWorkers=1 --ci

node scripts/verify-flag-isolation.mjs https://sysvetmax-dev.vercel.app
node scripts/verify-exam-rejection.mjs
node scripts/verify-portal.mjs   https://sysvetmax-dev.vercel.app
node scripts/verify-imaging.mjs  https://sysvetmax-dev.vercel.app
node scripts/verify-booking.mjs  https://sysvetmax-dev.vercel.app
```
