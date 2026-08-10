# Sprint Plan — Enviar ao Caixa sem Dar Alta (Opção A)

**Data:** 2026-08-06
**Origem:** Almavet (Dra. Laís / Levi). MV trabalha sozinha, alto fluxo + internação. Anota o prontuário rápido, envia o tutor ao caixa, e só depois volta para refinar notas, corrigir ortografia e gerar documentos. Hoje a **única** forma de liberar o caixa é dar alta — o que trava o prontuário (imutável, CFMV) e impede a volta. Resultado: parou de usar o sistema.
**Decisão:** Opção A — **desacoplar "liberar para o caixa" (financeiro) de "assinar/finalizar o prontuário" (legal)**, mantendo conformidade CFMV (Res. 1321/2020).

---

## 1. Racional CFMV (por que é conforme)

- A imutabilidade médico-legal só se aplica ao prontuário **assinado** (`status='completed' AND is_reviewed_by_vet=TRUE`, trigger `0411`).
- Cobrar o tutor e assiná-lo são **eventos distintos**. Não há exigência de que o prontuário esteja assinado antes do pagamento; a exigência é que **eventualmente** seja assinado e, uma vez assinado, seja imutável (correção só por adendo).
- A janela "cobrei → refinei → assinei" é prática clínica normal. Precedente no próprio sistema: **internação** já cobra pelo caixa (`hospitalization-charges`) com o prontuário aberto/editável.

---

## 2. Modelo de estados (lifecycle)

Novo status intermediário **`awaiting_review`** = *cobrado no caixa, prontuário ainda não assinado (editável)*.

```
in_progress ──[Enviar ao caixa (manter aberto)]──▶ awaiting_review ──[Finalizar prontuário / assinar]──▶ completed (LOCK 0411)
     │                                                    │
     └──[Finalizar e enviar ao caixa (fluxo atual)]───────┴──────────────────────────────────────────────▶ completed (LOCK 0411)
```

- `awaiting_review`: **NÃO** seta `is_reviewed_by_vet`; **não** é travado pelo 0411; totalmente editável (notas, exames, vacinas, serviços).
- Fatura/pending no caixa são gerados **na entrada** de `awaiting_review`.
- `completed` continua sendo o ato deliberado de assinatura (todos os gates atuais preservados).
- **O fluxo combinado atual continua existindo e é o CTA primário** — `awaiting_review` só se materializa se alguém clicar no botão novo.

---

## 3. Banco de dados (1 migration aditiva)

`supabase/migrations/04XX_awaiting_review_status.sql`

1. **Enum de status** — DROP+ADD do `consultations_status_check` (padrão da `0024`), incluindo `awaiting_review` na lista de 11 valores existentes.
2. **Flow guards** — incluir `awaiting_review` como **fluxo ativo** em:
   - `fn_guard_consultation_flow` e `fn_guard_hospitalization_flow` (`0418`) — impede abrir 2º atendimento / internar com prontuário ainda pendente de assinatura.
   - `pet_active_attendance` (`0399`) — mapear `awaiting_review → 'Consultório'` (ou "Aguardando finalização") para o pet aparecer como em atendimento.
3. **Imutabilidade (0411)** — nenhuma mudança: assinar partindo de `awaiting_review` não viola a trava (ela só morde quando `OLD` já é `completed+reviewed`).

> Migrations apenas aditivas com `IF NOT EXISTS` / DROP+ADD idempotente (regra CLAUDE.md). Aplicar no Supabase remoto após criar (regra `feedback_migrations_auto_apply`).

---

## 4. Server actions

### 4.1 `sendToCashier(consultationId)` — nova, em `src/lib/actions/vet.ts`
Libera o caixa sem assinar.
- Pré-condições (reuso dos guards de alta, **exceto** o gate de IA):
  - Autenticado + clínica.
  - Consulta em estado editável (`in_progress` | `waiting_exam` | `medication`).
  - `hasService` — ao menos 1 `consultation_services` ativo (não gera fatura zerada).
  - **NÃO** aplica o gate de sugestões de IA (`pendingMedSuggestions`/`aiTextPending`) nem exige `is_reviewed_by_vet` — esses protegem a **assinatura**, não a cobrança.
- Efeitos (ordem):
  1. `status = 'awaiting_review'` (deixa `is_reviewed_by_vet=false`).
  2. `generateInvoice(consultationId)` → `invoices(kind='final', status='pending')` + `invoice_items` + `central_cashier(pending, source_id=invoice.id, amount=tutor_due)`; marca serviços com `billed_in_invoice_id`.
  3. `logAudit('SEND_TO_CASHIER')`, `revalidatePath`.
- Idempotência: se já existe invoice `final`, `generateInvoice` retorna a existente (comportamento atual) — reenviar não duplica.

