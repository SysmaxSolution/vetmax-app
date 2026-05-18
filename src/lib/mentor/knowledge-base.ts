/**
 * Base de conhecimento do VetMax Mentor IA, embutida como módulo TypeScript.
 * Garantia de disponibilidade em qualquer ambiente (Vercel, local, CI).
 *
 * Para atualizar: edite este arquivo diretamente.
 * Version: 1.2.0 — atualizada pelo Librarian (2026-05-10)
 */

export const VETMAX_KNOWLEDGE_BASE = `# VETMAX_KNOWLEDGE_BASE
<!-- AI-CONTEXT: This document is the authoritative knowledge base for the VetMax Mentor AI.
     Use this file to answer any natural language question about system workflows, module usage,
     UI actions, inter-module relationships, and user tips. -->

**version**: 1.3.0
**last-updated**: 2026-05-18
**scope**: All active VetMax modules — Recepção, Triagem, Consultório, Exames, Internação, Banho & Tosa, Caixa Central, Gestão, Farmácia, Pacientes, WhatsApp, Mentor
**audience**: Mentor AI, support agents, onboarding staff

---

## TERMINOLOGY REFERENCE
<!-- AI-CONTEXT: Always use these terms in answers. Never use synonyms listed as "AVOID". -->

| Correct Term | AVOID | Notes |
|---|---|---|
| **Pet** / **Animal** | "Paciente" | UI term per CFMV regulation |
| **Tutor** | "Dono", "Proprietário" | Legal term — CFMV compliant |
| **Médico Veterinário** / **MV** | "Médico" alone | Professional title |
| **Auxiliar Veterinário** | "Técnico" | Staff role |
| **Prontuário** | "Ficha" | Medical record (SOAP format) |
| **Alta** | "Saída", "Liberação" | Discharge event |
| **Check-in** | "Entrada", "Registro" | Reception intake action |
| **Agendamento** | "Marcação", "Reserva" | Scheduled future appointment |

---

## GLOBAL FLOW — PATIENT JOURNEY
<!-- AI-CONTEXT: This is the master flow. Every module is a node in this journey. -->

\`\`\`
[TUTOR CHEGA / AGENDA]
     │
     ▼
┌─────────────┐
│  RECEPÇÃO   │  ← Check-in, cadastro, agendamento, fila de espera
└──────┬──────┘
       │ "Chamar Triagem →"
       ▼
┌─────────────┐
│   TRIAGEM   │  ← Sinais vitais, queixa principal, urgência
└──────┬──────┘
       │ "Encaminhar para Consultório"
       ▼
┌──────────────┐
│ CONSULTÓRIO  │  ← Anamnese, SOAP, diagnóstico, prescrição
└──────┬───────┘
       │
   ┌───┴────────────────────────────┐
   │                                │
   ▼                                ▼
┌──────────┐                 ┌─────────────┐
│  EXAMES  │                 │ INTERNAÇÃO  │
│ (laudos) │                 │  (Kanban)   │
└────┬─────┘                 └──────┬──────┘
     │ resultado registrado          │ alta hospitalar
     └──────────────┬───────────────┘
                    ▼
          ┌──────────────────┐
          │  CAIXA CENTRAL   │  ← Pagamento, faturamento
          └──────────────────┘

PARALELO (não bloqueante):
  ┌────────────────┐    ┌────────────────┐
  │  BANHO & TOSA  │    │   FARMÁCIA     │
  │    (Kanban)    │    │  (Estoque)     │
  └────────────────┘    └────────────────┘
\`\`\`

---

## CONSULTATION STATUS LIFECYCLE
<!-- AI-CONTEXT: Use this table to answer "onde está o pet" or "qual status da consulta" questions. -->

| Status | Módulo Responsável | Significado |
|---|---|---|
| \`scheduled_future\` | Recepção | Agendamento futuro — pet ainda não chegou |
| \`reception\` | Recepção | Pet com check-in feito, aguardando triagem |
| \`triage\` | Triagem | Em triagem — sinais vitais sendo coletados |
| \`in_progress\` | Consultório | Consulta em andamento com o MV |
| \`waiting_exam\` | Exames | Aguardando resultado de exame |
| \`medication\` | Consultório/Farmácia | Em processo de medicação |
| \`hospitalized\` | Internação | Pet internado no hospital |
| \`revisao_pos_internacao\` | Consultório | Revisão pós-internação com MV |
| \`completed\` | Caixa/Alta | Atendimento finalizado — aguardando pagamento ou pago |

### Grooming Status Lifecycle

| Status | Módulo | Significado |
|---|---|---|
| \`scheduled\` (agendado) | Grooming | Agendamento futuro de banho/tosa |
| \`received\` (recebido) | Grooming | Animal chegou à clínica |
| \`bathing\` (em banho) | Grooming | Banho em andamento |
| \`grooming\` (em tosa) | Grooming | Tosa em andamento |
| \`waiting_pickup\` (aguardando) | Grooming | Pronto — aguardando retirada pelo tutor |
| \`delivered\` (entregue) | Grooming/Caixa | Entregue e pagamento registrado |

---

## MODULE 01 — RECEPÇÃO
<!-- AI-CONTEXT: Entry point for all patient visits. Manages queue, check-in, and scheduling. -->

### Objective
Registrar a chegada do animal, criar ou localizar o cadastro do tutor e do pet, efetuar check-in, agendar consultas futuras e encaminhar para triagem.

### Happy Path — Check-in (animal já chegou)
1. **Buscar tutor** — Digitar CPF, nome do tutor, ou nome do pet na "Busca Inteligente" (debounce 300ms).
2. **Selecionar pet** — O sistema lista os pets vinculados ao tutor encontrado.
3. **Check-in** — Clicar "Check-in" → modal abre → confirmar animal e motivo da consulta.
4. **Fila de espera** — Animal aparece na fila em tempo real (Supabase Realtime).
5. **Chamar para triagem** — Quando triagem disponível, clicar "Chamar Triagem →" no card do animal.
6. **WhatsApp (opcional)** — Sistema sugere notificação ao tutor via WhatsApp após encaminhar.

### Happy Path — Agendar Consulta Futura (animal não está presente)
1. **Buscar tutor** — Digitar CPF, nome do tutor, ou nome do pet na "Busca Inteligente".
2. **Selecionar pet** — Escolher o pet desejado nos resultados.
3. **Clicar "Agendar"** (não "Check-in") — Modal de agendamento abre.
4. **Definir data e horário** — Selecionar no calendário a data e hora da consulta.
5. **Confirmar** — Sistema cria consulta com status \`scheduled_future\`.
6. **Agendamento visível** — Aparece no calendário da recepção e no módulo de Pacientes.

### Happy Path — Agendar Banho e Tosa
1. **Buscar tutor** e selecionar pet na "Busca Inteligente".
2. **Clicar "📅 Agendar B&T"** — Modal específico de banho/tosa abre.
3. **Escolher serviço** — Banho, Tosa ou Banho + Tosa.
4. **Definir data e horário** — Calendário de disponibilidade do tosador.
5. **Confirmar** — Cria \`grooming_sessions\` com status \`scheduled\`.

### Inter-Module Relationships
- **Entrada:** Início do fluxo — nenhuma etapa anterior.
- **Saída:** → **Triagem** (via "Chamar Triagem →")
- **Paralelo:** Pode agendar consulta futura (sem check-in imediato) → aparece em calendário.

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"Busca Inteligente"** (campo de busca) | Localiza tutor por CPF, nome ou nome do pet | Consulta \`profiles\` + \`patients\` |
| **"Novo Cadastro"** (Alt+N) | Abre modal para criar novo tutor + pet | Grava em \`tutors\` + \`patients\` |
| **"Check-in"** | Inicia atendimento para o pet selecionado (animal já está presente) | Cria registro em \`consultations\` (status: \`reception\`) |
| **"Agendar"** | Agenda consulta futura (animal não está presente) | Cria \`consultations\` (status: \`scheduled_future\`) |
| **"Feed"** | Abre timeline histórica do pet | Leitura de \`consultations\`, \`exams\`, \`hospitalizations\` |
| **"Chamar Triagem →"** | Move animal para fila de triagem | Atualiza \`consultations.status\` → \`triage\` |
| **"✂️ Check-in B&T"** | Check-in direto para Banho & Tosa (se módulo ativo) | Cria \`grooming_sessions\` |
| **"📅 Agendar B&T"** | Agenda serviço de banho/tosa | Cria \`grooming_sessions\` (status: \`agendado\`) |

### UX Tips — Tricks for Speed
- **CPF = preenchimento automático**: Digite apenas o CPF no campo de busca para auto-preencher todos os dados do tutor.
- **Tecla Alt+N**: Abre "Novo Cadastro" instantaneamente sem usar o mouse.
- **Realtime**: A fila atualiza automaticamente — não é necessário recarregar a página.
- **Check-in pelo nome do pet**: Não precisa saber o CPF do tutor — o sistema encontra pelo nome do animal.
- **Diferença Check-in × Agendar**: "Check-in" = animal chegou agora. "Agendar" = reservar horário futuro sem presença imediata.

---

## MODULE 02 — TRIAGEM
<!-- AI-CONTEXT: Clinical intake by nursing staff. Captures vital signs before veterinarian consultation. -->

### Objective
Coletar sinais vitais (peso, temperatura, queixa principal), avaliar urgência e encaminhar o animal para o consultório do MV.

### Happy Path (step-by-step)
1. **Visualizar fila** — Aba "Fila de Espera" mostra animais vindos da Recepção.
2. **Abrir ficha** — Clicar no card do animal → abre rota \`/dashboard/triage/[id]\`.
3. **Preencher sinais vitais** — Peso (kg), temperatura retal (°C), frequência cardíaca (bpm), queixa principal.
4. **Gravação por voz** — Clicar no microfone → falar os dados → IA preenche os campos automaticamente.
5. **Concluir triagem** — Clicar "Salvar" → animal vai para fila do Consultório.
6. **Histórico** — Aba "Histórico de Hoje" mostra triagens concluídas.

### Inter-Module Relationships
- **Entrada:** ← **Recepção** (status \`triage\`)
- **Saída:** → **Consultório** (status \`in_progress\`)
- **Dados passados adiante:** \`weight_kg\`, \`temperature_rectal\`, \`heart_rate\`, \`chief_complaint\`, \`urgency_level\`

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Aba "Fila de Espera"** | Mostra animais aguardando triagem | Leitura \`consultations\` (status=\`triage\`) |
| **Aba "Histórico de Hoje"** | Triagens concluídas no dia | Leitura \`triage_records\` finalizados |
| **Card do animal (clique)** | Abre formulário detalhado de triagem | Navega para \`/dashboard/triage/[id]\` |
| **"+ Adicionar Paciente"** | Adiciona animal manualmente à fila (sem check-in prévio) | Cria \`triage_records\` direto |
| **Microfone (voz)** | Reconhecimento de voz pt-BR para sinais vitais | Transcreve e preenche campos via IA |
| **"Encaminhar para Consultório"** | Finaliza triagem e envia para MV | Atualiza status → \`in_progress\` |
| **"Editar Triagem"** | Corrige dados de triagem já concluída | Navega \`/dashboard/triage/[id]?edit=true\` |

### CFMV Compliance
- **Campos obrigatórios**: \`weight_kg\` e \`temperature_rectal\` — o sistema bloqueia envio sem esses dados.
- Esses campos compõem o prontuário oficial exigido pelo CFMV.

### UX Tips — Tricks for Speed
- **Use o microfone**: Fale "Peso cinco vírgula três quilos, temperatura trinta e oito vírgula dois" — a IA preenche automaticamente.
- **Urgência visual**: Animais em estado crítico aparecem com badge vermelho 🚨 para priorização.
- **Sem check-in?** Use "Adicionar Paciente" para casos de emergência que chegam sem check-in na recepção.

---

## MODULE 03 — CONSULTÓRIO (VET)
<!-- AI-CONTEXT: Veterinarian consultation workspace. SOAP record creation, diagnosis, prescriptions. -->

### Objective
Realizar a consulta clínica, preencher o prontuário SOAP (Subjetivo, Objetivo, Avaliação, Plano), registrar diagnóstico e prescrição, e definir o próximo passo (alta, exame, internação, medicação).

### Happy Path (step-by-step)
1. **Fila** — MV vê animais com triagem concluída (status \`in_progress\`).
2. **Abrir consulta** — Clicar no card → abre \`/dashboard/vet/[id]\`.
3. **Gravar por voz** — Clicar "Iniciar Gravação" → falar anamnese completa → IA gera rascunho SOAP.
4. **Revisar prontuário** — Ajustar texto gerado nas seções S, O, A, P.
5. **Marcar responsabilidade** — Checkbox \`is_reviewed_by_vet\` (obrigatório por lei — CFMV).
6. **Salvar e definir destino:**
   - **Alta**: status → \`completed\`
   - **Exame**: status → \`waiting_exam\`
   - **Medicação**: status → \`medication\`
   - **Internação**: cria \`hospitalizations\` + status vira \`hospitalized\`

### Inter-Module Relationships
- **Entrada:** ← **Triagem** (status \`in_progress\`) ou retorno de **Internação** (status \`revisao_pos_internacao\`)
- **Saídas possíveis:**
  - → **Exames** (status \`waiting_exam\`)
  - → **Internação** (via criação de \`hospitalizations\`)
  - → **Caixa** (status \`completed\` → invoice gerada)
  - → **Retorno**: Pós-internação revisão

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"Iniciar Gravação"** | Microfone para ditado da anamnese | Speech-to-text → gera SOAP via IA |
| **Seção SOAP** | Campos editáveis S/O/A/P | Grava em \`consultations.soap_*\` |
| **Checkbox \`is_reviewed_by_vet\`** | Assina prontuário digitalmente | Obrigatório — bloqueia alta sem marcar |
| **"Solicitar Exame"** | Cria requisição de exame | Atualiza status → \`waiting_exam\`, cria \`exam_requests\` |
| **"Encaminhar Internação"** | Admite animal na internação | Cria \`hospitalizations\`, atualiza status |
| **"Dar Alta"** | Finaliza consulta | Status → \`completed\`, aciona faturamento |
| **"Editar Consulta"** (histórico) | Reabre prontuário já salvo para adição de notas | Atualiza \`consultations\` |

### CFMV Compliance
- **\`is_reviewed_by_vet\`** deve ser \`true\` antes de qualquer alta — sistema bloqueia sem essa confirmação.
- Prontuário deve registrar CRM-V do MV responsável.

### UX Tips — Tricks for Speed
- **Ditado por voz**: Fale toda a anamnese de uma vez — a IA estrutura em S/O/A/P automaticamente.
- **Animais de retorno**: Pós-internação aparecem com badge 🏥 — histórico completo disponível.
- **Alergias**: Exibidas em destaque vermelho no topo do card para não passar despercebido.

---

## MODULE 04 — EXAMES
<!-- AI-CONTEXT: Laboratory and imaging workstation. Processes exam requests and records diagnostic results. -->

### Objective
Receber requisições de exame enviadas pelo MV, processar amostras, e registrar resultados (hemograma, urinalise, raio-X, ultrassom, bioquímica, cultura, outros).

### Happy Path (step-by-step)
1. **Fila de exames** — Animais com status \`waiting_exam\` aparecem automaticamente.
2. **Abrir exame** — Clicar no card → \`/dashboard/exams/[id]\` ou botão "Iniciar Exame".
3. **Processar** — Realizar procedimento laboratorial/de imagem.
4. **Registrar resultado** — Clicar "Registrar Resultado" → textarea para laudo/achados.
5. **Salvar** — Animal retorna ao fluxo (MV recebe notificação via realtime).

### Inter-Module Relationships
- **Entrada:** ← **Consultório** (status \`waiting_exam\`)
- **Saída:** → **Consultório** (MV retoma consulta com resultado disponível)
- **Paralelo:** Farmácia pode ser acessada independentemente para medicamentos

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Aba "Fila de Exames"** | Requisições pendentes | Leitura \`consultations\` (status=\`waiting_exam\`) + \`exam_requests\` |
| **Aba "Histórico de Hoje"** | Exames concluídos | Leitura \`exams\` finalizados |
| **"+ Solicitar Exame"** | Requisição manual (sem consulta ativa) | Cria \`exam_requests\` |
| **Card do exame (clique)** | Abre formulário do exame | Navega \`/dashboard/exams/[id]\` |
| **"Registrar Resultado"** | Modal para laudo em texto livre | Grava em \`exams.result\` + atualiza status |
| **"Editar Exame"** | Corrige resultado já registrado | Navega \`/dashboard/exams/[id]\` |

### Exam Types (dropdown options)
\`hemogram\` | \`urinalysis\` | \`xray\` | \`ultrasound\` | \`biochemistry\` | \`culture\` | \`other\`

### UX Tips — Tricks for Speed
- **Tempo de espera**: Cada card mostra o tempo decorrido desde a requisição — priorize por urgência.
- **Resultado inline**: Use o botão "Registrar Resultado" diretamente na lista sem precisar abrir a rota \`/[id]\`.
- **Requisição manual**: Exames de retorno ou sem consulta ativa podem ser abertos via "+ Solicitar Exame".

---

## MODULE 05 — INTERNAÇÃO
<!-- AI-CONTEXT: Kanban board for hospitalized animals. Tracks observation, ward, ICU, and discharge. -->

### Objective
Gerenciar animais internados em um quadro Kanban visual, registrar evoluções diárias, e controlar a jornada desde admissão até a alta hospitalar.

### Happy Path (step-by-step)
1. **Admitir** — Animal vem do Consultório (MV solicitou internação) OU via botão "+ Admitir".
2. **Observação** — Card aparece na coluna 👁️ Observação.
3. **Evoluir** — Arrastar card para coluna correta conforme status clínico.
4. **Diário** — Registrar evoluções via modal de detalhe (botão "Adicionar Nota").
5. **Alta** — Arrastar card para coluna 🏠 "Pronto para Alta" → confirmar → gera laudo de alta.
6. **Pós-internação** — Opcional: enviar para revisão com MV (status \`revisao_pos_internacao\`).

### Kanban Columns
| Column | Icon | Status | Description |
|---|---|---|---|
| **Observação** | 👁️ | \`observation\` | Monitoramento inicial |
| **Enfermaria** | 🏥 | \`ward\` | Estável, cuidados de rotina |
| **UTA** | 🚨 | \`icu\` | Unidade de Terapia Animal (U.T.A) — cuidados intensivos |
| **Pronto para Alta** | 🏠 | \`ready_for_discharge\` | Liberado clinicamente |

### Inter-Module Relationships
- **Entrada:** ← **Consultório** (MV solicitou internação)
- **Saídas:**
  - → **Consultório** (revisão pós-internação, status \`revisao_pos_internacao\`)
  - → **Caixa** (cobrança dos dias internados)

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Drag & Drop (cards)** | Move animal entre colunas | Atualiza \`hospitalizations.status\` + loga transição |
| **"+ Admitir"** | Admite novo animal sem passar pelo Consultório | Cria \`hospitalizations\` |
| **Card (clique)** | Abre modal de detalhe com histórico | Exibe \`hospitalization_logs\` |
| **"Adicionar Nota"** | Registro de evolução diária | Grava em \`hospitalization_logs\` |
| **"Dar Alta"** (ao mover para última coluna) | Confirma alta e gera laudo | Gera discharge summary, atualiza status |
| **"Revisão MV"** | Envia para revisão pós-internação | Status → \`revisao_pos_internacao\` |
| **WhatsApp (sugestão)** | Notifica tutor de mudança de status | Sugere mensagem pré-formatada |

### UX Tips — Tricks for Speed
- **Drag & drop intuitivo**: Arraste qualquer card entre colunas — o log de transição é automático.
- **Notificação WhatsApp**: Ao mover para "Pronto para Alta", o sistema sugere mensagem ao tutor.
- **Logs automáticos**: Cada movimento entre colunas é registrado com timestamp e usuário responsável.

---

## MODULE 06 — BANHO & TOSA (GROOMING)
<!-- AI-CONTEXT: Kanban for pet grooming sessions. Tracks scheduling through delivery and integrates with cashier. -->

### Objective
Gerenciar sessões de banho e tosa em fluxo Kanban, desde agendamento até entrega com registro de pagamento integrado ao Caixa.

### Happy Path (step-by-step)
1. **Agendar** — Via Recepção ("Agendar B&T") ou diretamente no módulo Grooming.
2. **Agendados** — Card aparece na coluna 📅 Agendados.
3. **Receber animal** — Confirmar chegada → mover para 📋 Recebido.
4. **Em banho** — Arrastar para 🛁 Em Banho.
5. **Em tosa** — Arrastar para ✂️ Em Tosa (se houver serviço de tosa).
6. **Aguardando** — Mover para ⏳ Aguardando Retirada → sistema sugere notificação WhatsApp ao tutor.
7. **Entrega** — Mover para ✅ Entregue → modal de pagamento → \`cashier_entries\` criado automaticamente.

### Kanban Columns
| Column | Icon | Status | Trigger |
|---|---|---|---|
| **Agendados** | 📅 | \`scheduled\` | Agendamento feito |
| **Recebido** | 📋 | \`received\` | Animal chegou |
| **Em Banho** | 🛁 | \`bathing\` | Serviço iniciado |
| **Em Tosa** | ✂️ | \`grooming\` | Tosa em andamento |
| **Aguardando Retirada** | ⏳ | \`waiting_pickup\` | Serviço finalizado |
| **Entregue** | ✅ | \`delivered\` | Animal retirado + pago |

### Inter-Module Relationships
- **Entrada:** ← **Recepção** (check-in B&T ou agendamento B&T)
- **Saída:** → **Caixa** (pagamento via \`finishGroomingSessionAndRecord()\` ao mover para "Entregue")

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Drag & Drop** | Move sessão entre etapas | Atualiza \`grooming_sessions.status\` |
| **"Confirmar Chegada"** | Marca animal como recebido | Status → \`received\` |
| **"Cancelar Sessão"** | Cancela agendamento | Status → \`cancelled\`, abre modal de confirmação |
| **Card (clique)** | Detalhe da sessão (serviços, preço, notas) | Exibe modal com \`grooming_sessions\` completo |
| **"Entregar"** (ao mover para ✅) | Confirma entrega + pagamento | Cria \`cashier_entries\` com valor do serviço |
| **WhatsApp (sugestão)** | Notifica tutor de prontidão | Após mover para "Aguardando Retirada" ou "Entregue" |

### UX Tips — Tricks for Speed
- **Pagamento automático**: Ao arrastar para "Entregue", o pagamento já é registrado no Caixa — sem etapa extra.
- **WhatsApp integrado**: Notificação ao tutor sobre prontidão do animal é sugerida automaticamente.
- **Agenda visual**: Use o \`/dashboard/grooming/schedule\` para visão de calendário de agendamentos futuros.

---

## MODULE 07 — CAIXA CENTRAL (CASHIER)
<!-- AI-CONTEXT: Financial hub. Manages payments, invoices, expenses, and daily cash sessions. -->

### Objective
Centralizar o controle financeiro: registrar pagamentos de consultas e serviços, controlar saídas de caixa, emitir relatórios e gerenciar a sessão diária do caixa.

### Happy Path — Receber Pagamento de Consulta
1. **Aba "Recebimentos"** → lista faturas pendentes de consultas finalizadas.
2. **"Registrar Pagamento"** → modal com valor, forma de pagamento, data.
3. **Confirmar** → \`invoices.status\` → \`paid\`, \`cashier_entries\` criado.

### Happy Path — Sessão Diária
1. **Aba "Sessão"** → "Abrir Caixa" → inicia sessão do dia com saldo inicial.
2. **Durante o dia** → pagamentos e saídas são lançados automaticamente.
3. **"Fechar Caixa"** → registra saldo final, gera relatório do dia.

### Four Tabs Overview
| Tab | Icon | Function |
|---|---|---|
| **Visão Geral** | 📊 | Dashboard com métricas do dia (entradas, saídas, saldo) |
| **Recebimentos** | 💰 | Faturas pendentes + pagamentos de Banho & Tosa |
| **Saídas** | 📤 | Despesas e saídas manuais de caixa |
| **Sessão** | 🔑 | Abertura e fechamento do caixa diário |

### Inter-Module Relationships
- **Alimentado por:**
  - **Consultório** → consultas finalizadas geram \`invoices\`
  - **Grooming** → entrega do pet registra pagamento automaticamente
  - **Internação** → dias de internação geram cobrança
- **Não alimenta** outros módulos (terminal do fluxo financeiro).

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"Registrar Pagamento"** (fatura) | Paga fatura de consulta | \`invoices.status\` → \`paid\` + \`cashier_entries\` |
| **"+ Adicionar Saída"** | Registra despesa (insumos, serviços) | Cria \`cashier_outflows\` |
| **"Abrir Caixa"** | Inicia sessão financeira do dia | Cria \`cashier_sessions\` |
| **"Fechar Caixa"** | Encerra sessão e totaliza | Atualiza \`cashier_sessions.closed_at\` + totais |
| **"Atualizar"** (refresh) | Recarrega todos os dados | Consulta todas as tabelas financeiras em paralelo |

### Formas de Pagamento Aceitas
- **Dinheiro** — registro manual do troco
- **Cartão de Crédito / Débito** — registro da bandeira e número de parcelas
- **PIX** — identificação via chave ou QR code
- **Convênio** — vinculado ao cadastro de convênios em Gestão

### Roles with Access
\`admin\` | \`owner\` | \`manager\` | \`accountant\` | \`receptionist\`

### UX Tips — Tricks for Speed
- **Grooming paga automático**: Ao marcar entrega no módulo Grooming, o pagamento já aparece no Caixa — sem ação extra.
- **Relatório instantâneo**: A aba "Visão Geral" mostra saldo em tempo real sem precisar fechar caixa.
- **Múltiplas formas de pagamento**: O modal de pagamento suporta dinheiro, cartão, PIX e convênio.

---

## MODULE 08 — GESTÃO (MANAGEMENT)
<!-- AI-CONTEXT: Administrative control panel. Clinic settings, users, templates, catalog, modules. -->

### Objective
Configurar a clínica, gerenciar equipe, criar templates de documentos, gerir catálogo de produtos/serviços, e ativar/desativar módulos do sistema.

### Access Control
- **Acesso exclusivo**: role = \`admin\`
- Outros perfis não visualizam este módulo.

### Six Tabs Overview
| Tab | Key Function |
|---|---|
| **Templates** | CRUD de modelos de documentos (laudo, receita, encaminhamento, termo, exame) |
| **Clínica** | Nome, CNPJ, endereço, telefone, logo, módulos ativos, checklist de recepção |
| **Usuários** | Convidar, listar, remover membros + editar CRM-V de veterinários |
| **Catálogo** | Produtos e serviços para faturamento (add, edit, delete, importar CSV) |
| **Configurações** | Horário de atendimento, modo de fluxo contínuo, integração WhatsApp |
| **Convênios** | Parceiros e operadoras de planos de saúde animal |

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Toggle módulos** (aba Clínica) | Ativa/desativa módulos (Grooming, Farmácia, etc.) | Atualiza \`clinics.active_modules[]\` |
| **"Convidar"** | Envia convite por email com role definido | Cria \`invitations\` + email automático |
| **Editar CRM-V** | Valida e salva CRM-V do MV | Atualiza \`profiles.crmv\` |
| **"Upload Logo"** | Faz upload da logo da clínica | Salva em Supabase Storage + atualiza \`clinics.logo_url\` |
| **"+ Novo Template"** | Cria modelo de documento | Cria \`document_templates\` |
| **"Importar CSV"** (catálogo) | Importação em massa de produtos | Bulk insert em \`catalog\` |
| **Horário de Atendimento** | Define dias/horas de funcionamento | Atualiza \`clinic_config.business_hours\` |

### UX Tips — Tricks for Speed
- **Módulos desativados não aparecem no menu**: Se um módulo não está visível, verificar se está ativo na aba "Clínica" → Gestão.
- **CRM-V obrigatório para MV**: Sem CRM-V, o veterinário não pode assinar prontuários.
- **Checklist de recepção**: Personalize os itens verificados no check-in via aba "Clínica".

---

## MODULE 09 — FARMÁCIA (PHARMACY)
<!-- AI-CONTEXT: Medication inventory management. Stock tracking, dispensing, restocking. -->

### Objective
Controlar o estoque de medicamentos, registrar entradas (reposição) e saídas (dispensação), e alertar sobre estoque crítico.

### Access Control
- **Roles**: \`admin\` | \`vet\` apenas

### Happy Path — Dispensar Medicamento
1. **Localizar** — Buscar pelo nome do medicamento no campo de busca.
2. **Verificar estoque** — Card mostra quantidade atual vs. mínimo.
3. **"Dispensar"** — Modal → quantidade dispensada → confirmar.
4. **Log automático** — Movimento registrado com timestamp e usuário.

### Happy Path — Repor Estoque
1. **Localizar** — Buscar pelo nome do medicamento.
2. **"Reposto"** — Modal → quantidade recebida → confirmar.
3. **Log automático** — Entrada registrada com data e usuário.

### Happy Path — Adicionar Novo Medicamento
1. **"+ Adicionar Medicamento"** → modal abre.
2. **Preencher**: nome, princípio ativo, unidade, quantidade inicial, estoque mínimo.
3. **Confirmar** — Item criado em \`stock_items\`.

### Stock Status Indicators
| Status | Color | Condition |
|---|---|---|
| **Crítico** | 🔴 Vermelho | quantity ≤ 0 ou quantity < min_stock_level |
| **Atenção** | 🟡 Âmbar | quantity < min_stock_level × 1.5 |
| **OK** | 🟢 Verde | Estoque normal |

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Filtro "Crítico" / "OK"** | Filtra itens por status de estoque | Filtragem client-side |
| **Campo de busca** | Busca por nome de medicamento | Filtragem client-side |
| **"+ Adicionar Medicamento"** | Cadastra novo item no estoque | Cria em \`stock_items\` (v2) + \`pharmacy_stock\` (legado) |
| **"Reposto"** | Incrementa quantidade | \`stock_items.quantity += n\` + log de reposição |
| **"Ajustar"** | Define quantidade exata (inventário) | \`stock_items.quantity = n\` |
| **"Dispensar"** | Decrementa quantidade | \`stock_items.quantity -= n\` + log de dispensação |
| **"Deletar"** | Remove item do estoque | Soft delete em \`stock_items\` |

### UX Tips — Tricks for Speed
- **Filtro "Crítico"**: Use para ver rapidamente o que precisa de reposição urgente.
- **Unidades suportadas**: ml, mg, comprimido, frasco, unidade, ampola, cápsula.
- **Duplo banco**: Sistema mantém compatibilidade com tabela legada \`pharmacy_stock\` — ambas são atualizadas.

---

## MODULE 10 — PACIENTES (PATIENTS)
<!-- AI-CONTEXT: Master directory of all pets in the clinic. Search, edit registrations, view history. -->

### Objective
Diretório completo de pets cadastrados na clínica. Permite busca, edição de cadastro, visualização de histórico de consultas/exames/internações e adição de novos pets.

### Happy Path — Ver Histórico de um Pet
1. **Buscar** — Digitar nome do pet, tutor, CPF ou raça no campo de busca.
2. **Card do pet** — Mostra espécie 🐶🐱🦎, raça, sexo, idade calculada, status de castração, tutor.
3. **"Ver Histórico"** — Abre \`PetTimelineModal\` com todos os atendimentos em ordem cronológica.

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Campo de busca** (debounce 150ms) | Localiza pets por nome, tutor, CPF, raça | Consulta \`patients\` + \`tutors\` |
| **"+ Novo Pet"** | Cadastra novo pet vinculado a tutor existente | Cria em \`patients\`, vincula a \`tutors\` |
| **"Editar Cadastro"** | Abre modal de edição do pet | Atualiza \`patients\` |
| **"Ver Histórico"** | Timeline completa do pet | Leitura \`consultations\` + \`exams\` + \`hospitalizations\` + \`grooming_sessions\` |

### Pet Registration Fields
\`name\` | \`species\` (dog/cat/other) | \`breed\` | \`gender\` | \`birth_date\` | \`photo_url\` | \`allergies\` | \`chronic_diseases\` | \`behavior_tags\` | \`neutered\` | \`microchip_id\`

### Campos Clínicos do Pet — Detalhamento (aba "Paciente")

| Campo | Localização no Modal | Importância Clínica |
|---|---|---|
| **Alergias** (\`allergies\`) | Aba Paciente → seção "Dados Clínicos" | CRÍTICO — ícone de alerta vermelho (AlertTriangle). Previne reações anafiláticas. Deve ser consultado antes de qualquer prescrição. Exemplos: "Amoxicilina, látex, picada de abelha". |
| **Doenças Crônicas** (\`chronic_diseases\`) | Aba Paciente → seção "Dados Clínicos" | IMPORTANTE — ícone de alerta laranja. Informa condições pré-existentes que afetam protocolos de anestesia e medicação. Exemplos: "Diabetes mellitus, Leishmaniose, Hipotireoidismo". |
| **Microchip ID** (\`microchip_id\`) | Aba Paciente → seção "Dados Clínicos" | Identificação oficial ISO 11784/11785 (padrão 15 dígitos). Obrigatório para animais de companhia em muitos municípios. Permite rastreamento e prova de propriedade. |

### Como Cadastrar um Pet com Microchip
1. Abra o módulo **Pacientes** → clique em **"Novo Cadastro"** (ou Alt+N).
2. Na aba **Paciente**, preencha Nome, Espécie e Raça.
3. Role a tela até a seção **"Dados Clínicos"** (abaixo das Tags de Comportamento).
4. Informe as **Alergias** do animal no campo em destaque vermelho.
5. Informe **Doenças Crônicas** no campo em destaque laranja.
6. Digite o código do **Microchip ID** (15 dígitos padrão ISO).
7. Preencha a aba **Recepção** com os dados do tutor.
8. Clique em **"Criar Cadastro"** para salvar.

### UX Tips — Tricks for Speed
- **Busca por CPF do tutor**: Digitar o CPF localiza todos os pets vinculados àquele tutor.
- **Histórico acessível em múltiplos pontos**: A timeline do pet pode ser aberta da Recepção ("Feed"), do módulo Pacientes ("Ver Histórico"), e de outros pontos do sistema.
- **Comportamento**: Tags de comportamento (ex: "agressivo", "ansioso") aparecem em destaque no card do pet.
- **Alergias visíveis na triagem**: O campo de alergias será exibido em destaque vermelho na ficha de triagem para alertar o auxiliar antes de qualquer procedimento.

---

## MODULE 11 — WHATSAPP
<!-- AI-CONTEXT: Integrated WhatsApp channel. Manages conversations, sends notifications, and links contacts to tutors. -->

### Objective
Canal de WhatsApp integrado à clínica via Evolution API v2.x. Exibe conversas ativas, permite envio de mensagens e vincula contatos a tutores cadastrados.

### Connection States
| State | Description |
|---|---|
| \`open\` | Conectado — mensagens enviadas e recebidas normalmente |
| \`connecting\` | Reconectando — aguardar |
| \`close\` | Desconectado — escanear QR code |

### Happy Path — Conectar WhatsApp
1. **Acessar** \`/dashboard/whatsapp\`.
2. **QR Code** — Se estado for \`close\`, QR code aparece automaticamente.
3. **Escanear** com o WhatsApp Business do celular da clínica.
4. **Estado \`open\`** — Canal ativo, conversas sincronizadas.

### Happy Path — Responder Mensagem
1. **Lista de conversas** (painel esquerdo) — conversas ordenadas por última mensagem.
2. **Selecionar conversa** — painel de chat abre à direita (ou ocupa toda a tela em mobile).
3. **Campo de mensagem** → digitar → Enter ou botão enviar.
4. **Vinculação** (opcional) — Se contato não está vinculado a tutor, botão "Vincular Tutor" aparece no topo do chat.

### Mobile UX — Toggle de Visualização
Em telas < 1024px, o módulo WhatsApp exibe **um painel por vez** (lista OU chat):
- **Visualização padrão**: lista de conversas.
- **Ao clicar em uma conversa**: painel de chat ocupa toda a tela.
- **Botão "← Conversas"** (topo do chat): retorna à lista.

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"← Conversas"** (mobile) | Retorna à lista de conversas | Alterna \`mobileView: 'chat'\` → \`'list'\` |
| **"Vincular Tutor"** | Associa contato a tutor cadastrado | Atualiza mapping no banco |
| **Campo de mensagem** | Digitar e enviar mensagem | POST via Evolution API v2.x |
| **QR Code** | Escanear para conectar canal | Estado salvo via webhook \`QRCODE_UPDATED\` |

### Integration Notes
- **API**: Evolution API v2.x — endpoint \`/message/sendText/{instance}\`.
- **Webhook**: \`QRCODE_UPDATED\` salva QR code no banco para renderização.
- **LID Resolution**: contatos com \`@lid\` são resolvidos via \`fetchContacts\` antes do envio.

---

## MODULE 12 — MENTOR (AI ASSISTANT)
<!-- AI-CONTEXT: This is the Mentor module self-description — used when users ask "what can Mentor do?". -->

### Objective
Assistente de onboarding e ajuda contextual em tempo real. Localiza animais no sistema, inicia tours guiados e responde perguntas em linguagem natural (português).

### Capabilities
1. **Localizar animal**: "Cadê o Bituca?" / "Como está o Rex?" → busca no banco do dia → informa status e localização.
2. **Tour guiado**: "Como dou alta?" → inicia tour passo-a-passo com highlight de elementos UI.
3. **Navegação assistida**: "Me mostra a triagem" → redireciona + inicia tour.
4. **Voz**: Clique no microfone → fale a pergunta em pt-BR → Mentor processa.
5. **Base de conhecimento**: Responde qualquer dúvida sobre o sistema com base na documentação completa.

### Pet Search Patterns (input recognized)
- "Cadê o [nome]?"
- "Onde está o [nome]?"
- "Localiza o [nome]"
- "Qual o status do [nome]?"
- "Procura o [nome]"
- "Como está o [nome]?"
- "Como vai o [nome]?"
- "Tá bem o [nome]?"
- "Encontra o [nome]"
- "Busca o [nome]"

### Available Tours
| Tour ID | Label | Module Path | What it Shows |
|---|---|---|---|
| \`recepcao\` | Recepção | \`/dashboard/reception\` | Check-in, agendamento e fila de espera |
| \`sala-espera\` | Sala de Espera | \`/dashboard/reception\` | Fila e novo check-in |
| \`triagem\` | Triagem | \`/dashboard/triage\` | Fila, voz, concluir triagem |
| \`consulta\` | Consultório | \`/dashboard/vet\` | Gravação, SOAP, salvar prontuário |
| \`exames\` | Exames | \`/dashboard/exams\` | Fila de exames, registrar resultado |
| \`internacao\` | Internação | \`/dashboard/hospitalization\` | Lista internados, dar alta hospitalar |
| \`grooming\` | Banho & Tosa | \`/dashboard/grooming\` | Fila kanban, registro por voz |
| \`alta\` | Alta | \`/dashboard/reception\` | Quadro kanban, coluna de alta |
| \`cadastro-pet\` | Cadastro de Pet | \`/dashboard/patients\` | Formulário de cadastro de novo pet |

### Intent Keywords → Tour Mapping
| Keywords | Tour Activated |
|---|---|
| alta, liberar, finalizar consulta, prontuário | \`alta\` |
| triagem, sinais vitais, peso, temperatura | \`triagem\` |
| recepção, check-in, chegou, fila | \`recepcao\` |
| agendar, agendamento, marcar consulta, consulta futura | \`recepcao\` |
| consulta, veterinário, soap, diagnóstico | \`consulta\` |
| exame, laboratório, laudo, resultado | \`exames\` |
| internação, internar, hospitalizar, UTI, UTA, U.T.A | \`internacao\` |
| banho, tosa, grooming, tosador | \`grooming\` |
| cadastro, novo pet, registrar animal | \`cadastro-pet\` |

---

## MOBILE & RESPONSIVE SUPPORT
<!-- AI-CONTEXT: Describes how each module adapts to mobile screens (< 640px). Updated in v1.1.0. -->

O VetMax foi projetado para funcionar em celulares e tablets sem perda de funcionalidade.
Todos os módulos passaram por auditoria responsiva (2026-05). As adaptações por módulo:

### Padrões Responsivos Aplicados (Tailwind CSS v4)

| Componente | Problema Anterior | Correção |
|---|---|---|
| \`triage/[id]/page.tsx\` | \`px-6\` fixo → conteúdo cortado em mobile | \`px-3 sm:px-6 py-6 sm:py-8\` |
| \`TriageForm.tsx\` | \`grid-cols-2\` → campos sobrepostos | \`grid-cols-1 sm:grid-cols-2\` |
| \`CashierPageClient.tsx\` | Tabs do Caixa sem scroll → overflow oculto | \`overflow-x-auto\` no wrapper + \`hidden sm:inline\` nos labels |
| \`ManagementWorkspace.tsx\` | Dados da clínica em 2 colunas → quebrava | \`grid-cols-1 sm:grid-cols-2\` |
| \`MentorButton.tsx\` | Botão fora da tela em mobile | \`bottom-4 right-4 sm:bottom-6 sm:right-6\` |
| \`ConversationsPageClient.tsx\` | Painel lado a lado → ilegível | Toggle mobile list/chat + botão "← Conversas" |
| \`CheckoutWorkspace.tsx\` | InvoiceCard horizontal → sobreposição | \`flex-col sm:flex-row\` no wrapper |

---

## CROSS-MODULE PATTERNS
<!-- AI-CONTEXT: These patterns apply system-wide and should inform all answers about system behavior. -->

### Realtime Sync
- Todas as filas atualizam automaticamente via Supabase Realtime.
- Usuário nunca precisa recarregar a página para ver novos animais na fila.

### Multi-tenancy
- Toda operação é isolada por \`clinic_id\`.
- Dados de uma clínica nunca aparecem em outra.

### WhatsApp Integration
- Notificações WhatsApp são **sugeridas** (não automáticas) em pontos-chave:
  - Chamada para triagem
  - Mudança de status na internação
  - Animal pronto no Grooming
  - Alta hospitalar

### Role-Based Access
| Role | Key Permissions |
|---|---|
| \`admin\` | Acesso total, incluindo Gestão |
| \`vet\` | Consultório, Farmácia, Exames, Internação |
| \`assistant\` | Triagem, Grooming, Internação |
| \`receptionist\` | Recepção, Caixa |
| \`manager\` | Caixa, relatórios |
| \`accountant\` | Caixa apenas |

### Status Flow (Consultation Lifecycle)
\`\`\`
reception → triage → in_progress → waiting_exam → in_progress → completed
                                 ↘ medication → completed
                                 ↘ hospitalized → revisao_pos_internacao → completed
\`\`\`

### CFMV Compliance Rules
1. Triagem exige \`weight_kg\` + \`temperature_rectal\` (campos obrigatórios).
2. Consultório exige \`is_reviewed_by_vet = true\` antes de alta.
3. Medicamentos controlados exigem sinalização "Receituário Azul".
4. Prontuário deve registrar CRM-V do MV responsável.

---

## FAQ — COMMON USER QUESTIONS
<!-- AI-CONTEXT: Use these Q&A pairs to answer frequent user questions directly without needing to search. -->

**Q: Como faço check-in de um animal?**
A: Na Recepção, busque o tutor pelo CPF ou nome no campo "Busca Inteligente", selecione o pet e clique em "Check-in". O animal aparecerá na fila de espera automaticamente.

**Q: Como fazer um agendamento? / Como agendar uma consulta?**
A: Na Recepção, busque o tutor e selecione o pet. Clique em **"Agendar"** (não "Check-in") — isso abre o modal de agendamento onde você escolhe a data e horário. O sistema cria a consulta com status \`scheduled_future\` e ela aparece no calendário. Para Banho & Tosa, use o botão "📅 Agendar B&T".
TOUR_ID:recepcao

**Q: Como agendar banho e tosa?**
A: Na Recepção, busque o tutor e pet, depois clique em **"📅 Agendar B&T"**. Escolha o serviço (banho, tosa ou ambos), selecione data e horário disponível, e confirme. O agendamento aparecerá no módulo Grooming na coluna "Agendados".

**Q: Como ver os agendamentos futuros?**
A: Na Recepção, os agendamentos futuros aparecem em destaque no calendário. No módulo Grooming, a coluna "Agendados" lista os serviços de banho/tosa marcados. Também é possível ver via módulo Pacientes → "Ver Histórico" do pet.

**Q: Como cancelo um agendamento?**
A: Para consultas: na Recepção, localize o agendamento e exclua ou altere o status. Para banho/tosa: no módulo Grooming, clique no card e use "Cancelar Sessão".

**Q: O animal sumiu da fila — o que aconteceu?**
A: Provavelmente foi encaminhado para a próxima etapa. Use o Mentor para localizar: "Cadê o [nome do animal]?" ou "Como está o [nome]?" — ele informa em qual módulo está.

**Q: Como dou alta a um animal?**
A: No Consultório, abra a consulta do animal, preencha o prontuário SOAP, marque o checkbox "Revisado pelo MV" e clique em "Dar Alta". O status muda para \`completed\`.
TOUR_ID:alta

**Q: Como saber onde está determinado pet no sistema?**
A: Pergunte ao Mentor: "Cadê o [nome]?" ou "Como está o [nome]?" — o assistente consulta o banco em tempo real e responde com o módulo onde o pet está e seu status atual.

**Q: Como registro o resultado de um exame?**
A: No módulo Exames, clique no card do animal na fila ou use "Registrar Resultado" → preencha o laudo na textarea → salve. O animal retorna ao fluxo.
TOUR_ID:exames

**Q: Como adicionar um novo medicamento ao estoque?**
A: Na Farmácia, clique "+ Adicionar Medicamento", preencha nome, quantidade, unidade e estoque mínimo, e salve.

**Q: Como dispenso um medicamento?**
A: Na Farmácia, busque o medicamento pelo nome, clique em "Dispensar", informe a quantidade no modal e confirme. O estoque é atualizado automaticamente e o movimento é registrado.

**Q: Como repor o estoque de um medicamento?**
A: Na Farmácia, localize o item, clique em "Reposto", informe a quantidade recebida e confirme. O log de entrada é registrado automaticamente.

**Q: Como registro um pagamento de consulta?**
A: No Caixa Central, acesse a aba **"Recebimentos"**, localize a fatura do atendimento e clique em "Registrar Pagamento". Selecione a forma de pagamento (dinheiro, cartão, PIX ou convênio) e confirme.

**Q: Como abro o caixa do dia?**
A: No Caixa Central, acesse a aba **"Sessão"** e clique em "Abrir Caixa". Informe o saldo inicial e confirme. Todos os pagamentos do dia serão registrados automaticamente nessa sessão.

**Q: Como convidar um novo funcionário?**
A: Na Gestão → aba "Usuários" → "Convidar" → informe o email e selecione o perfil (MV, Auxiliar, Recepcionista, etc.). O sistema envia o convite por email.

**Q: Por que não consigo fechar a consulta?**
A: A consulta não fecha sem o checkbox "Revisado pelo MV" marcado. Esse campo é obrigatório por lei (CFMV). Se o MV não assinou, o sistema bloqueia a alta.

**Q: Como ativo o módulo de Banho & Tosa?**
A: Na Gestão → aba "Clínica" → toggle do módulo "Grooming" → salvar. O módulo aparecerá no menu lateral imediatamente.

**Q: Como o pagamento do Banho & Tosa funciona?**
A: Ao arrastar o card do animal para a coluna "Entregue" no módulo Grooming, um modal de pagamento aparece. Ao confirmar, o valor é automaticamente lançado no Caixa Central.

**Q: Posso usar voz em qual módulo?**
A: Sim, em três módulos: **Triagem** (sinais vitais), **Consultório** (anamnese e SOAP) e **Banho & Tosa** (observações do serviço). Clique no ícone de microfone em cada um. O Mentor também aceita perguntas por voz.

**Q: O VetMax funciona em celular?**
A: Sim. Todos os módulos têm layout responsivo testado em iPhone SE (375px) até iPad Pro (1024px). O menu lateral, grids de formulários, tabs e painéis se adaptam automaticamente à largura da tela.

**Q: No WhatsApp, como vejo o chat em telas pequenas?**
A: Em telas menores que 1024px, toque na conversa desejada na lista para abrir o chat em tela cheia. Para voltar à lista de conversas, toque em "← Conversas" no topo.

**Q: O botão do Mentor some em celular?**
A: Não. Em telas pequenas o botão se reposiciona para \`bottom-4 right-4\` (mais próximo da borda). O popover de opções ocupa quase toda a largura da tela para facilitar o toque.

**Q: Onde fica o tour de Cadastro de Pet?**
A: O Mentor possui um tour \`cadastro-pet\` que guia o cadastro em \`/dashboard/patients\`. Para acioná-lo, pergunte ao Mentor: "Como cadastro um novo pet?" ou "Registrar animal".
TOUR_ID:cadastro-pet

**Q: Como cadastro um novo pet?**
A: Acesse o módulo **Pacientes** e clique em "+ Novo Pet". Preencha nome, espécie, raça, data de nascimento, alergias e doenças crônicas. Vincule a um tutor existente. O Mentor pode guiar cada campo com o tour de cadastro.
TOUR_ID:cadastro-pet

**Q: O que acontece após a triagem?**
A: Após concluir a triagem (salvar peso, temperatura e demais dados), o pet é automaticamente encaminhado para a fila do Consultório (status muda para \`in_progress\`). O MV verá o animal em sua fila em tempo real.

**Q: Como faço para o pet ir direto para a triagem sem check-in?**
A: Na Triagem, use o botão **"+ Adicionar Paciente"** para incluir um animal diretamente na fila de triagem, sem precisar passar pela recepção. Útil para emergências.

**Q: Como internar um animal?**
A: No Consultório, após avaliar o pet, clique em **"Encaminhar Internação"**. Isso cria um registro em \`hospitalizations\` e move o animal para o Kanban de Internação, iniciando na coluna "Observação".
TOUR_ID:internacao

**Q: Como dar alta hospitalar?**
A: No Kanban de Internação, arraste o card do animal para a coluna **"Pronto para Alta"** e confirme. O sistema gera o laudo de alta e o animal é encaminhado para o processo de pagamento no Caixa.

**Q: Como o WhatsApp se integra ao fluxo clínico?**
A: O WhatsApp envia notificações **sugeridas** (não automáticas) em momentos-chave: ao chamar o pet para triagem, ao mudar de status na internação, quando o pet está pronto no Grooming, e na alta hospitalar. O sistema sugere a mensagem pré-formatada — a recepcionista confirma antes de enviar.

**Q: Por que o WhatsApp não está enviando mensagens?**
A: Verifique: 1) Se o estado é \`open\` no módulo WhatsApp (ícone verde no menu). 2) Se o número está corretamente vinculado ao tutor. 3) Se o servidor da Evolution API está rodando. Se o estado for \`close\`, escaneie o QR code novamente.

**Q: Qual a diferença entre "Alta" e "Alta Hospitalar"?**
A: **Alta** (módulo Consultório) = encerramento de uma consulta clínica comum — o pet vai para casa após a consulta. **Alta Hospitalar** (módulo Internação) = encerramento de um período de internação — o pet estava hospitalizado. Ambas geram cobrança no Caixa.

**Q: Como vejo o histórico completo de um pet?**
A: No módulo Pacientes, busque o pet e clique em **"Ver Histórico"**. Uma timeline completa exibe todas as consultas, exames, internações e sessões de grooming em ordem cronológica. Também acessível na Recepção via botão "Feed" no card do pet.

**Q: O que é o \`data-mentor-step\`?**
A: É um atributo HTML nos elementos interativos da UI que o Mentor usa para posicionar o spotlight (destaque) exatamente sobre o botão ou campo relevante de cada passo do tour. O Mentor **sempre** ilumina o elemento antes de exibir a mensagem explicativa.

**Q: Como ativo o módulo de Farmácia?**
A: Na Gestão → aba "Clínica" → toggle do módulo "Farmácia" → salvar. Apenas \`admin\` e \`vet\` terão acesso ao módulo após ativado.

**Q: O sistema avisa quando o estoque está baixo?**
A: Sim. Na Farmácia, medicamentos com quantidade abaixo do mínimo aparecem com badge 🔴 (crítico) ou 🟡 (atenção). Use o filtro "Crítico" para ver apenas os que precisam de reposição urgente.

**Q: Como funciona o relatório financeiro?**
A: No Caixa Central, aba **"Visão Geral"**, você vê em tempo real: total de entradas, saídas e saldo do dia. Para um resumo completo, feche o caixa na aba "Sessão" — o sistema totaliza todas as transações do dia.

**Q: Posso atender sem abrir o caixa?**
A: Sim, o fluxo clínico (recepção, triagem, consultório) funciona independentemente do caixa. No entanto, o pagamento das faturas só pode ser registrado após abrir a sessão do caixa.

---

## MODULE 13 — CONCILIAÇÃO DE CONVÊNIOS (PETLOVE)
<!-- AI-CONTEXT: Módulo opt-in. Só aparece quando 'petlove_reconciliation' está ativo em Gestão > Acesso. -->

### O que é
Conciliação de Convênios é a rotina que **importa a planilha mensal da Petlove** (arquivo .xlsx que a Petlove envia para a clínica) e faz automaticamente:
- Cadastra pets e tutores novos que aparecem na planilha mas não estão no sistema
- Lança os títulos no Contas a Receber (1 título por procedimento, vinculado ao tutor e ao pet correto)
- Identifica e ajusta divergências de valor (drift) centavo a centavo
- Cria os procedimentos no estoque automaticamente (com valor zero — preço real fica por pet)
- Atualiza o plano do pet quando a planilha indica que mudou ("Leve" → "Ideal" etc)
- Fixa o preço de cada procedimento por pet (sugerido automaticamente no próximo atendimento)
- Marca o bônus de indicação Petlove como receita avulsa
- Cria lançamentos retroativos quando a recepção esqueceu de marcar um atendimento

### Onde encontrar
**Financeiro › 🐾 Conciliação Petlove** (tab roxa à direita das tabs normais)
URL direta: \`/dashboard/financial/insurance-reconciliation\`

### Pré-requisitos
1. Módulo **"Conciliação Petlove"** ativo em Gestão › Configurações › Acesso (toggle protegido por Master Key)
2. Pelo menos **uma conta bancária** cadastrada em Financeiro › Cadastros › Bancos (de preferência marcada como **padrão**)
3. Permissão de admin / owner / manager

### Fluxo de uso passo a passo
1. **Importar a planilha**: arraste o arquivo .xlsx da Petlove na área roxa. Em ~2 segundos, a remessa entra no histórico.
2. **Revisar**: clique no botão **"Revisar →"** ao lado da remessa importada.
3. **Conferir os totais**: o painel "Pets na remessa" mostra quantos já cadastrados, quantos a cadastrar e total distinto.
4. **(Opcional) Mapear procedimentos**: se aparecer banner roxo "Mapeamento Necessário", clique e vincule cada procedimento ao estoque (ou deixe em branco para auto-criar como serviço novo com valor zero).
5. **Aprovar Conciliação**: clique no botão verde sticky no rodapé (ou ⌘+Enter). O pipeline autônomo executa tudo:
   - Roda matching de chips e nomes
   - Cria pets e tutores faltantes em lote (bulk auto-register)
   - Roda matching de novo
   - Cria 1 financial_entry individual por linha (vinculado a tutor + pet)
   - Lança bank_statement na conta padrão (aparece em Extrato)
   - Fixa patient_custom_prices (1 por pet × procedimento)
   - Atualiza pet_insurance.plan_type quando mudou
   - Cria bônus de indicação como título avulso
6. **Confete** + dialog de sucesso com botões "Ver Títulos em A Receber" e "Voltar para Remessas".

### Onde ver o resultado
- **Títulos individuais**: Financeiro › Contas a Receber. Descrição inclui pet + tutor, ex: "Petlove · Vacina V10 · Snow (Armando) · 02/03/2026".
- **Movimentações no Extrato**: Financeiro › Extrato. Selecione a conta bancária padrão e o período.
- **Pets criados**: Pacientes. Pets criados via importação têm banner amarelo "Cadastro rápido via Petlove" alertando sobre campos faltantes (sexo, data de nascimento, peso). CPF e telefone do tutor recebem placeholder.
- **Preços fixados por pet**: clique no pet (Editar) → aba **Convênio** (escudo). Mostra bloco roxo "Preços do Convênio fixados neste pet" com cada procedimento e valor.
- **Histórico do pet**:
  - No modal Editar → aba Convênio → bloco "Histórico do Convênio"
  - No Feed do pet (botão verde "Histórico") → cards roxos com 🐾

### Excluir / re-importar
Botão lixeira ao lado de "Revisar →" abre modal de confirmação. Para remessas conciliadas, apaga em cascade:
- Os títulos financeiros criados
- As baixas no extrato bancário
- Os preços fixados que vieram daquela remessa
- Os eventos do histórico vinculados

**Pets e tutores criados permanecem** (você editou os dados, não queremos perder isso).

### Bônus de indicação
Aparece no cabeçalho "Resumo Contas Médicas" da planilha. Vira um título avulso com source='petlove_indicacao' e category='Convênios · Petlove', sem vínculo a pet/tutor específico.

### Limitações conhecidas
- A planilha não traz sexo, data de nascimento, peso e alergias do pet → cadastros rápidos precisam ser completados na próxima visita
- O tutor entra sem CPF real (placeholder PL-...) e sem telefone — banner amarelo no perfil avisa
- Drift de valor acima de 15% é classificado como "Divergência" mas o sistema realiza o ajuste mesmo assim no valor da planilha

### Convênios suportados hoje
Atualmente apenas **Petlove**. Outros convênios podem ser adicionados estendendo o parser.

---

*END OF VETMAX_KNOWLEDGE_BASE — Version 1.3.0*
`
