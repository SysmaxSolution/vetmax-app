# Plano de Auditoria e Correção — Tours do MENTOR IA

**Gerado:** 2026-05-10  
**Escopo:** 9 tours · 34 passos analisados  
**Objetivo:** Garantir que cada passo aponte para um elemento clicável real, com instrução de ação concreta, e que pré-requisitos de UI sejam executados antes de referenciar elementos dentro de modais/drawers.

---

## Diagnóstico Geral

| # | Problema recorrente | Impacto |
|---|---------------------|---------|
| P1 | Texto informativo sem verbo de ação ("aparece aqui", "este campo") | Usuário não sabe o que fazer |
| P2 | `waitForNext: true` aponta para elemento já no DOM → tour avança imediatamente | Step visível por milissegundos |
| P3 | Steps em modal/drawer sem passo de "abrir modal" antes | Balão flutuando sem highlight |
| P4 | Botão "Chamar Triagem →" mencionado no texto mas sem `data-mentor-step` | Impossível destacar o elemento |
| P5 | `reception-checkin-btn` nunca referenciado em nenhum tour | Etapa crítica ignorada |
| P6 | Tour `triagem`: `waitForNext` no passo da fila aponta para `triage-add-btn` (já no DOM) | Bug de avanço imediato |

---

## Auditoria Rota a Rota

---

### Tour `recepcao` — `/dashboard/reception`

**Estado atual (3 passos):**  
1. `reception-search-input` — informativo, sem `waitForNext`
2. `reception-new-btn` — fora do fluxo principal
3. `reception-queue` — informativo, menciona "Chamar Triagem" sem destacar

**Problemas:**
- P1: nenhum passo instrui uma ação concreta
- P4+P5: `reception-checkin-btn` existe no DOM (condicional) mas nunca é mencionado como step
- Fluxo real: busca → seleciona pet → check-in → fila → chama triagem

**Correção (4 passos):**
1. `reception-search-input` + `waitForNext: true` → aguarda `reception-checkin-btn` aparecer após seleção do pet
2. `reception-checkin-btn` → "Clique em Check-in para registrar a chegada"
3. `reception-queue` → "O pet entrou na fila. Clique em Chamar Triagem →"
4. `reception-new-btn` (último, informativo) → "Tutor não encontrado? Clique aqui"

---

### Tour `sala-espera` — `/dashboard/reception`

**Estado atual (2 passos):**
1. `reception-queue` — OK
2. `reception-new-btn` — fora do fluxo (deveria mostrar ação na fila)

**Problemas:**
- P1+P4: menciona "Clique em Chamar Triagem →" no body mas sem step apontando para o botão
- Botão "Chamar Triagem →" em `QueueCard` (linha 293-299 ReceptionWorkspace) não tem `data-mentor-step`

**Ação necessária antes de corrigir:**  
Adicionar `data-mentor-step="reception-call-triage-btn"` ao botão "Chamar Triagem →" em `ReceptionWorkspace.tsx`.

**Correção (3 passos):**
1. `reception-queue` — mostra a fila
2. `reception-call-triage-btn` (novo) — "Clique aqui para encaminhar ao auxiliar"
3. `reception-new-btn` — informativo final

---

### Tour `triagem` — `/dashboard/triage`

**Estado atual (4 passos):**
1. `nurse-queue` + `waitForNext: true` → próximo alvo: `triage-add-btn` (já no DOM) → **BUG P2**
2. `triage-add-btn` — no listing
3. `triage-voice-btn` — dentro do TriageForm (modal)
4. `triage-save-btn` — dentro do TriageForm (modal)

**Problemas:**
- P2 crítico: `waitForNext` avança imediatamente porque `triage-add-btn` já existe no DOM
- P3: passos 3-4 dependem do TriageForm aberto, sem passo de "clique em um pet" com `waitForNext`
- Inconsistência de contexto: passos 1-2 são no listing, passos 3-4 no formulário

**Correção (4 passos reordenados):**
1. `triage-add-btn` — informativo, sem `waitForNext`
2. `nurse-queue` + `waitForNext: true` → aguarda `triage-voice-btn` (dentro do TriageForm, não está no DOM antes de clicar)
3. `triage-voice-btn` — dentro do TriageForm aberto
4. `triage-save-btn` — conclui a triagem

