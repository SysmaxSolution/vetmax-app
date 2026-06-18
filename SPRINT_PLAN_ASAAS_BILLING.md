# Sprint — Regras de Negócio & Build do Checkout de Assinatura (Asaas)

> Fonte da verdade da sprint de cobrança SaaS. Consolidado a partir das regras
> do PO (2026-06-17) + veredito do LLM Council (2026-06-18). Rota do módulo:
> `/dashboard/management?tab=assinatura` (componente `SubscriptionTab`).
> Gateway: **Asaas** (Sysmax = merchant; clínica = `customer`; plano = cobrança/subscription).

---

## 0. Estado atual (baseline)

- **PIX mensal/anual já funciona**: `subscribeToPlan` cria `customer` + `subscription` PIX real e abre a fatura; webhook idempotente (`subscription_invoices.asaas_payment_id UNIQUE`) atualiza status.
- **Ativação hoje é OTIMISTA** (status = `active` na hora de assinar, antes do pagamento). **Vai mudar** (Regra 6).
- **Cartão ainda é dummy** (sem tokenização).
- **Anual PIX = 20% off** já implementado como cobrança única.
- Webhook: `PAID → active`, `OVERDUE → past_due`. `tenant_subscriptions` tem `asaas_customer_id/asaas_subscription_id/last_payment_status/last_payment_at`.

---

## 1. Decisões inegociáveis (correções do Council)

### D1 — Anual é compra PRÉ-PAGA, não "12 mensalidades acopladas"
Anual = **uma cobrança única** que dá direito a **365 dias** de acesso.
Não existe "2ª mensalidade" nem "vencimento da 12ª" no anual — existe **expiração**.

- **Anual PIX:** cobrança única = `12 × preço × 0,80` (20% off). ✅ já implementado.
- **Anual Cartão:** cobrança **única** `12 × preço × 0,90` (10% off), `billingType=CREDIT_CARD`, `cycle=YEARLY`.
  **NUNCA** parcelamento (`installmentCount`) — o MDR do parcelado consome o desconto.
  **NUNCA** subscription mensal de cartão para o caso anual (Asaas cobraria mês a mês).

### D2 — Inadimplência dirigida por EVENTO, não por número do mês
Esqueça "mês 2 / mês 12". O gatilho é o **webhook do Asaas + dias de atraso**, idêntico em qualquer mês.
A intenção original do PO ("não punir o mês 1 enquanto o 1º pagamento liquida") é resolvida pelo **estado `pending`**, não por contador de mês.

### D3 — Carência clínica (CFMV) obrigatória
**Não** desativar módulos no meio de um atendimento de clínica com **internação ativa ou prontuário aberto**.
A suspensão por inadimplência respeita uma **carência para registros clínicos ativos** (acesso de leitura ao prontuário preservado).

### D4 — Especializado com auditoria
Preço definido por **admin Sysmax** com **log de auditoria** (quem / quando / valor anterior → novo). Para o cliente: **"Sob consulta — falar com vendas"** + captura de lead. Nunca preço em branco.

### D5 — Grandfathering dos clientes atuais (PO 2026-06-18)
**Clientes com assinatura JÁ ativa NUNCA podem ser forçados a preencher cartão/pagamento** pelo novo gating. A exigência de pagamento (estado `pending` com módulos OFF, dunning, suspensão) vale **apenas para novas adesões** ou quando o cliente **opta** por se auto-servir no checkout. A Sysmax negocia a migração individualmente — o cliente acessa por conta própria e preenche os dados de pagamento quando decidir.
- **Impacto no build:** a migration que introduz `lifecycle_state` (Item 3) deve fazer **backfill das assinaturas ativas existentes como `active` grandfathered** (flag `is_grandfathered`/origem legada), nunca `pending`. O cron de dunning (Item 6) **ignora** assinaturas grandfathered enquanto não houver opt-in de pagamento. Sem isso, **não commitar/pushar** os itens de gating.

---

## 2. Máquina de estados da assinatura

Coluna nova `tenant_subscriptions.lifecycle_state` (além de `plan_name`/`status` legados).

