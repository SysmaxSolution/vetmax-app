# Sprint Plan — Caixa Unificado + Juros Petlove + Correções Convênio

> **Origem:** Reunião com clientes (Dra. Laís Prado Marques + Levi Prado Marques) em 04/06/2026, 63 min.
> **Status:** 🚀 APROVADO E EM EXECUÇÃO (ByPass autorizado pelo PO em 04/06/2026) — Q1–Q6 decididas + 3 refinamentos incorporados (B4, A3, C6).
> **Convenção de branches:** `fix/B2-recalculo-cobertura`, `feature/A-juros-coparticipacao`, etc. + PR para `main` no vetmax-app.
> **Repositório:** vetmax-app (push no remote `vetmax`).
> **Convenção da sprint:** branch + PR (a exceção de main direto vale só para a sprint Internação/Cirurgia).

---

## 1. Sumário Executivo

A reunião percorreu o fluxo Petlove de ponta a ponta (cadastro → consulta → caixa → importação de planilha) e levantou **3 bugs confirmados ao vivo**, **2 épicos de melhoria aprovados verbalmente pelos clientes** e **1 melhoria de cadastro**, além de itens de backlog/roadmap. O módulo Orçamento foi explicitamente adiado para levantamento dedicado em outra reunião.

| Grupo | Itens | Prioridade |
|---|---|---|
| 🐛 Bugs confirmados na demo | B1, B2, B3, B4 | P0 |
| 💳 Épico A — Juros/taxa sobre coparticipação Petlove | A1–A5 | P1 |
| 🏪 Épico B — Unificação PDV → Caixa | C1–C6 | P1 |
| 📅 Épico C — Data de adesão editável | D1–D2 | P1 |
| 📦 Backlog / Roadmap | E1–E6 | P2/P3 |

---

## 2. Bugs Confirmados (P0) — corrigir antes de qualquer feature

### B1 — Consultório puxa valor particular em vez do valor convênio
**Evidência (transcrição ~19:01):** *"Porque ele tá considerando o valor cheio, né? O pessoal tá verificando porque o valor aqui tá errado, ele deveria estar considerando o valor de convênio que você definiu dentro do cadastro de serviço."*

- **Comportamento esperado:** pet com convênio Petlove ativo + serviço com `stock_items.default_insurance_price` preenchido → seleção de serviço no consultório deve exibir o preço convênio (hierarquia custom → default → fallback).
- **Comportamento observado:** exibe `unit_price` (particular cheio).
- **Hipóteses de causa (investigar nesta ordem):**
  1. O componente de seleção de serviço no consultório não chama `resolveServicePricing()` (`src/lib/actions/insurance-pricing.ts:56-144`) — usa `unit_price` direto.
  2. `resolveServicePricing()` é chamado mas o resultado `source='default'` não é aplicado ao snapshot (`consultation_services.insurance_total_snapshot`).
  3. Detecção de convênio ativo falha (consulta a `pet_insurance.coverage_status` com status divergente).
- **Arquivos prováveis:** `src/lib/actions/insurance-pricing.ts`, componente de adição de serviço no consultório (`ServiceSelectionModal` / fluxo `consultation_services`), `src/lib/actions/insurance-checkout.ts`.
- **Critério de aceite:** pet Petlove + serviço com preço convênio 73,00 (particular 120,00) → ao adicionar serviço na consulta, snapshot exibe 73,00 com split copay/repass (ou pede split inline quando `requires_split_input=true`).
- **Teste:** E2E novo em `tests/e2e/` cobrindo os 4 níveis da hierarquia de preço (custom / default / fallback / sem convênio).
- **Estimativa:** 0,5–1 dia (inclui investigação).

### B2 — "Aplicar cobertura" não recalcula o valor final do recebimento
**Evidência (~22:36):** *"Era para mudar o valor final aqui só para 30 e 21. Tá errado, eu vou cobrar o pessoal."*

