# Relatorio Playwright completo - 2026-05-17

**Total: 1077 testes**

| Status | Count | % |
|---|---|---|
| Passed | **212** | 19.7% |
| Failed | **89** | 8.3% |
| Skipped | **776** | 72.1% (testInfo.skip migration) |

Duracao: 150 minutos

---

## Falhas por arquivo (89 total)

### `auth-module.spec.ts` (1 falhas)

- **[failed]** L227: Vet não vê configurações administrativas
  - `Error: expect(received).toBe(expected) // Object.is equality |  | Expected: true | Received: false |  |   240 |       || await page.getByText(/acesso negado|não autorizado|forbidden|sem permissão/i).isVisible({ timeout: 2_000 }).catch(() => false) | `

### `cashier-complete.spec.ts` (2 falhas)

- **[timedOut]** L338: TC-CON-04: Fatura some da aba Recebimentos após pagamento via UI
  - `Test timeout of 120000ms exceeded.`
- **[failed]** L770: TC-NAV-04: Kanban Faturamento exibe badge de status de pagamento
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByText(/faturamento/i).first() | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 10000ms |   - waiting for getByTex`

### `cashier-unification.spec.ts` (2 falhas)

- **[timedOut]** L86: Módulo Caixa exibe aba Saídas
  - `Test timeout of 60000ms exceeded.`
- **[failed]** L227: Coluna Faturamento do Kanban exibe badge de pagamento pendente
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByText(/faturamento/i).first() | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 10000ms |   - waiting for getByTex`

### `compliance-lgpd.spec.ts` (5 falhas)

- **[timedOut]** L59: TC-LGPD-01: ConsentModal aparece ao criar novo tutor
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L111: TC-LGPD-02: Sem consentimento não persiste o cadastro
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L227: Após aceitar consentimento, consent_history tem registro "granted"
  - `Test timeout of 60000ms exceeded.`
- **[failed]** L325: TC-VET-VALIDATION-01: CRMV inválido é rejeitado pela UI
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByRole('heading', { name: /equipe ativa/i }) | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 10000ms |   - waitin`
- **[failed]** L373: TC-VET-VALIDATION-02: CRMV válido é aceito na UI
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByRole('heading', { name: /equipe ativa/i }) | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 10000ms |   - waitin`

### `compliance-sprint3.spec.ts` (1 falhas)