### Mensal (recorrente)
```
pending ──PAID──▶ active ──OVERDUE──▶ past_due ──+7d s/ pagar──▶ grace ──fim carência──▶ suspended
   │                 ▲                                                                          │
   └────────────────┘◀──────────────────────── PAID (regulariza) ───────────────────────────┘
```
- `pending`: assinou, aguardando 1º pagamento. **Módulos OFF**, UI mostra "aguardando pagamento" + fatura.
- `active`: pago e em dia. **Módulos ON**.
- `past_due`: `PAYMENT_OVERDUE` recebido. Módulos ainda ON, banner de aviso (mensagem M1).
- `grace`: venceu há 7 dias sem pagar. Aviso forte (M2). **Carência clínica (D3) ainda protege.**
- `suspended`: módulos OFF (respeitando D3). Reativa com pagamento.

### Anual (pré-pago)
```
pending ──PAID──▶ active ──(expiry−7d)──▶ expiring ──(expiry)──▶ expired
```
- `active`: vale até `current_period_end` (data da compra + 365d). **Módulos ON o ano inteiro.**
- `expiring`: faltam ≤7 dias para expirar → aviso de **renovação** (mensagem M3), nunca de "inadimplência".
- `expired`: venceu o ano e não renovou → mesmo tratamento de `suspended` (com D3).
- Chargeback/estorno (`PAYMENT_CHARGEBACK`/refund) no anual → vai direto para `suspended` (não espera o ano).

### Mapeamento webhook → ação
| Evento Asaas | Ação |
|---|---|
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | `→ active`; **ativa módulos** (`syncClinicModulesFromContract`); grava invoice + NFS-e |
| `PAYMENT_OVERDUE` | mensal `→ past_due` (grava `due_date`); anual: ignora (não há mensalidade) |
| `PAYMENT_CHARGEBACK` / `PAYMENT_REFUNDED` | `→ suspended` (respeita D3); cancela NFS-e |
| (cron diário) `past_due` há ≥7d | `→ grace`; se carência clínica vencida `→ suspended` |
| (cron diário) anual `expiry−7d` | `→ expiring` |

---

## 3. Redação das mensagens in-app

**M1 — `past_due` (mensal, venceu):**
> "Não recebemos o pagamento da sua mensalidade. Pague até **{DD/MM/AAAA}** para manter seu acesso. **[PAGAR AGORA]**"

**M2 — `grace` (mensal, 7 dias após vencer):**
> "Pagamento ainda não identificado. Seu acesso aos módulos do plano será suspenso em **{DD/MM/AAAA}**. Regularize agora para não perder o acesso. **[PAGAR AGORA via PIX]** · Dúvidas? Fale com a Sysmax Software."

**M3 — `expiring` (anual, faltam ≤7 dias):**
> "Sua assinatura anual vence em **{DD/MM/AAAA}**. Renove para manter o acesso sem interrupção. **[RENOVAR]**"

**M4 — clínica com internação ativa em `grace`/`expired` (carência D3):**
> "Há atendimentos/internações em andamento. O acesso de leitura ao prontuário foi preservado por segurança do paciente; regularize o pagamento para reativar os módulos. **[PAGAR AGORA]**"

> Regras de redação (Outsider): **liderar com a ação** (botão PAGAR AGORA), **data exata** (nunca "7 dias após o vencimento"), nunca "ligue para a Sysmax" como ação principal.

---

## 4. UX do checkout

1. **Toggle Mensal/Anual acima dos planos** — ao alternar, **reimprime os preços nos cards instantaneamente**.
2. **Preço PIX é a manchete** ("R$ 950/ano no PIX"); cartão aparece como opção secundária para não soar "multa por cartão".
3. **Clicar no plano → modal com opções de pagamento** (PIX destaque / Cartão).
4. **Especializado:** card mostra "Sob consulta — falar com vendas" + CTA de contato (lead). O preço real é definido pela Sysmax (Seção D4).

---

## 5. Itens transversais (decidir/implementar junto)

- **NFS-e:** emitir no `PAYMENT_CONFIRMED` (já existe Focus NFe). Desconto 10/20% muda a **base de ISS** → contabilizar **líquido**. Estorno → **cancelar NFS-e**.
- **LGPD:** cartão **sempre** via tokenização Asaas (nunca o PAN no servidor). `creditCardHolderInfo`/CPF guardado localmente → base legal + retenção definidas.
- **Idempotência do webhook:** ✅ já coberta (`asaas_payment_id UNIQUE`). Manter ao adicionar novos eventos.
- **Pagamento parcial (PIX a menor):** fatura fica aberta → permanece `pending`/`past_due`; tratar como não-pago.

---