- **Causa raiz já localizada:** `applyCheckoutInsuranceMarking()` (`src/lib/actions/insurance-checkout.ts:215-249`) apenas marca `invoice_items` (`insurance_status='aguardando_repasse'`, `coparticipation_value`, `expected_value`) — **não recalcula o total** que o `CheckoutModal` (`src/components/reception/CheckoutModal.tsx`) passa como `totalDue` para o `PaymentMethodModal`. O caixa segue cobrando o valor cheio.
- **Correção proposta:**
  1. Após `onApplyInsurance`, o `CheckoutModal` recalcula: `total_a_cobrar = Σ coparticipation_value (itens cobertos) + Σ total_price (itens não cobertos) − desconto`.
  2. O valor de repasse (`expected_value`) permanece como pendência `financial_entries` `source='petlove'` aguardando importação da planilha (fluxo já existente da Conciliação Petlove).
  3. Garantir simetria: "Remover cobertura" volta o total para o particular cheio.
- **Critério de aceite:** consulta com copart 30,21 / repasse 45,54 → aplicar cobertura → `PaymentMethodModal` abre com `totalDue=30,21`; pendência de 45,54 fica "Aguardando Petlove" no financeiro; remover cobertura volta para 75,75.
- **Teste:** E2E checkout convênio (aplicar/remover cobertura) + unit test do recálculo.
- **Estimativa:** 0,5–1 dia.

### B3 — Serviço "Consulta" duplicado no catálogo
**Evidência (~13:57 e ~36:00):** *"na verdade, eu tenho duplicada a minha consulta. Não sei nem o porquê"* / *"Rapaz agora que eu vi eu tava com a consulta duplicada mesmo."*

- **Hipótese principal:** o importador Petlove (`src/lib/actions/petlove-import.ts`) ou o seed de serviços cria `stock_items` duplicado quando o nome difere por caixa/acentuação/espaços (a unique é `(clinic_id, name)` exata).
- **Tarefas:**
  1. Script de diagnóstico: listar `stock_items` com nome normalizado duplicado por clínica (`scripts/`, padrão dos scripts petlove existentes).
  2. Corrigir a origem (normalizar nome antes do upsert no importador + comparação case/accent-insensitive).
  3. Script de merge das duplicatas existentes (re-apontar `consultation_services`, `patient_custom_prices`, `invoice_items`, `sale_items` → manter o registro canônico, arquivar o duplicado via `archived_at`).
- **Critério de aceite:** reimportar a planilha da Laís 2× → zero duplicatas novas; catálogo da clínica de teste sem "Consulta Veterinária" duplicada.
- **Estimativa:** 0,5–1 dia.

### B4 — Item lançado como *produto* não pode ser excluído pelo operador
**Evidência (~33:58):** *"até foi o que o Levi pediu que não tava conseguindo excluir porque ele colocou como produto. Aí a gente deixa como serviço."*

- **Investigar:** por que a exclusão de item-produto falha no fluxo onde o Levi tentou (PDV/caixa) — provável RLS/role ou regra de estoque (produto decrementa `stock_items.quantity` e o estorno bloqueia).
- **🔒 Refinamento do PO (04/06):** alinhado com ~01:01:59 (Levi não tem permissão de abrir/fechar caixa, só a Laís) e ~01:02:32/~01:03:13 (Laís: *"o administrador consegue editar depois alguma compra que foi errada, fazer exclusão"*):
  - Operador **só pode excluir itens enquanto a venda estiver aberta/em rascunho** no caixa.
  - Venda fechada OU item com decremento definitivo de estoque → exclusão exige **autorização de admin** (senha/confirmação da Laís) **ou** gera **alerta de correção pendente** para o admin resolver depois.
  - Objetivo: evitar furo de estoque por operadores.
- **Critério de aceite (revisado):** (a) operador (receptionist) remove item de venda aberta/em rascunho, seja produto ou serviço; (b) em venda fechada/estoque decrementado, o botão de exclusão pede credencial de admin ou registra alerta para a Laís corrigir; (c) toda exclusão pós-fechamento é auditada (quem, quando, motivo).
- **Estimativa:** 0,5–1 dia (timebox de investigação; se for redesign de estorno, vira item de backlog).