- **[failed]** L129: TC-RX-CFMV-01: Campos frequência e duração existem na UI de prescrição
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByRole('heading', { name: /veterinário|consultas|médico/i }).first() | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with time`

### `exams-module.spec.ts` (1 falhas)

- **[failed]** L568: data-mentor-step: exams-request-btn presente; exams-result-textarea no modal
  - `Error: expect(received).toBeGreaterThanOrEqual(expected) |  | Expected: >= 1 | Received:    0 |  |   574 |     const requestBtnStep = await page.locator('[data-mentor-step="exams-request-btn"]').count(); |   575 |     console.log(`TC-EXM-006: exams-r`

### `grooming-checkout.spec.ts` (1 falhas)

- **[failed]** L116: TC-FIN-02: Accountant vê lançamento no caixa; Assistant NÃO vê
  - `TimeoutError: page.goto: Timeout 30000ms exceeded. | Call log: |   - navigating to "http://localhost:4000/dashboard/cashier", waiting until "load" |  |  |   139 | |   140 |     // Acesso direto à rota do caixa deve ser bloqueado | > 141 |     await a`

### `grooming-module.spec.ts` (10 falhas)

- **[timedOut]** L94: Check-in cria sessão e card aparece no Kanban
  - `Test timeout of 120000ms exceeded.`
- **[timedOut]** L163: Agendamento futuro cria sessão com scheduled_at e aparece em "Agendados"
  - `Test timeout of 90000ms exceeded.`
- **[failed]** L298: Drag-and-drop recebido → bathing atualiza status no banco
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('[data-testid^="session-card-"]').first() | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 10000ms |   - wait`
- **[failed]** L475: Aba Catálogo em Gestão exibe opção "Banho e Tosa" no seletor de tipo
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByRole('link', { name: /tabela.*preços|catálogo|catalog/i }).first() | Expected: visible | Timeout: 5000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeo`
- **[timedOut]** L499: Catálogo exibe serviços de Banho e Tosa com badge teal
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L540: Selecionar motivo "Banho e Tosa" no modal redireciona para GroomingCheckinModal
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L630: Botão Banho/Tosa não aparece na Recepção quando módulo inativo
  - `Test timeout of 90000ms exceeded.`
- **[failed]** L669: Card semeado aparece no Kanban de Banho e Tosa
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByText(/rex/i).first() | Expected: visible | Timeout: 12000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 12000ms |   - waiting for getByText(/rex/i`
- **[failed]** L695: Modal expõe data-mentor-step em textarea e botão salvar
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('[data-testid="session-card-cccc1111-0000-0000-0000-000000000001"]') | Expected: visible | Timeout: 12000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with`
- **[failed]** L746: Preencher observações e salvar cria registro em grooming_records
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('[data-testid="grooming-card-cccc1111-0000-0000-0000-000000000001"]').or(getByText('Rex').first()) | Expected: visible | Timeout: 12000ms | Error: element(s) not found |  | Call log: |`

### `hospitalization-module.spec.ts` (1 falhas)

- **[failed]** L148: Drag-and-drop Observação → Enfermaria atualiza status no banco
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByText(/observação/i) | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 10000ms |   - waiting for getByText(/observ`

### `mentor-clinical-flow.spec.ts` (1 falhas)

- **[failed]** L132: 2. Mentor responde "Como atendo na triagem?" e guia tour de Triagem
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('button').filter({ hasText: /iniciar tour.*triagem/i }).last() | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeo`

### `mentor-grooming-flow.spec.ts` (1 falhas)

- **[failed]** L118: 2. Mentor responde a pergunta sobre tosa com tour de grooming
  - `TimeoutError: page.goto: Timeout 30000ms exceeded. | Call log: |   - navigating to "http://localhost:4000/dashboard/grooming", waiting until "load" |  |  |   118 |   test('2. Mentor responde a pergunta sobre tosa com tour de grooming', async ({ page `

### `mentor-module-process.spec.ts` (1 falhas)

- **[failed]** L238: verifica passo 0 (fila) — elementos sem dados de teste são soft-check
  - `Error: triage-add-btn deve estar na DOM |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   242 |     // Passo 0: triage-add-btn sempre existe na página de triagem |   243 |     const count0 = await assertStep(pa`

### `mentor-resilience.spec.ts` (2 falhas)

- **[failed]** L71: 1. Typos: "komo dao entrada no pett?" → Mentor entende como check-in
  - `Error: expect(received).toBeTruthy() |  | Received: "" |  |   82 | |   83 |     const text = await lastMsg.textContent() | > 84 |     expect(text).toBeTruthy() |      |                  ^ |   85 |     console.log(`[QA] Resposta para typo: "${text?.sl`
- **[failed]** L189: 5. Busca com nome parcial do animal: "Cade o Rex" (pode não ter check-in hoje)
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('text=/procurando|encontrei|não encontrei/i').last() | Expected: visible | Timeout: 12000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 12000ms`

### `mentor-tour-audit.spec.ts` (12 falhas)

- **[failed]** L327: step 0: triage-add-btn sempre presente no DOM
  - `Error: [MENTOR-AUDIT] data-mentor-step="triage-add-btn" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Adicionar Pet Manualmente". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |`
- **[failed]** L334: step 1: nurse-queue presente e waitForNext aponta para triage-voice-btn (não no DOM)
  - `Error: [MENTOR-AUDIT] data-mentor-step="nurse-queue" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Fila de Triagem". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   193 |     `
- **[failed]** L368: step 0: vet-queue existe e waitForNext aponta para vet-notes-textarea (não no DOM)
  - `Error: [MENTOR-AUDIT] data-mentor-step="vet-queue" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Fila do Consultório". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   193 |   `
- **[failed]** L400: step 0: exams-request-btn presente e clicável
  - `Error: [MENTOR-AUDIT] data-mentor-step="exams-request-btn" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Solicitar Exame". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   193 `
- **[failed]** L408: step 1: exams-queue presente e waitForNext aponta para exams-result-textarea (dentro de modal)
  - `Error: [MENTOR-AUDIT] data-mentor-step="exams-queue" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Fila de Exames". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   193 |      `
- **[failed]** L438: step 0: hospitalization-list presente e waitForNext aponta para hosp-save-evolution-btn
  - `Error: [MENTOR-AUDIT] data-mentor-step="hospitalization-list" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Quadro de Internados". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  `
- **[failed]** L474: step 0: grooming-queue presente e waitForNext aponta para grooming-voice-btn (dentro do modal)
  - `Error: [MENTOR-AUDIT] data-mentor-step="grooming-queue" não encontrado no DOM. Adicione o atributo no componente correto para o passo "Kanban de Banho e Tosa". |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   `
- **[failed]** L637: triagem: triage-add-btn, nurse-queue
  - `Error: triage-add-btn deve estar na DOM da página de triagem |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   640 |     for (const target of ['triage-add-btn', 'nurse-queue']) { |   641 |       const count = a`
- **[failed]** L646: veterinário: vet-queue
  - `Error: vet-queue deve estar na DOM da página do veterinário |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   648 |     await gotoSafe(page, `${BASE_URL}/dashboard/vet`) |   649 |     const count = await page.l`
- **[failed]** L653: exames: exams-request-btn, exams-queue
  - `Error: exams-request-btn deve estar na DOM da página de exames |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   656 |     for (const target of ['exams-request-btn', 'exams-queue']) { |   657 |       const coun`
- **[failed]** L662: internação: hospitalization-list
  - `Error: hospitalization-list deve estar na DOM da página de internação |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   664 |     await gotoSafe(page, `${BASE_URL}/dashboard/hospitalization`) |   665 |     cons`
- **[failed]** L669: grooming: grooming-queue
  - `Error: grooming-queue deve estar na DOM da página de grooming |  | expect(received).toBeGreaterThan(expected) |  | Expected: > 0 | Received:   0 |  |   671 |     await gotoSafe(page, `${BASE_URL}/dashboard/grooming`) |   672 |     const count = await`

### `patients-module.spec.ts` (1 falhas)

- **[failed]** L50: Admin cadastra novo tutor + pet e eles aparecem na lista
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByRole('dialog') | Expected: visible | Timeout: 5000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 5000ms |   - waiting for getByRole('dialog') |  |`

### `pharmacy-module.spec.ts` (2 falhas)

- **[failed]** L245: Receptionist é redirecionado ao acessar /dashboard/pharmacy
  - `Error: expect(received).not.toMatch(expected) |  | Expected pattern: not /\/pharmacy/ | Received string:      "http://localhost:4000/dashboard/pharmacy" |  |   248 | |   249 |     await page.waitForTimeout(3_000); | > 250 |     expect(page.url()).not`
- **[failed]** L265: Admin acessa /dashboard/pharmacy com módulo desativado → redirect
  - `Error: expect(received).not.toMatch(expected) |  | Expected pattern: not /\/pharmacy/ | Received string:      "http://localhost:4000/dashboard/pharmacy" |  |   271 |     // Aguardar redirect para qualquer rota fora de /pharmacy, ou timeout de 8s |   `

### `phase5-billing-management.spec.ts` (2 falhas)

- **[timedOut]** L169: Clicar Receber → selecionar Pix → Confirmar → fatura paga + entrada no caixa
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L698: Receptionist redirecionado ao acessar /dashboard/management
  - `Test timeout of 60000ms exceeded.`

### `phase6-edge-cases.spec.ts` (2 falhas)

- **[timedOut]** L120: Confirmar pagamento desabilita botão durante processamento
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L189: Abortar fetch durante confirmação não crasha a página
  - `Test timeout of 60000ms exceeded.`

### `phase6-mentor-jumpmode.spec.ts` (5 falhas)

- **[timedOut]** L193: TC-MENTOR-002: focar campo fora de ordem ativa JumpMode — badge "Exploração livre"
  - `Test timeout of 120000ms exceeded.`
- **[timedOut]** L214: TC-MENTOR-003: spotlight (anel âmbar) reposiciona para o campo jumpado
  - `Test timeout of 120000ms exceeded.`
- **[timedOut]** L267: TC-MENTOR-004: passo do tour NÃO muda durante JumpMode
  - `Test timeout of 120000ms exceeded.`
- **[timedOut]** L324: TC-MENTOR-005: 3 saltos consecutivos out-of-order — tour persiste, overlay nunca fecha
  - `Test timeout of 120000ms exceeded.`
- **[timedOut]** L359: TC-MENTOR-006: focar o passo atual cancela JumpMode — anel volta a azul
  - `Test timeout of 120000ms exceeded.`

### `responsive-mobile.spec.ts` (20 falhas)

- **[failed]** L73: [iPhone SE 375px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('a[href="/dashboard/reception"]').first() | Expected: visible | Timeout: 8000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waitin`
- **[failed]** L73: [iPhone 12 Pro 390px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator: locator('a[href="/dashboard/reception"]').first() | Expected: visible | Timeout: 8000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waitin`
- **[failed]** L73: [iPhone SE 375px] nav — ícones visíveis, texto oculto
  - `TimeoutError: page.reload: Timeout 30000ms exceeded. | Call log: |   - waiting for navigation until "load" |     - navigated to "http://localhost:4000/dashboard/reception" |  |  |   73 |     test(`[${phone.name} ${phone.w}px] nav — ícones visíveis, t`
- **[failed]** L73: [iPhone 12 Pro 390px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[failed]** L73: [Pixel 5 393px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[failed]** L73: [Samsung Galaxy S21 360px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[failed]** L73: [iPhone SE 375px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[failed]** L73: [iPhone 12 Pro 390px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[failed]** L73: [Pixel 5 393px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[failed]** L73: [Samsung Galaxy S21 360px] nav — ícones visíveis, texto oculto
  - `Error: expect(locator).toBeVisible() failed |  | Locator:  locator('a[href="/dashboard/reception"]').first() | Expected: visible | Received: hidden | Timeout:  8000ms |  | Call log: |   - Expect "toBeVisible" with timeout 8000ms |   - waiting for loc`
- **[timedOut]** L122: [iPhone SE 375px] caixa — tabs scrolláveis, labels ocultos
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L122: [iPhone 12 Pro 390px] caixa — tabs scrolláveis, labels ocultos
  - `Test timeout of 60000ms exceeded.`
- **[failed]** L122: [Pixel 5 393px] caixa — tabs scrolláveis, labels ocultos
  - `TimeoutError: page.goto: Timeout 30000ms exceeded. | Call log: |   - navigating to "http://localhost:4000/dashboard/cashier", waiting until "domcontentloaded" |  |  |   122 |     test(`[${phone.name} ${phone.w}px] caixa — tabs scrolláveis, labels ocu`
- **[timedOut]** L122: [iPhone SE 375px] caixa — tabs scrolláveis, labels ocultos
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L122: [iPhone 12 Pro 390px] caixa — tabs scrolláveis, labels ocultos
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L122: [Pixel 5 393px] caixa — tabs scrolláveis, labels ocultos
  - `Test timeout of 60000ms exceeded.`
- **[failed]** L122: [Samsung Galaxy S21 360px] caixa — tabs scrolláveis, labels ocultos
  - `TimeoutError: page.goto: Timeout 30000ms exceeded. | Call log: |   - navigating to "http://localhost:4000/dashboard/cashier", waiting until "domcontentloaded" |  |  |   122 |     test(`[${phone.name} ${phone.w}px] caixa — tabs scrolláveis, labels ocu`
- **[failed]** L176: [Triagem queue] fila carrega em mobile sem overflow horizontal
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByRole('heading', { name: /Triagem Veterinária/i }) | Expected: visible | Timeout: 5000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 5000ms |   - w`
- **[failed]** L452: [Samsung Galaxy S21 360px] grooming — sem overflow
  - `TimeoutError: page.goto: Timeout 30000ms exceeded. | Call log: |   - navigating to "http://localhost:4000/dashboard/grooming", waiting until "domcontentloaded" |  |  |   452 |     test(`[${phone.name} ${phone.w}px] grooming — sem overflow`, async ({ `
- **[failed]** L475: [iPhone 12 Pro 390px] consultório — sem overflow
  - `TimeoutError: page.goto: Timeout 30000ms exceeded. | Call log: |   - navigating to "http://localhost:4000/dashboard/vet", waiting until "domcontentloaded" |  |  |   475 |     test(`[${phone.name} ${phone.w}px] consultório — sem overflow`, async ({ pa`

### `sprint-master-b02-b04.spec.ts` (1 falhas)

- **[timedOut]** L87: B-04-02: STATUS_FLOW do modal B&T tem grooming antes de bathing (código)
  - `Test timeout of 60000ms exceeded.`

### `sprint-master-documents.spec.ts` (5 falhas)

- **[timedOut]** L146: Upload de arquivo PDF funciona na aba Documentos
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L203: Após upload, nome do arquivo aparece na lista de documentos
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L445: Upload de Executável Windows (exe) é rejeitado
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L445: Upload de JavaScript (js) é rejeitado
  - `Test timeout of 60000ms exceeded.`
- **[timedOut]** L445: Upload de Shell script (sh) é rejeitado
  - `Test timeout of 60000ms exceeded.`

### `sprint-master-mentor.spec.ts` (1 falhas)

- **[failed]** L214: Resposta menciona "agenda" ou "horário" para configuração de disponibilidade (G-11)
  - `TimeoutError: apiRequestContext.post: Timeout 40000ms exceeded. | Call log: |   - → POST http://localhost:4000/api/mentor-chat |     - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 S`

### `sprint-master-regression.spec.ts` (6 falhas)

- **[failed]** L126: Módulo de recepção carrega e exibe a fila sem erro
  - `Error: expect(received).toBe(expected) // Object.is equality |  | Expected: true | Received: false |  |   132 |     const heading = page.getByText(/recepção|fila de espera|pacientes/i).first(); |   133 |     const headingVisible = await heading.isVis`
- **[failed]** L214: Sessão de grooming com status waiting_pickup aparece no módulo
  - `Error: expect(received).toBe(expected) // Object.is equality |  | Expected: true | Received: false |  |   219 |     const heading = page.getByText(/banho|tosa|grooming/i).first(); |   220 |     const headingVisible = await heading.isVisible({ timeout`
- **[failed]** L262: Módulo de exames carrega sem quebrar com exam_request sem notes
  - `Error: page.goto: net::ERR_ABORTED at http://localhost:4000/dashboard/exams | Call log: |   - navigating to "http://localhost:4000/dashboard/exams", waiting until "domcontentloaded" |  |  |   262 |   test('Módulo de exames carrega sem quebrar com exa`
- **[failed]** L408: Módulo de grooming ainda carrega sem erros relacionados ao voice assistant
  - `Error: expect(received).toBe(expected) // Object.is equality |  | Expected: true | Received: false |  |   439 |     const heading = page.getByText(/banho|tosa|grooming/i).first(); |   440 |     const headingVisible = await heading.isVisible({ timeout`
- **[failed]** L579: Módulo caixa carrega lançamentos sem erro após P-05 (DateInput)
  - `Error: expect(received).toBe(expected) // Object.is equality |  | Expected: true | Received: false |  |   585 |     const heading = page.getByText(/caixa|financeiro|lançamentos|faturamento/i).first(); |   586 |     const headingVisible = await headin`
- **[failed]** L836: Erros de console não indicam cross-contamination de contexto de voz entre módulos
  - `Error: expect(received).toBe(expected) // Object.is equality |  | Expected: true | Received: false |  |   868 |     const groomingHeading = page.getByText(/banho|tosa|grooming/i).first(); |   869 |     const headingVisible = await groomingHeading.isV`

### `triage-module.spec.ts` (1 falhas)

- **[failed]** L361: Acesso a /dashboard/triage sem módulo ativo redireciona para /dashboard
  - `Error: expect(page).not.toHaveURL(expected) failed |  | Expected pattern: not /\/triage/ | Received string: "http://localhost:4000/dashboard/triage" | Timeout: 8000ms |  | Call log: |   - Expect "not toHaveURL" with timeout 8000ms |     11 × unexpect`

### `vet-module.spec.ts` (2 falhas)

- **[failed]** L93: Vet acessa consulta em andamento e registra anamnese
  - `Error: expect(locator).toBeVisible() failed |  | Locator: getByText(/consultório|fila de consultas|em atendimento/i).first() | Expected: visible | Timeout: 10000ms | Error: element(s) not found |  | Call log: |   - Expect "toBeVisible" with timeout 1`
- **[failed]** L247: Acesso a /dashboard/vet sem módulo consultation redireciona
  - `Error: expect(received).not.toMatch(expected) |  | Expected pattern: not /\/vet($|\/)/ | Received string:      "http://localhost:4000/dashboard/vet" |  |   250 |     await page.goto('/dashboard/vet', { waitUntil: 'domcontentloaded' }); |   251 |     `
