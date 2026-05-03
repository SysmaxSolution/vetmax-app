# Backlog de Funcionalidades — Testes E2E com Skip Gracioso

Gerado em: 2026-04-24  
Suite: 47 passando | **21 skipped** | 0 falhando

Cada item abaixo corresponde a um `test.skip()` ativo no suite E2E.  
Quando a funcionalidade for implementada na UI, o teste passará automaticamente.

---

## Módulo: Triagem (`triage-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-TRG-01 | Botão "Novo Paciente / Adicionar / Registrar" na página `/dashboard/triage` | `triage-module.spec.ts:63` |
| TC-TRG-02 | Paciente Rex deve aparecer na fila de triagem após seed (card/row clicável) | `triage-module.spec.ts:147` |
| TC-TRG-02 | Formulário de sinais vitais (peso, temperatura) na ficha de triagem | `triage-module.spec.ts:181` |
| TC-TRG-03 | Paciente Rex não aparece na fila para concluir triagem | `triage-module.spec.ts:245` |
| TC-TRG-03 | Botão "Concluir Triagem / Encaminhar / Enviar ao Consultório" | `triage-module.spec.ts:254` |

**O que o teste espera (critérios de aceite):**
- `triage_records` com `status='waiting'` deve renderizar card na `/dashboard/triage`
- Clicar no card abre ficha com `<label>Peso</label>` e `<label>Temperatura</label>`
- Botão concluir muda `triage_records.status` → `'completed'` ou `'forwarded'`

---

## Módulo: Consultório (`vet-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-VET-01 | `consultations` com `status='in_progress'` não renderiza card em `/dashboard/vet` | `vet-module.spec.ts:79` |
| TC-VET-01 | Botão "Salvar / Atualizar" na ficha do Consultório após preencher anamnese | `vet-module.spec.ts:100` |
| TC-VET-01 | Campo de anamnese não encontrado na ficha do Consultório | `vet-module.spec.ts:117` |
| TC-VET-02 | Rex não aparece no módulo Consultório (TC-VET-02) | `vet-module.spec.ts:147` |
| TC-VET-02 | Aba ou botão "Prescrição / Receita" na ficha do Consultório | `vet-module.spec.ts:186` |
| TC-VET-03 | Rex não aparece no módulo Consultório (TC-VET-03) | `vet-module.spec.ts:212` |
| TC-VET-03 | Botão "Concluir Consulta / Finalizar Atendimento / Encerrar" | `vet-module.spec.ts:221` |

**O que o teste espera:**
- `consultations` com `status='in_progress'` deve renderizar card/linha em `/dashboard/vet`
- Clicar navega para `/dashboard/vet/[id]` com campos: anamnese, prescrição, botão concluir
- Concluir muda `consultations.status` → `'completed'` ou `'done'`

---

## Módulo: Farmácia (`pharmacy-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-FAR-01 | Botão "Novo Item / Adicionar Medicamento" em `/dashboard/pharmacy` | `pharmacy-module.spec.ts:83` |
| TC-FAR-01 | Modal de cadastro de item de estoque | `pharmacy-module.spec.ts:91` |
| TC-FAR-02 | Item seedado não aparece na lista de estoque da Farmácia | `pharmacy-module.spec.ts:150` |
| TC-FAR-02 | Botão "Dispensar" não encontrado no Módulo Farmácia | `pharmacy-module.spec.ts:180` |
| TC-FAR-03 | Painel de alertas de estoque baixo não encontrado | `pharmacy-module.spec.ts:214` |
| TC-FAR-03 | Item com `quantity < min_quantity` não aparece no painel de alertas | `pharmacy-module.spec.ts:221` |

**O que o teste espera:**
- Lista de `stock_items` da clínica renderizada em tabela/cards
- Botão "Dispensar" abre modal com campo de quantidade; reduz `stock_items.quantity`
- Painel/seção separada lista itens onde `quantity <= min_quantity`

---

## Módulo: Exames (`exams-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-EXM-01 | Botão "Solicitar Exame / Novo Exame" em `/dashboard/exams` | `exams-module.spec.ts:79` |
| TC-EXM-02 | `exam_requests` com `status='in_progress'` não renderiza na lista | `exams-module.spec.ts:142` |
| TC-EXM-02 | Campo "Resultado / Laudo" não encontrado no módulo Exames | `exams-module.spec.ts:173` |

**O que o teste espera:**
- Lista de `exam_requests` pendentes renderizada em `/dashboard/exams`
- Clicar no exame abre ficha com campo de resultado
- Salvar resultado muda `exam_requests.status` → `'completed'`; persiste `result`

---

## Módulo: Internação (`hospitalization-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-INT-01 | Botão "Admitir / Nova Internação" em `/dashboard/hospitalization` | `hospitalization-module.spec.ts:81` |
| TC-INT-02 | Cards de internação com atributo `draggable` no Kanban | `hospitalization-module.spec.ts:156` |
| TC-INT-02 | Drag-and-drop do Kanban não persiste mudança de status no banco | `hospitalization-module.spec.ts:175` |
| TC-INT-03 | Coluna "Pronto para Alta" não encontrada no Kanban | `hospitalization-module.spec.ts:207` |
| TC-INT-03 | Botão de alta não encontrado no módulo Internação | `hospitalization-module.spec.ts:215` |
| TC-INT-04 | Módulo `hospitalization` inativo não redireciona corretamente de `/dashboard/hospitalization` | `hospitalization-module.spec.ts:261` |