---

## 3. Épico A (P1) — Juros/Taxa sobre Coparticipação Petlove

### Regra de negócio consolidada na reunião (decisão final, após idas e vindas)
1. O percentual de juros é cadastrado **no serviço**, junto do preço convênio — **NÃO** vinculado ao cadastro de cartões (~55:25: *"se a gente fizesse daquela forma de cada cartão, parcela e tal não ia ter como acrescentar mais esses 6%... se tiver só um percentual automático [no serviço] aí beleza"*).
2. O percentual é **único e livre** (a Laís embute taxa da maquininha + 6% de imposto; hoje pratica ~10%: "2,50 a cada 25 reais").
3. Juros incidem **apenas sobre a coparticipação** (~51:27: *"o juros é só cobrado da coparticipação, né?"* — confirmado). O repasse Petlove **nunca** leva juros.
4. Juros aplicados **somente quando a forma de pagamento é cartão** (crédito OU débito, qualquer cartão). Dinheiro/PIX: sem juros (~37:36: *"Ou dinheiro não tem taxa"*; ~38:52: *"sendo pagamento no cartão independente da forma... a gente tem essa cobrança"*).
5. Itens **particulares** na mesma fatura (ex.: exame fora da cobertura) **não** levam juros (~33:15: *"eu só cobro referente a coparticipação da consulta... senão eu cobro juros dobrado"*).
6. O `fee_percent` do cadastro de cartões (`clinic_payment_cards`) continua existindo **somente** para conciliação de recebíveis (`card_installments`) — são conceitos separados (~55:41: *"aquele percentual que tem dentro do cadastro cartão é só para ele debitar depois do quanto realmente a administradora vai te repassar"*).

### A1 — Migration: campo de juros no serviço
```sql
-- 02XX_insurance_copay_interest.sql (aditiva, IF NOT EXISTS)
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS insurance_card_interest_percent NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (insurance_card_interest_percent >= 0 AND insurance_card_interest_percent <= 100);

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS coparticipation_interest NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE consultation_services
  ADD COLUMN IF NOT EXISTS interest_snapshot NUMERIC(10,2);
```
- Aplicar no Supabase remoto imediatamente após criar (regra de memória do projeto).
- **Estimativa:** 0,25 dia.

### A2 — UI Cadastro de Serviços
- Em Gestão > Serviços (onde está `default_insurance_price` / migration 0215): adicionar campo **"% de taxa sobre coparticipação (cartão)"** logo abaixo do preço convênio, com hint: *"Aplicado automaticamente quando o tutor pagar a coparticipação no cartão. Inclua aqui taxa da maquininha + impostos."*
- **Estimativa:** 0,25 dia.

### A3 — Cálculo no recebimento (Caixa)
- No `PaymentMethodModal` (`src/components/payments/PaymentMethodModal.tsx`), quando o split escolhido for `credit`/`debit` **e** a fatura tiver itens com cobertura aplicada (`insurance_status='aguardando_repasse'`):
  - `juros = Σ ROUND(coparticipation_value × interest_percent/100, 2)` por item coberto.
  - Exibir bloco: `Coparticipação: R$ 30,21` + `Taxa (cartão): R$ 10,00` + **`Total: R$ 40,21`** + **campo Desconto** (valor ou %) — pedido explícito (~30:48): *"exibir o valor, o valor de juros e o campo de desconto após eu informar a forma de pagamento"*.
  - Se o usuário trocar para dinheiro/PIX, o bloco de juros zera na hora.