### 4.2 `finalizeConsultation` — ajuste (assinatura definitiva)
- Aceitar transição a partir de `awaiting_review` (além de `in_progress`).
- **Sweep de reconciliação ANTES de setar `completed`** (ver §5): varrer serviços não faturados e emitir fatura complementar. Precisa ser antes porque `generatePartialInvoice` bloqueia `completed`.
- Se já veio de `awaiting_review`, **não** re-gerar a fatura principal (idempotência já cobre).
- Mantém todos os gates de assinatura (hasService, IA revisada, checkbox `is_reviewed_by_vet`).

### 4.3 `reconcileConsultationBilling(consultationId)` — nova, em `src/lib/actions/billing.ts`
Wrapper que varre `consultation_services` com `billed_in_invoice_id IS NULL` e, se houver saldo > 0, chama a lógica de fatura complementar (§5). Chamada:
- automaticamente no `sendToCashier` de novo serviço? Não — ver §5 (regra: no salvar serviço + no finalize).
- no `finalizeConsultation` (sweep obrigatório).

---

## 5. Reconciliação de serviços/itens inseridos **após** o recebimento (o coração do pedido)

**Problema atual (buraco confirmado):** serviço adicionado depois da fatura fica `billed_in_invoice_id=NULL` e **nunca é cobrado** — nenhum caminho automático o recaptura.

**Regra unificada:** todo `consultation_services` ativo e não faturado vira **cobrança complementar** (invoice `kind='partial'` + novo `central_cashier` pending), independentemente de o pagamento anterior já ter ocorrido.

Reuso: **`generatePartialInvoice`** (billing.ts:1513) já faz exatamente isso. Ajuste necessário: liberar a guarda `billing.ts:1539` para permitir `awaiting_review` (hoje só bloqueia `completed`/`cancelled`).

### Sub-casos
| Momento do lançamento | Estado da 1ª invoice | Comportamento |
|---|---|---|
| Serviço add em `awaiting_review`, **antes** de qualquer recebimento | pending (nada pago) | **Agrupar (D2):** absorver o novo serviço na fatura pending existente (regenerar/atualizar) → **um único pending/recebimento** para o Levi. |
| Serviço add com fatura **parcialmente** paga | paid_partial | Complementar: novo pending só do delta (não se mexe no que já foi pago). |
| Serviço add **depois** do recebimento total | paid | Complementar obrigatória: novo pending no caixa (não se altera fatura paga — correto fiscal/CFMV). |
| Serviço add e MV **assina** sem sweep | — | Sweep no `finalizeConsultation` garante que nada escapa (cria complementar antes de `completed`). |

### Gatilhos da reconciliação
1. **Ao salvar um serviço** numa consulta que já está `awaiting_review` (ou que já tem invoice `final`): disparar `reconcileConsultationBilling` (cria/atualiza o pending complementar) — assim o Levi vê o delta na hora.
2. **No `finalizeConsultation`** (rede de segurança final): sweep obrigatório antes de flipar para `completed`.

### 5.1 Agrupamento quando nada foi pago (D2 — decidido, dentro do MVP)
Se a fatura da consulta está **totalmente pending (nenhum recebimento)**, ao adicionar um novo serviço devemos **absorvê-lo na fatura existente** para que o Levi faça **um único recebimento** — em vez de fragmentar em múltiplos pendings.
- Mecânica: como `invoices`/`invoice_items` não são livremente mutáveis e a fatura ainda não foi paga, o caminho seguro é **cancelar/regenerar** a fatura pending: soltar os `consultation_services` (voltar `billed_in_invoice_id=NULL`), remover a invoice pending + seu `central_cashier` pending (que ainda está `status='pending'`, nunca `recorded`), e chamar `generateInvoice` de novo — recriando **uma** fatura com todos os serviços.
- Guard de segurança: **só** regenerar se a invoice está `status='pending'` E o `central_cashier` correspondente está `status='pending'` (nada `recorded`/`verified`). Se qualquer parte já foi paga → cai no caminho complementar do delta (linha `paid_partial`/`paid` da tabela acima). Isso preserva a regra CFMV/fiscal de nunca alterar cobrança já paga.
- Idempotência/corrida: operação server-side atômica (transação/RPC) para evitar duas regenerações concorrentes.

### 5.2 Guardrail anti-perda
- Nenhum serviço não faturado pode sobreviver à assinatura sem virar cobrança → garantido pelo sweep no finalize.
- Card/aviso no caixa: "Fatura complementar pendente" já aparece naturalmente em `getPendingInvoices` (lista `pending` + `paid_partial`).

---

## 6. UI

### 6.1 `ConsultationDetail.tsx`
- Novo botão secundário **"Enviar ao caixa (manter aberto)"** ao lado do atual. CTA primário continua **"Finalizar e enviar ao caixa"** (Zero-Click preservado).
- Em `awaiting_review`: mostrar banner "Enviado ao caixa · aguardando finalização do prontuário" + botão **"Finalizar prontuário"** (assinatura → `completed`). Prontuário permanece **editável** (revisar `isFinalized:210` para NÃO incluir `awaiting_review`).
- `STATUS_LABELS`: `awaiting_review → 'Ag. Finalização'`.