---

### Tour `consulta` — `/dashboard/vet`

**Estado atual (3 passos):**
1. `vet-queue` + `waitForNext: true` → próximo: `vet-notes-textarea` (ConsultationDetail)
2. `vet-notes-textarea` + `autoAdvance: true`
3. `vet-save-notes-btn`

**Problemas:**
- P1: step 0 diz "Clique no nome do pet" mas sem ênfase de que é necessário clicar
- `waitForNext` está correto (textarea não existe antes de abrir prontuário)

**Correção:** Estrutura mantida, apenas melhoria de texto no body de cada step.

---

### Tour `exames` — `/dashboard/exams`

**Estado atual (3 passos):**
1. `exams-queue` — informativo, sem `waitForNext`
2. `exams-request-btn` — fora do fluxo principal
3. `exams-result-textarea` — dentro de modal (nunca no DOM sem ação anterior)

**Problemas:**
- P3: `exams-result-textarea` está dentro de modal `{resultModalId && (...)}` — precisa de passo anterior com `waitForNext`
- P1: step 1 diz "Clique em um card" mas `exams-queue` não tem `waitForNext`
- Ordem errada: "Solicitar Exame" deveria ser mostrado primeiro

**Correção (3 passos reordenados):**
1. `exams-request-btn` — primeiro (informativo sobre solicitação avulsa)
2. `exams-queue` + `waitForNext: true` → aguarda `exams-result-textarea` (aparece ao clicar "Registrar Resultado")
3. `exams-result-textarea` + `autoAdvance: true`

---

### Tour `internacao` — `/dashboard/hospitalization`

**Estado atual (2 passos):**
1. `hospitalization-list` — OK
2. `hosp-discharge-btn` — condicional (`card.status === 'ready_for_discharge'`), pode não aparecer

**Problemas:**
- P3: `hosp-save-evolution-btn` (modal do card) nunca é ensinado
- P1: sem instrução para clicar em um card para acessar o prontuário de internação
- `hosp-discharge-btn` é útil mas raramente visível em ambiente de teste

**Correção (3 passos):**
1. `hospitalization-list` + `waitForNext: true` → aguarda `hosp-save-evolution-btn` (aparece ao abrir detail modal)
2. `hosp-save-evolution-btn` — "Registre a evolução diária do internado"
3. `hosp-discharge-btn` — `mustExist: false` (condicional ao status do pet)

---

### Tour `grooming` — `/dashboard/grooming`

**Estado atual (2 passos):**
1. `grooming-queue` — sem `waitForNext`
2. `grooming-voice-btn` — dentro de `GroomingDetailModal` (não está no DOM antes de abrir card)

**Problemas:**
- P3 crítico: `grooming-voice-btn` está dentro do `GroomingDetailModal.tsx` — sem abertura prévia do modal
- Faltam: `grooming-observations-textarea` e `grooming-save-record-btn` (ambos com `data-mentor-step`)

**Correção (4 passos):**
1. `grooming-queue` + `waitForNext: true` → aguarda `grooming-voice-btn` (dentro do modal aberto ao clicar no card)
2. `grooming-voice-btn`
3. `grooming-observations-textarea` + `autoAdvance: true`
4. `grooming-save-record-btn`

---

### Tour `alta` — `/dashboard/reception`

**Estado atual (3 passos):**
1. `reception-kanban-toggle` + `waitForNext: true` → aguarda `kanban-board` ✓
2. `kanban-board`
3. `kanban-col-completed`

**Observação:** Existe `kanban-board` em dois componentes (`KanbanBoard.tsx` para management e `AgendaKanban.tsx` para reception). O tour usa `requiredPath: '/dashboard/reception'`, portanto o correto é `AgendaKanban`. Sem conflito funcional pois o componente de management não aparece nesta rota.

**Correção:** Estrutura mantida, melhoria de textos.

---

### Tour `cadastro-pet` — `/dashboard/patients`

**Estado atual (9 passos):**
Completo. `FieldInput` e `FieldSelect` propagam `data-mentor-step` via `{...props}` / `{...(props as ...)}`.

**Problemas menores:**
- P1: alguns bodies são puramente informativos ("Este é o campo principal de identificação")