- O desconto serve para o cenário "cliente particular, tiro a taxa manualmente" e arredondamentos.
- **✅ Q1 DECIDIDO (PO, 04/06):** split misto → juros **proporcional ao valor passado no cartão selecionado**. Ex.: copart 30,21 paga metade no cartão e metade em dinheiro → juros incidem apenas sobre os 15,10 do cartão. Cada split de cartão calcula seu próprio juros.
- **🔍 Refinamento do PO (04/06) — clareza absoluta do cálculo na UI:** o Levi faz a conta de cabeça (~29:29: *"R$ 2,50 a cada R$ 25"* = 10% redondo: maquininha + 6% de imposto embutidos). A UI do `PaymentMethodModal` deve exibir o cálculo de forma que ele reconheça de bate-olho, no formato:
  > **Coparticipação Petlove: R$ 30,21 (+ R$ 3,02 Taxa Adm Cartão)**
  - Exibir o **percentual aplicado ao lado do valor** (ex.: `Taxa Adm Cartão (10%)`) para o arredondamento ser verificável mentalmente. Se o sistema mostrar um número que ele não consiga reproduzir de cabeça, ele desconfia do software — **transparência do cálculo é requisito de aceite**, não nice-to-have.
- **Estimativa:** 1–1,5 dia.

### A4 — Registro contábil separado
- No `rpc_record_split_payment` (migration 0192) ou wrapper: registrar a parcela de juros separada da coparticipação:
  - `central_cashier`: 1 lançamento com amount = copay + juros (o que entrou no caixa).
  - `financial_entries`: usar o campo `interest` já existente (migration 0131) no entry do recebimento, ou entry separada `category='Taxa coparticipação convênio'` — **decisão técnica: campo `interest` no mesmo entry** (menos ruído na conciliação).
  - `consultation_services.interest_snapshot` e `invoice_items.coparticipation_interest` gravados para auditoria.
- O repasse pendente (`source='petlove'`) **não muda** — matching da planilha continua batendo no valor de repasse puro.
- **Estimativa:** 1 dia.

### A5 — Exibição para o cliente (recibo)
- Recibo/relatório do tutor: mostrar itens + **uma linha "Taxa administrativa"** com o valor (✅ Q6 decidido pelo PO, 04/06; sem breakdown administrativo) — Laís pediu que apareça para o Levi justificar ao cliente (~59:05): *"pode ter um valor mostrando que é de taxa de juros... só para ele saber falar isso"*.
- Breakdown completo (copay/repasse/juros) fica restrito às telas administrativas.
- **Estimativa:** 0,5 dia.

**Total Épico A: ~3,5–4 dias.**

---

## 4. Épico B (P1) — Unificação PDV → Caixa

### Decisões da reunião
- Replicar o padrão da unificação triagem→consultório: **desativar o módulo `sales` via `clinics.active_modules`** e absorver a venda avulsa no Caixa (~05:54).
- Venda avulsa entra **na aba Recebimentos** do caixa, não na Visão Geral (~01:01:31: *"Aqui nessa tela a gente não mexe muito... é no PDV mesmo, nos recebimentos"*).
- **Manter a aba Visão Geral** — Levi usa para conferir erros (~01:02:32).
- Permissões de abrir/fechar caixa ficam como estão por ora (~01:03:13: "se precisar depois a gente mexe") → vai para backlog (E5).

### C1 — Inserir itens dentro do recebimento de uma consulta
- No `CheckoutModal` (reception): botão **"+ Adicionar item"** → busca de produto/serviço (reutilizar `ProductSearch`/`PackagePDVSearch` de `src/components/sales/`) → adiciona `invoice_items` avulsos à fatura antes do pagamento.
- Itens avulsos adicionados aqui são **sempre particulares** (sem cobertura, sem juros — regra A.5).
- Estoque: item-produto decrementa `stock_items.quantity` na confirmação (reusar lógica do `rpc_create_sale`).
- **Estimativa:** 1,5 dia.

### C2 — Venda avulsa standalone na aba Recebimentos
- Em `CashierTabReceivables` (`src/components/cashier/`): bloco de lançamento avulso **no topo da página** (✅ Q4) → busca de tutor **opcional** (✅ Q2: sem tutor registra como "Consumidor avulso") + carrinho + `PaymentMethodModal`.
- Persistência: manter tabelas `sales`/`sale_items` (histórico preservado) via `createSale()` (`src/lib/actions/sales.ts`) — só muda o ponto de entrada da UI.
- **Estimativa:** 1 dia.