### 6.2 Kanban / filas — incluir `awaiting_review` nos allowlists (senão o card **some**)
- `vet.ts:56` (fila ativa do MV) — **obrigatório**: é onde a Laís reencontra o prontuário para assinar.
- `kanban.ts:81` e `agenda.ts:36-44` (boards consultório/recepção) — incluir; se desejar, coluna própria "Ag. Finalização".
- Revisar `consultations.ts:425`, `triage.ts:276` (históricos do dia) para não sumir.
- `pets.ts:370`, `wpp-appointment-reminders:50` são **blocklist** (`neq/not in`) → já tratam `awaiting_review` como ativo automaticamente (ok).

### 6.3 Pendências (higiene médico-legal)
- Badge/lista no painel do MV: **"Prontuários no caixa aguardando sua finalização"** = `status='awaiting_review'` da clínica. Evita prontuário sem assinatura eterno.
- *Opcional fase 2:* lembrete/auto-flag após N dias sem assinar.

### 6.4 Types
- `src/types/index.ts:101-110` — adicionar `awaiting_review` ao union `ConsultationStatus` (e de quebra `hospitalized`/`revisao_pos_internacao` que já faltam no tipo).

---

## 7. Impacto em outros clientes

- **Aditivo.** O fluxo combinado atual é intocado e continua sendo o padrão. `awaiting_review` só existe se a clínica clicar no botão novo.
- **Único ponto transversal:** os allowlists de kanban precisam conhecer `awaiting_review`, senão um card entraria e sumiria. Como nenhuma outra clínica gera esse status sem clicar, na prática não há regressão — mas fazemos a fiação para ser seguro quando usado.
- **Sem flag obrigatória.** Se quiser conservadorismo, esconder o botão atrás de um setting por clínica default **ON** (baixo custo). Recomendo **sem flag** — a feature é genericamente útil (clínico de alto volume que anota rápido e refina depois é o caso comum).

---

## 8. Testes

**Integração / unit (Jest):**
- `sendToCashier` cria invoice+pending e mantém `is_reviewed_by_vet=false` e status editável.
- Serviço adicionado pós-`sendToCashier` → `reconcileConsultationBilling` gera pending complementar do delta.
- Serviço adicionado pós-pagamento → nova invoice `partial` pending (fatura paga intacta).
- `finalizeConsultation` a partir de `awaiting_review`: sweep cobra pendências antes de `completed`; trava 0411 passa a valer depois.
- Guard: `sendToCashier` sem serviço → erro.

**E2E (Playwright):**
- Fluxo Laís: anota rápido → Enviar ao caixa → Levi recebe → MV volta, edita nota + adiciona vacina → aparece complementar no caixa → MV assina → prontuário trava (edição via adendo).
- Regressão: fluxo combinado atual (alta direta) inalterado.
- Kanban: card em `awaiting_review` visível na fila do MV e no board.

**Segurança:** isolamento por `clinic_id` em todas as novas queries; sem `SELECT *`.

---

## 9. Ordem de execução (entregáveis)

1. **Migration** `04XX` (status enum + flow guards) → aplicar no remoto.
2. **Types** (`ConsultationStatus`).
3. **Actions**: `sendToCashier`, ajuste `finalizeConsultation` (sweep + origem `awaiting_review`), `reconcileConsultationBilling`, liberar `generatePartialInvoice` para `awaiting_review`, hook no `addServiceToConsultation`/`updateConsultationServicePrice` para reconciliar quando já faturada.
4. **UI**: botão + banner + label + `isFinalized` + allowlists de kanban + lista de pendências.
5. **Testes** integração + E2E.
6. **tsc limpo sem cache** antes do push (regra `feedback_tsc_clean_before_push`).

Branch/deploy: seguir regra vigente. (CLAUDE.md permite commit direto na `main` só para a sprint de Internação; **esta sprint não está nessa exceção** → branch `fix/` ou `feature/caixa-sem-alta` + PR, salvo autorização explícita do Diretor para main.)

---

## 10. Riscos & decisões abertas

- **D1 — DECIDIDO: status `awaiting_review`** (semântica clara p/ MV + coluna de kanban + lista de pendências).
- **D2 — DECIDIDO: agrupar quando nada foi pago** (§5.1) — um único recebimento para o Levi via regenerar-se-pending; complementar do delta só quando já houve recebimento (parcial/total).
- **D3 — `consultations.payment_status`:** campo legado/manual; o pagamento real vive em `invoices`. Não é necessário sincronizar; deixar como está (fora de escopo).
- **D4 — DECIDIDO: coluna própria "Ag. Finalização"** no board do MV; nos demais boards, manter junto do fluxo ativo.