**Correção:** Melhoria de textos para incluir verbo de ação; estrutura mantida.

---

## Plano de Implementação

### Passo 1 — Novo atributo DOM
**Arquivo:** `src/components/reception/ReceptionWorkspace.tsx`  
**Ação:** Adicionar `data-mentor-step="reception-call-triage-btn"` ao botão "Chamar Triagem →" em `QueueCard` (linha ~293).

### Passo 2 — Correção dos tours
**Arquivo:** `src/components/mentor/MentorContext.tsx`  
**Ação:** Reescrever os 9 tours conforme diagnóstico acima.

### Passo 3 — Testes Playwright
**Arquivo:** `tests/e2e/mentor-tour-audit.spec.ts`  
**Ação:** Atualizar definições de tours espelho + adicionar testes de:
- Verificação de `data-mentor-step` no DOM para cada `mustExist: true`
- Validação de fluxo completo com `waitForNext` (click → elemento aparece → tour avança)
- Teste de recalculo automático (se elemento ausente, tour deve aguardar ação prévia)

---

## Atributos `data-mentor-step` — Inventário Final

| Atributo | Componente | Status Tour |
|----------|-----------|-------------|
| `reception-search-input` | ReceptionWorkspace | recepcao step 0 |
| `reception-checkin-btn` | ReceptionWorkspace | recepcao step 1 (**novo no tour**) |
| `reception-call-triage-btn` | ReceptionWorkspace QueueCard | sala-espera step 1 (**novo atributo DOM + tour**) |
| `reception-queue` | ReceptionWorkspace | recepcao/sala-espera |
| `reception-new-btn` | ReceptionWorkspace | recepcao/sala-espera |
| `reception-kanban-toggle` | ReceptionWorkspace | alta step 0 |
| `kanban-board` | AgendaKanban | alta step 1 |
| `kanban-col-completed` | AgendaKanban | alta step 2 |
| `triage-add-btn` | NurseWorkspace | triagem step 0 (**reordenado**) |
| `nurse-queue` | NurseWorkspace | triagem step 1 (**waitForNext corrigido**) |
| `triage-voice-btn` | TriageForm | triagem step 2 |
| `triage-save-btn` | TriageForm | triagem step 3 |
| `vet-queue` | VetWorkspace | consulta step 0 |
| `vet-notes-textarea` | ConsultationDetail | consulta step 1 |
| `vet-save-notes-btn` | ConsultationDetail | consulta step 2 |
| `exams-request-btn` | ExamsWorkspace | exames step 0 (**reordenado**) |
| `exams-queue` | ExamsWorkspace | exames step 1 (**waitForNext adicionado**) |
| `exams-result-textarea` | ExamsWorkspace (modal) | exames step 2 |
| `hospitalization-list` | HospitalizationKanban | internacao step 0 (**waitForNext adicionado**) |
| `hosp-save-evolution-btn` | HospitalizationDetailModal | internacao step 1 (**novo no tour**) |
| `hosp-discharge-btn` | HospitalizationKanban | internacao step 2 |
| `grooming-queue` | GroomingKanban | grooming step 0 (**waitForNext adicionado**) |
| `grooming-voice-btn` | GroomingDetailModal | grooming step 1 |
| `grooming-observations-textarea` | GroomingDetailModal | grooming step 2 (**novo no tour**) |
| `grooming-save-record-btn` | GroomingDetailModal | grooming step 3 (**novo no tour**) |
| `btn-novo-paciente` | PatientsWorkspace | cadastro-pet step 0 |
| `pet-name-input` | PatientFullModal | cadastro-pet step 1 |
| `pet-species-select` | PatientFullModal | cadastro-pet step 2 |
| `pet-breed-input` | PatientFullModal | cadastro-pet step 3 |
| `pet-reproductive-select` | PatientFullModal | cadastro-pet step 4 |
| `pet-behavior-tags` | PatientFullModal | cadastro-pet step 5 |
| `pet-allergies` | PatientFullModal | cadastro-pet step 6 |
| `pet-chronic-diseases` | PatientFullModal | cadastro-pet step 7 |
| `pet-microchip` | PatientFullModal | cadastro-pet step 8 |