### C3 — Recebimento múltiplo (multi-select por tutor)
**Evidência (~01:00:07):** receber consulta + venda avulsa + atendimentos de outro pet do mesmo tutor **em um único pagamento**.
- Em `CashierTabReceivables`: checkbox por card pendente (invoices + grooming + vendas pendentes); ao selecionar ≥2, botão "Receber selecionados (R$ X)".
- Implementação: um único `PaymentMethodModal` com `totalDue = Σ`; na confirmação, transação RPC nova `rpc_record_multi_invoice_payment`.
- **✅ Q3 DECIDIDO (PO, 04/06):**
  - Caso típico: pendências do **mesmo tutor**. Tutores diferentes são **permitidos com aviso**: *"Tutores diferentes selecionados, deseja realizar o recebimento agrupado mesmo assim?"* (confirm dialog antes de abrir o modal de pagamento).
  - **Financeiro (Contas a Receber): lançamentos SEPARADOS por fatura/atendimento** — o agrupamento é só do ato de receber (um pagamento na maquininha), mas cada invoice gera seus próprios `financial_entries`/`invoice_payment_splits` para rastreabilidade de documentos e atendimentos.
- Mistura convênio+particular permitida (cada fatura mantém seu cálculo de copay/juros).
- **Estimativa:** 2 dias.

### C4 — Despoluir a tela de recebimento (modo operador vs admin)
**Evidência (~58:22–59:47):** Levi não precisa ver repasse/dados de convênio; precisa ver **itens, valor a cobrar e linha de taxa**. Dados do convênio ("caixa inteligente") ficam para conferência da Laís.
- `CheckoutModal`/`CheckoutInsurancePreviewClient`: visão compacta por padrão (itens + total + taxa); seção "Dados do convênio" colapsada/visível apenas para roles `admin|owner|manager`.
- **Estimativa:** 0,5–1 dia.

### C5 — Unificação PDV→Caixa como configuração (padrão Fluxo Contínuo)
- **✅ Q4 DECIDIDO (PO, 04/06):** funciona como o **Fluxo Contínuo** existente em **Gestão > Configurações > Acesso > Fluxo Contínuo** — adicionar opção para selecionar o **PDV** a ser unificado com o Caixa.
- Comportamento quando a configuração está **ativa** + módulo PDV **desativado**:
  - O módulo PDV separado deixa de ser exibido (menu + `/dashboard/sales` → `redirect('/dashboard/cashier')`).
  - O lançamento avulso de itens passa a ser exibido **no topo da página Caixa > Recebimentos** (busca tutor/produto + carrinho — itens C1/C2).
- Quando a configuração está inativa: PDV continua funcionando como hoje (zero impacto nas demais clínicas).
- Implementação: estender o mecanismo de settings do Fluxo Contínuo (mesma tabela/estrutura usada na unificação triagem→consultório) com a opção `pdv_unified_with_cashier`.
- **Estimativa:** 0,5 dia (subiu de 0,25 por reaproveitar o padrão de configuração em vez de só mexer em `active_modules`).

### C6 — Aba Recebimentos como lista unificada
- Hoje invoices e grooming são listas separadas; com C2/C3, unificar em lista única ordenada por criação, com badge de origem (Consulta / Banho&Tosa / Venda) e agrupamento visual por tutor.
- **👁️ Refinamento do PO (04/06) — Visão Geral preservada para o operador:** pedido explícito do Levi (~01:02:32: *"o visão geral pode manter para eu ter uma noção se tá tudo nos conformes... eu olho no visão geral e sei o que posso mandar a Laís corrigir"*).
  - A aba **Visão Geral permanece acessível em modo leitura** para o operador (receptionist), mesmo sem permissão de editar totais, reabrir caixa ou excluir lançamentos.
  - Ela é o "gerenciador de erros próprios" do Levi antes de passar o bastão para a Laís — nenhuma refatoração de C4/C5/C6 pode remover ou restringir a **leitura** dessa tela para o operador.
