# Fluxo de Rejeição de Exame — Plano de execução (não commitar)

Branch `feature/treinamento` · worktree `C:\sysvetmax-dev` · banco dev `claqxwckiihknclhmzvf`.
Migrations a partir de **0468**.

## 0. Achados da investigação (base das decisões)

- A **linha cobrável** de um exame é `consultation_services` (snapshot de nome/preço),
  não `exam_requests`. `exam_requests` é a fila operacional; `exam_results` são os
  analitos (draft/released), por consulta.
- Os **3 caminhos de faturamento** leem `consultation_services` com o MESMO filtro
  `cancelled_at IS NULL AND billed_in_invoice_id IS NULL`:
  1. `generateInvoice()` — `src/lib/actions/billing.ts:101`
  2. `generatePartialInvoice()` — `src/lib/actions/billing.ts:1560`
  3. `rpc_absorb_services_into_open_invoice` — migration `0420`
- `sendToCashier()` (`src/lib/actions/vet.ts:730`) é quem dispara 1→3.
- `sendExamToPartnerLab()` (`src/lib/actions/exams.ts:426`) **cobra o tutor na hora**
  (chama `sendToCashier`) — é exatamente a dor relatada.
- Não existe hoje nenhum conceito de "exame rejeitado/não realizado".
- Trigger `trg_cashier_entry_to_financial` **ignora** `source_module='consultation'`
  (migration 0427) → o `financial_entry` da consulta nasce no `processPayment`.
  Logo o gate certo é **antes da fatura**, não no trigger.

## 1. Flag por clínica

`clinics.flow_config.usa_fluxo_rejeicao_exame` (boolean, ausente = desligado).
- Tipo em `FlowConfig` + helper `usesFluxoRejeicaoExame()` em `clinic-settings.ts`
  (mesmo padrão de `usesConvenios`/`usesTreinamento`).
- Toggle `RejeicaoExameSettings` em GESTÃO > CONFIGURAÇÕES (`SettingsWorkspace.tsx`),
  categoria **Laboratório**, junto do catálogo de motivos.

## 2. Migrations

### 0468_exam_rejection_flow.sql (aditiva, IF NOT EXISTS)
- `exam_rejection_reasons` (clinic_id + code + label + sort_order + is_active), RLS ON
  sem policy (padrão do projeto: acesso só por service role nas server actions).
- Colunas aditivas em `consultation_services` (todas NULL por padrão):
  `exam_state`, `exam_rejected_at/_by`, `exam_rejection_reason_id`, `exam_rejection_note`,
  `exam_client_decision`, `exam_decided_at`, `exam_decided_by_kind`, `exam_decided_by_label`,
  `exam_recollect_of_id` (vínculo 1ª coleta ↔ recoleta), `exam_attempt_no`,
  `exam_billing_hold_at` (trava de cobrança), `exam_notified_at`.
- Índices parciais.

### 0469_absorb_respects_exam_hold.sql
`CREATE OR REPLACE rpc_absorb_services_into_open_invoice` com a condição
`(v_flag = FALSE OR cs.exam_billing_hold_at IS NULL)`, onde `v_flag` é lido de
`clinics.flow_config->>'usa_fluxo_rejeicao_exame'`. Com a flag desligada o loop é
**bit-a-bit** o atual.

### Motivos padrão
NÃO vão em migration (isso tocaria todos os tenants). São semeados por
`seedDefaultRejectionReasons()` no momento em que a clínica LIGA a flag, e há botão
"Restaurar padrão" no painel. A lista definitiva da cliente entra pela UI.

## 3. Lógica pura (módulo sem 'use server', testável)

`src/lib/exams/rejection-flow.ts`
- `ExamState = 'pending' | 'performed' | 'rejected' | 'recollect_requested' | 'closed_no_recollect'`
- `nextExamState(current, event)` — máquina de estados + transições inválidas
- `isExamBillable(line, flagOn)` — elegibilidade de cobrança
- `resolveRejectionRecipients(ctx)` — quem encaminhou (clínica parceira / MV solicitante)
  + tutor
- `DEFAULT_REJECTION_REASONS`
- `buildRejectionMessage()` — texto WhatsApp

Testes: `tests/unit/exam-rejection-flow.test.ts`.

## 4. Server actions

`src/lib/actions/exam-rejection.ts` ('use server', sem re-export de tipo)
- catálogo: `listRejectionReasons`, `saveRejectionReason`, `deleteRejectionReason`,
  `seedDefaultRejectionReasons`
- operação: `listExamLines(consultationId)`, `markExamPerformed`, `rejectExamLine`,
  `recordExamDecision` (staff)
- relatório: `getExamRejectionReport({ from, to, partner_clinic_id })`

`src/lib/actions/exam-rejection-portal.ts` ('use server')
- `getPartnerPendingExamDecisions()` / `submitPartnerExamDecision()` (sessão parceiro)
- `getTutorPendingExamDecisions()` / `submitTutorExamDecision()` (sessão tutor)

Notificação: `src/lib/exams/rejection-notify.ts` (server-only, sem 'use server') —
WhatsApp via Evolution + e-mail via Resend, best-effort, nunca derruba a ação.

## 5. Gate de cobrança (só com a flag LIGADA)

| Ponto | Com flag OFF | Com flag ON |
|---|---|---|
| `generateInvoice` | idêntico | + `.is('exam_billing_hold_at', null)` |
| `generatePartialInvoice` | idêntico | + `.is('exam_billing_hold_at', null)` |
| RPC absorb | idêntico (flag lida em SQL) | respeita o hold |
| `sendExamToPartnerLab` | chama `sendToCashier` | **não** chama; põe hold nas linhas de exame |
| `releaseExamResults` | idêntico | libera o hold + marca `performed` + cobra |

## 6. UI

- `src/components/exams/ExamRejectionPanel.tsx` — dentro de `ExamDetail` (só flag ON).
- `src/components/exams/RejectExamModal.tsx` — `createPortal(document.body)`.
- `src/components/management/Settings/RejeicaoExameSettings.tsx` — toggle + catálogo.
- Portal do parceiro (`/parceiro`): card "Exames não realizados" com
  **Solicitar recoleta** / **Não recoletar**.
- Portal do tutor (`/portal/pet/[id]`): mesmo card quando o encaminhamento foi do tutor.
- `src/components/reports/ExamRejectionsReport.tsx` + registro em `ReportsWorkspace`.

## 7. Etapas / commits

1. Migration 0468 + 0469 + scripts apply + flag no FlowConfig + toggle. (commit)
2. Lógica pura + testes Jest. (commit)
3. Server actions + notificação. (commit)
4. Gate de cobrança nos 3 caminhos + sendExamToPartnerLab + releaseExamResults. (commit)
5. UI equipe (ExamDetail + settings). (commit)
6. Portais (parceiro/tutor) + relatório. (commit)
7. tsc sem cache + deploy dev + validação com dados reais.