**O que o teste espera:**
- Kanban com colunas: `observation` → `stable` → `ready_for_discharge`
- Cards `draggable=true`; drag atualiza `hospitalizations.status` no banco
- Botão "Alta" muda status → `'discharged'`; cria registro em `consultations`

---

## Módulo: Grooming — Checkout (`grooming-checkout.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-FIN-01 | Card de sessão de grooming não encontrado no Kanban (por testid ou texto) | `grooming-checkout.spec.ts:55` |
| TC-FIN-01 | Botão "Checkout / Finalizar / Pagar" no card de grooming | `grooming-checkout.spec.ts:66` |

**O que o teste espera:**
- Sessão com `current_status='waiting_pickup'` renderiza card no Kanban de Grooming
- Botão de checkout registra pagamento: `payment_status='paid'`, cria entrada em `central_cashier`

---

## Módulo: Grooming — Kanban (`grooming-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-GRM-05 | Card de sessão sem `data-testid` adequado no Kanban de Grooming | `grooming-module.spec.ts` (TC-GRM-05) |

---

## Jornadas E2E (`user-flow.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-UF-01 | Aba de horários `[data-testid=tab-horarios]` em `/dashboard/management` | `user-flow.spec.ts:87` |
| TC-UF-01 | Input `[data-testid=close-friday]` para hora de fechamento da sexta | `user-flow.spec.ts:113` |
| TC-UF-01 | Feedback visual após salvar horário | `user-flow.spec.ts:124` |
| TC-UF-01 | Página `/dashboard/grooming/schedule` não implementada | `user-flow.spec.ts:136` |
| TC-UF-03 | Card de sessão com `data-testid` no Kanban de Grooming | `user-flow.spec.ts:281` |
| TC-UF-03 | Botão de checkout no card de grooming | `user-flow.spec.ts:290` |

---

## Governança e Segurança (`governance-security.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-GOV-02 | Toggle de módulo `pharmacy` em `/dashboard/management` | `governance-security.spec.ts:74` |
| TC-GOV-03 | Página de agendamento por slots `/dashboard/grooming/schedule` | `governance-security.spec.ts:121` |
| TC-GOV-04 | Página de agendamento por slots `/dashboard/grooming/schedule` (role guard) | `governance-security.spec.ts:147` |

---

## RLS Multi-tenant (`rls-multitenant.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-RLS-03 | Tabela `triage_records` não existe no banco ainda | `rls-multitenant.spec.ts:179` |
| TC-RLS-05 | Tabela `hospitalizations` não existe no banco ainda | `rls-multitenant.spec.ts:255` |
| TC-RLS-06 | Tabela `exam_requests` não existe no banco ainda | `rls-multitenant.spec.ts:298` |
| TC-RLS-07 | Tabela `stock_items` não existe no banco ainda | `rls-multitenant.spec.ts:342` |

**Ação necessária:** Criar migrations para essas tabelas com RLS `clinic_id`.

---

## Caixa Central (`cashier-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-CAI-04 | Botão `[data-testid=btn-verify-{id}]` de verificação de lançamento | `cashier-module.spec.ts:238` |

**O que o teste espera:**
- Cada linha da tabela de lançamentos tem botão `data-testid="btn-verify-{entryId}"`
- Clicar muda `central_cashier.status` → `'verified'`

---

## Módulo: Pacientes (`patients-module.spec.ts`)

| Test Case | O que falta implementar | Arquivo:Linha |
|-----------|------------------------|---------------|
| TC-PAC-01 | Botão "Novo Paciente / Cadastrar / Adicionar" em `/dashboard/patients` | `patients-module.spec.ts:53` |

---

## Resumo por Prioridade

### Prioridade Alta — Bloqueiam fluxos clínicos core
1. **Triagem** — fila de pacientes + ficha de sinais vitais (TC-TRG-01/02/03)
2. **Consultório** — fila de consultas + anamnese + prescrição + concluir (TC-VET-01/02/03)
3. **Exames** — solicitar + registrar resultado (TC-EXM-01/02)

### Prioridade Média — Completam módulos secundários
4. **Farmácia** — CRUD estoque + dispensar + alertas (TC-FAR-01/02/03)
5. **Internação** — Kanban drag-and-drop + alta (TC-INT-01/02/03)
6. **Grooming** — Checkout com pagamento (TC-FIN-01, TC-UF-03)
7. **Caixa** — Botão verificar lançamento (TC-CAI-04)

### Prioridade Baixa — Configuração e governa
8. **Management** — Aba de horários + toggle de módulos (TC-UF-01, TC-GOV-02)
9. **Agendamento** — Página `/dashboard/grooming/schedule` (TC-GOV-03/04)
10. **Migrations RLS** — `triage_records`, `hospitalizations`, `exam_requests`, `stock_items`