- **Estimativa:** 1 dia.

**Total Épico B: ~6–7 dias.**

---

## 5. Épico C (P1) — Data de Adesão/Microchipagem editável

**Evidência (~16:51–18:56):** Laís consulta a data de adesão real no portal Petlove e precisa corrigi-la no sistema (cliente que compra o plano mas só microchipa meses depois — carência conta da microchipagem). Decisão de UX: **manter o microchip na aba Paciente** (acesso rápido), tornando a **data** editável.

### D1 — Expor `enrollment_date` editável
- Estado atual: `pet_insurance.enrollment_date` existe (migration 0176) mas **não tem UI**; `resolveEnrollmentDate()` (`src/lib/actions/insurance-coverage.ts:96-129`) já prioriza esse campo → **só falta a UI**.
- Adicionar em `PatientFullModal.tsx`:
  - **Aba Paciente**, ao lado de `microchip_id`: campo **"Data de microchipagem/adesão"** (date input) → grava `pet_insurance.enrollment_date` via `upsertPetInsurance()`.
  - **Aba Convênio**: exibir a mesma data (read-only ou editável espelhado) + a data de adesão efetiva calculada e a origem (manual / 1ª remessa / cadastro) — transparência do fallback.
- Recalcular semáforo de carência (`InsuranceCard.tsx`) imediatamente após edição.
- **Estimativa:** 0,75 dia.

### D2 — Microchipagem registrada no fluxo express atualiza adesão
- Validar que o fluxo de microchipagem express (memória do projeto: visit_reason + early-return) já grava a data que alimenta `resolveEnrollmentDate`; se grava só `microchip_id` sem data, passar a gravar `enrollment_date = data do procedimento`.
- **Estimativa:** 0,25 dia.

**Total Épico C: ~1 dia.**

---

## 6. Backlog / Roadmap (não entram nesta sprint — validar com PO)

| ID | Item | Evidência | Nota |
|---|---|---|---|
| E1 | **Parser do PDF de tabela de preços Petlove** (anual) → popular `default_insurance_price` em massa | ~10:15 *"PDF é um pouco mais delicado... vou pedir para a equipe verificar"* | Spike técnico 1 dia (pdf→texto estruturado). Volume baixo ("são poucos valores") — alternativa: tela de digitação assistida. |
| E2 | **Conciliação de cartões com extrato PagBank** (import + matching por NSU/valor/data/parcela) | ~46:33 | Base já existe (`card_installments`, `requires_nsu`, `rpc_settle_card_installment`). Falta importador de extrato + tela de matching. Épico próprio. |
| E3 | **Conciliação bancária** (extrato Banco do Brasil) | ~47:25 | Épico próprio, depende de E2. |
| E4 | **Módulo Orçamento** | ~06:20 e ~57:36 — adiado pelo próprio Djhames para levantamento dedicado | Aguardar reunião específica. |
| E5 | **Permissões granulares do caixa** (funcionário abre/fecha; admin edita/exclui/confere) | ~01:02:49–01:03:13 — "se precisar depois a gente mexe" | Hoje: abrir/fechar = admin/owner/manager (`cashier-sessions.ts:83-180`). |
| E6 | **Tarefa operacional (não-dev):** cadastrar os cartões/taxas da clínica da Laís (ela envia os dados, equipe cadastra) | ~49:30 | Onboarding/CS. |

---

## 7. Ordem de Execução Proposta