## 6. Ordem de build (Executor, ajustada)

| # | Item | Dep. | Estimativa | Risco |
|---|---|---|---|---|
| 1 | ✅ **R5 Especializado** (ENTREGUE 2026-06-18): migration 0395 (subscription_leads + subscription_price_audit) APLICADA; actions requestSpecializedQuote/listSubscriptionLeads/updateLeadStatus/setSpecializedPrice + auditoria em updateSubscriptionPricing; UI SpecializedQuoteModal (substitui WhatsApp solto) + SubscriptionLeadsPanel (funil Sysmax). tsc limpo. **Não commitado/pushado** (aguarda OK). | — | ~1 dia | baixo |
| 2 | ✅ **R3/R4 UI** (ENTREGUE 2026-06-18): cards lideram com PIX anual ("R$ X/ano no PIX" + equivalência /mês + economia) no ciclo anual; modal com PIX default/primário (badge "Recomendado"/"Melhor preço") e cartão secundário. tsc limpo. **Não pushado** (condição D5). | — | ~½ dia | baixo |
| 3 | ✅ **R6 Máquina de estados + ativação pós-pagamento** (ENTREGUE 2026-06-18): migration **0396** APLICADA (`lifecycle_state` + `is_grandfathered`; backfill D5 grandfathered = **9 pagas protegidas**, 2 free). `src/lib/billing/provision.ts` centraliza sync+contratos+`activatePaidSubscription`. `subscribeToPlan`: PIX nasce `pending` (módulos só no PAYMENT_CONFIRMED), cartão dummy ativa direto. Webhook PAID chama `activatePaidSubscription` (idempotente); OVERDUE→`past_due`. Badge UI reflete lifecycle. tsc limpo. | migration | ~1–2 dias | médio |
| 4 | **Tokenização de cartão** (o gargalo): `creditCard` + `creditCardHolderInfo` + `remoteIp`; form PCI-safe; testes decline/3DS | 3 | ~3–4 dias | alto |
| 5 | **R2 anual-cartão**: cobrança única `12×preço×0,90` | 4 | trivial | baixo |
| 6 | **R7 dunning + cron**: `OVERDUE→past_due`, cron diário `+7d→grace/suspended`, carência clínica D3, mensagens M1–M4 | 3 | ~2 dias | médio |
| 7 | **NFS-e no PAYMENT_CONFIRMED** + cancelamento no estorno | 3 | ~1 dia | médio |

**Fase posterior (Expansionist):** trial, proração em upgrade, smart-retry/WhatsApp dunning, add-on credits, usage-based per-unidade.

---

## 7. O que muda no código atual

- `subscribeToPlan`: deixar de marcar `active` direto; setar `lifecycle_state='pending'`; **não** chamar `syncClinicModulesFromContract` no subscribe (passa para o webhook).
- `webhooks/asaas/route.ts`: no `PAID` chamar `syncClinicModulesFromContract`; tratar `PAYMENT_CHARGEBACK`/refund; gravar `due_date` no `OVERDUE`.
- Nova migration: `lifecycle_state` + tabela de auditoria de preço do Especializado + (se preciso) campos de carência clínica.
- Novo cron diário (pg_cron ou Vercel cron) para transições `past_due→grace→suspended` e `active→expiring→expired`.
- `SubscriptionTab` / `CheckoutDummyModal`: toggle reimprime preços; modal pix/cartão; Especializado "Sob consulta".

---

## 8. Ratificação do PO (2026-06-18) — FECHADO
- [x] **D1**: anual-cartão = **cobrança única** `12×preço×0,90`, sem parcelamento, sem subscription mensal. ✅
- [x] **D3**: carência clínica = **acesso de leitura ao prontuário preservado ENQUANTO houver internação ativa ou prontuário aberto**; quando todos os registros clínicos fecham, suspensão normal (sem janela fixa de dias). É proteção do paciente, não escapatória de pagamento. ✅
- [x] **D4**: Especializado = **lead + captura no app** (card "Sob consulta — falar com vendas" → grava lead no banco + notifica Sysmax). Preço final lançado por admin Sysmax com **log de auditoria**. ✅
- [x] Migrations de pagamento: **0395** (leads+auditoria) e **0396** (lifecycle_state+grandfathering) APLICADAS mediante OK do PO em 2026-06-18. Backfill D5 verificado: 9 pagas grandfathered, 0 forçadas a pagamento.