```
Fase 0 — Reprodução & diagnóstico (0,5 dia)
  └─ Reproduzir B1/B2/B3/B4 na clínica de teste com a planilha da Laís

Fase 1 — Bugs P0 (2–3 dias)               ← destrava a confiança do cliente
  ├─ B2 (causa já conhecida — quick win)
  ├─ B1
  ├─ B3 (fix + script de merge)
  └─ B4 (timebox)

Fase 2 — Épico C: Adesão editável (1 dia)  ← pequeno, prometido na reunião
  └─ D1 → D2

Fase 3 — Épico A: Juros Petlove (3,5–4 dias)
  └─ A1 (migration) → A2 → A3 → A4 → A5

Fase 4 — Épico B: Caixa unificado (6–7 dias)
  └─ C1 → C2 → C6 → C3 → C4 → C5 (desativação por último)

Fase 5 — QA & entrega (1,5 dia)
  ├─ E2E: checkout convênio (cobertura/juros/desconto), venda avulsa no caixa,
  │   multi-recebimento, carência pós-edição de adesão
  ├─ Regressão: importação planilha aberta/fechada (matching não pode quebrar com B3)
  ├─ pytest + jest + playwright suites existentes
  └─ Validação com a Laís/Levi em ambiente real (ela pediu: "tenho que testar na rotina")
```

**Estimativa total da sprint: ~14–17 dias úteis de dev** (1 dev). Com paralelização (bugs + épico C por um dev, épicos A/B por outro): ~9–11 dias corridos.

---

## 8. Perguntas Abertas para o PO (responder antes de iniciar)

| # | Pergunta | Status / Decisão |
|---|---|---|
| Q1 | Split misto (cartão + dinheiro): juros proporcional ao valor no cartão ou cheio? | ✅ **Proporcional ao valor passado no cartão selecionado** (PO, 04/06) |
| Q2 | Venda avulsa no caixa exige tutor ou aceita "consumidor avulso"? | ✅ **Tutor opcional** — sem tutor registra como "Consumidor avulso" (PO, 04/06) |
| Q3 | Multi-recebimento: regras de agrupamento e lançamento? | ✅ **Mesmo tutor por padrão; tutores diferentes com aviso de confirmação; Contas a Receber sempre separado por fatura** (PO, 04/06) |
| Q4 | Como desativar o PDV? | ✅ **Configuração estilo Fluxo Contínuo (Gestão > Configurações > Acesso); venda avulsa no topo de Caixa > Recebimentos** (PO, 04/06) |
| Q5 | Juros: arredondamento por item ou sobre o total da coparticipação? | ✅ **Por item** — ROUND(copart × %, 2) por item coberto, auditável linha a linha (PO, 04/06) |
| Q6 | Recibo do tutor: rótulo da linha de juros? | ✅ **"Taxa administrativa"** (PO, 04/06) |

---

## 9. Riscos

1. **B3 (merge de duplicatas)** mexe em FKs de 4+ tabelas — rodar script em transação com dry-run primeiro (padrão dos scripts petlove-merge existentes).
2. **C3 (multi-recebimento)** toca o coração financeiro (invoices + splits + central_cashier + financial_entries + card_installments) — RPC transacional obrigatória, sem orquestração no client.
3. **Matching da planilha Petlove** depende do valor de repasse puro — A4 não pode contaminar `expected_value` com juros, senão a conciliação mensal quebra silenciosamente. Teste de regressão obrigatório.
4. **Desativar PDV (C5)** antes de C1/C2 estarem estáveis deixaria a clínica sem venda avulsa — por isso é o último passo da Fase 4.
5. Migrations apenas aditivas com `IF NOT EXISTS` (regra do projeto); aplicar no remoto na sequência.

---

## 10. Critérios de Aceite Globais (Definition of Done)

- [ ] Todos os P0 reproduzidos, corrigidos e cobertos por teste E2E.
- [ ] Fluxo demo da reunião re-executável sem erro: importar planilha → check-in → consulta (preço convênio correto) → aplicar cobertura (total = copart) → receber no cartão (copart + taxa, com campo desconto) → pendência de repasse aguardando Petlove.
- [ ] Venda avulsa 100% operável pelo Caixa com PDV desativado na clínica piloto.
- [ ] Data de adesão editável e carências recalculadas em tempo real.
- [ ] Suites jest/pytest/playwright verdes.
- [ ] Validação em call com Laís/Levi na clínica piloto antes do rollout geral.
