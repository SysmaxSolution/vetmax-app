# VETMAX_KNOWLEDGE_BASE
<!-- AI-CONTEXT: This document is the authoritative knowledge base for the VetMax Mentor AI.
     Use this file to answer any natural language question about system workflows, module usage,
     UI actions, inter-module relationships, and user tips. -->

**version**: 1.0.0
**last-updated**: 2026-04-26
**scope**: All active VetMax modules — Recepção, Triagem, Consultório, Exames, Internação, Banho & Tosa, Caixa Central, Gestão, Farmácia, Pacientes, Mentor
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

---

## GLOBAL FLOW — PATIENT JOURNEY
<!-- AI-CONTEXT: This is the master flow. Every module is a node in this journey. -->

```
[TUTOR CHEGA]
     │
     ▼
┌─────────────┐
│  RECEPÇÃO   │  ← Check-in, cadastro, agendamento
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
```

---

## MODULE 01 — RECEPÇÃO
<!-- AI-CONTEXT: Entry point for all patient visits. Manages queue, check-in, and scheduling. -->

### Objective
Registrar a chegada do animal, criar ou localizar o cadastro do tutor e do pet, efetuar check-in e encaminhar para triagem.

### Happy Path (step-by-step)
1. **Buscar tutor** — Digitar CPF, nome do tutor, ou nome do pet na "Busca Inteligente" (debounce 300ms).
2. **Selecionar pet** — O sistema lista os pets vinculados ao tutor encontrado.
3. **Check-in** — Clicar "Check-in" → modal abre → confirmar animal e motivo da consulta.
4. **Fila de espera** — Animal aparece na fila em tempo real (Supabase Realtime).
5. **Chamar para triagem** — Quando triagem disponível, clicar "Chamar Triagem →" no card do animal.
6. **WhatsApp (opcional)** — Sistema sugere notificação ao tutor via WhatsApp após encaminhar.

### Inter-Module Relationships
- **Entrada:** Início do fluxo — nenhuma etapa anterior.
- **Saída:** → **Triagem** (via "Chamar Triagem →")
- **Paralelo:** Pode agendar consulta futura (sem check-in imediato) → aparece em calendário.

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"Busca Inteligente"** (campo de busca) | Localiza tutor por CPF, nome ou nome do pet | Consulta `profiles` + `patients` |
| **"Novo Cadastro"** (Alt+N) | Abre modal para criar novo tutor + pet | Grava em `tutors` + `patients` |
| **"Check-in"** | Inicia atendimento para o pet selecionado | Cria registro em `consultations` (status: `reception`) |
| **"Agendar"** | Agenda consulta futura | Cria `consultations` (status: `scheduled_future`) |
| **"Feed"** | Abre timeline histórica do pet | Leitura de `consultations`, `exams`, `hospitalizations` |
| **"Chamar Triagem →"** | Move animal para fila de triagem | Atualiza `consultations.status` → `triage` |
| **"✂️ Check-in B&T"** | Check-in direto para Banho & Tosa (se módulo ativo) | Cria `grooming_sessions` |
| **"📅 Agendar B&T"** | Agenda serviço de banho/tosa | Cria `grooming_sessions` (status: `agendado`) |

### UX Tips — Tricks for Speed
- **CPF = preenchimento automático**: Digite apenas o CPF no campo de busca para auto-preencher todos os dados do tutor.
- **Tecla Alt+N**: Abre "Novo Cadastro" instantaneamente sem usar o mouse.
- **Realtime**: A fila atualiza automaticamente — não é necessário recarregar a página.
- **Check-in pelo nome do pet**: Não precisa saber o CPF do tutor — o sistema encontra pelo nome do animal.

---

## MODULE 02 — TRIAGEM
<!-- AI-CONTEXT: Clinical intake by nursing staff. Captures vital signs before veterinarian consultation. -->

### Objective
Coletar sinais vitais (peso, temperatura, queixa principal), avaliar urgência e encaminhar o animal para o consultório do MV.

### Happy Path (step-by-step)
1. **Visualizar fila** — Aba "Fila de Espera" mostra animais vindos da Recepção.
2. **Abrir ficha** — Clicar no card do animal → abre rota `/dashboard/triage/[id]`.
3. **Preencher sinais vitais** — Peso (kg), temperatura retal (°C), frequência cardíaca (bpm), queixa principal.
4. **Gravação por voz** — Clicar no microfone → falar os dados → IA preenche os campos automaticamente.
5. **Concluir triagem** — Clicar "Salvar" → animal vai para fila do Consultório.
6. **Histórico** — Aba "Histórico de Hoje" mostra triagens concluídas.

### Inter-Module Relationships
- **Entrada:** ← **Recepção** (status `triage`)
- **Saída:** → **Consultório** (status `in_progress`)
- **Dados passados adiante:** `weight_kg`, `temperature_rectal`, `heart_rate`, `chief_complaint`, `urgency_level`

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Aba "Fila de Espera"** | Mostra animais aguardando triagem | Leitura `consultations` (status=`triage`) |
| **Aba "Histórico de Hoje"** | Triagens concluídas no dia | Leitura `triage_records` finalizados |
| **Card do animal (clique)** | Abre formulário detalhado de triagem | Navega para `/dashboard/triage/[id]` |
| **"+ Adicionar Paciente"** | Adiciona animal manualmente à fila (sem check-in prévio) | Cria `triage_records` direto |
| **Microfone (voz)** | Reconhecimento de voz pt-BR para sinais vitais | Transcreve e preenche campos via IA |
| **"Encaminhar para Consultório"** | Finaliza triagem e envia para MV | Atualiza status → `in_progress` |
| **"Editar Triagem"** | Corrige dados de triagem já concluída | Navega `/dashboard/triage/[id]?edit=true` |

### CFMV Compliance
- **Campos obrigatórios**: `weight_kg` e `temperature_rectal` — o sistema bloqueia envio sem esses dados.
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
1. **Fila** — MV vê animais com triagem concluída (status `in_progress`).
2. **Abrir consulta** — Clicar no card → abre `/dashboard/vet/[id]`.
3. **Gravar por voz** — Clicar "Iniciar Gravação" → falar anamnese completa → IA gera rascunho SOAP.
4. **Revisar prontuário** — Ajustar texto gerado nas seções S, O, A, P.
5. **Marcar responsabilidade** — Checkbox `is_reviewed_by_vet` (obrigatório por lei — CFMV).
6. **Salvar e definir destino:**
   - **Alta**: status → `completed`
   - **Exame**: status → `waiting_exam`
   - **Medicação**: status → `medication`
   - **Internação**: cria `hospitalizations` + status vira `hospitalized`

### Inter-Module Relationships
- **Entrada:** ← **Triagem** (status `in_progress`) ou retorno de **Internação** (status `revisao_pos_internacao`)
- **Saídas possíveis:**
  - → **Exames** (status `waiting_exam`)
  - → **Internação** (via criação de `hospitalizations`)
  - → **Caixa** (status `completed` → invoice gerada)
  - → **Retorno**: Pós-internação revisão

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"Iniciar Gravação"** | Microfone para ditado da anamnese | Speech-to-text → gera SOAP via IA |
| **Seção SOAP** | Campos editáveis S/O/A/P | Grava em `consultations.soap_*` |
| **Checkbox `is_reviewed_by_vet`** | Assina prontuário digitalmente | Obrigatório — bloqueia alta sem marcar |
| **"Solicitar Exame"** | Cria requisição de exame | Atualiza status → `waiting_exam`, cria `exam_requests` |
| **"Encaminhar Internação"** | Admite animal na internação | Cria `hospitalizations`, atualiza status |
| **"Dar Alta"** | Finaliza consulta | Status → `completed`, aciona faturamento |
| **"Editar Consulta"** (histórico) | Reabre prontuário já salvo para adição de notas | Atualiza `consultations` |

### CFMV Compliance
- **`is_reviewed_by_vet`** deve ser `true` antes de qualquer alta — sistema bloqueia sem essa confirmação.
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
1. **Fila de exames** — Animais com status `waiting_exam` aparecem automaticamente.
2. **Abrir exame** — Clicar no card → `/dashboard/exams/[id]` ou botão "Iniciar Exame".
3. **Processar** — Realizar procedimento laboratorial/de imagem.
4. **Registrar resultado** — Clicar "Registrar Resultado" → textarea para laudo/achados.
5. **Salvar** — Animal retorna ao fluxo (MV recebe notificação via realtime).

### Inter-Module Relationships
- **Entrada:** ← **Consultório** (status `waiting_exam`)
- **Saída:** → **Consultório** (MV retoma consulta com resultado disponível)
- **Paralelo:** Farmácia pode ser acessada independentemente para medicamentos

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Aba "Fila de Exames"** | Requisições pendentes | Leitura `consultations` (status=`waiting_exam`) + `exam_requests` |
| **Aba "Histórico de Hoje"** | Exames concluídos | Leitura `exams` finalizados |
| **"+ Solicitar Exame"** | Requisição manual (sem consulta ativa) | Cria `exam_requests` |
| **Card do exame (clique)** | Abre formulário do exame | Navega `/dashboard/exams/[id]` |
| **"Registrar Resultado"** | Modal para laudo em texto livre | Grava em `exams.result` + atualiza status |
| **"Editar Exame"** | Corrige resultado já registrado | Navega `/dashboard/exams/[id]` |

### Exam Types (dropdown options)
`hemogram` | `urinalysis` | `xray` | `ultrasound` | `biochemistry` | `culture` | `other`

### UX Tips — Tricks for Speed
- **Tempo de espera**: Cada card mostra o tempo decorrido desde a requisição — priorize por urgência.
- **Resultado inline**: Use o botão "Registrar Resultado" diretamente na lista sem precisar abrir a rota `/[id]`.
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
6. **Pós-internação** — Opcional: enviar para revisão com MV (status `revisao_pos_internacao`).

### Kanban Columns
| Column | Icon | Status | Description |
|---|---|---|---|
| **Observação** | 👁️ | `observation` | Monitoramento inicial |
| **Enfermaria** | 🏥 | `ward` | Estável, cuidados de rotina |
| **UTI** | 🚨 | `icu` | Cuidados intensivos |
| **Pronto para Alta** | 🏠 | `ready_for_discharge` | Liberado clinicamente |

### Inter-Module Relationships
- **Entrada:** ← **Consultório** (MV solicitou internação)
- **Saídas:**
  - → **Consultório** (revisão pós-internação, status `revisao_pos_internacao`)
  - → **Caixa** (cobrança dos dias internados)

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Drag & Drop (cards)** | Move animal entre colunas | Atualiza `hospitalizations.status` + loga transição |
| **"+ Admitir"** | Admite novo animal sem passar pelo Consultório | Cria `hospitalizations` |
| **Card (clique)** | Abre modal de detalhe com histórico | Exibe `hospitalization_logs` |
| **"Adicionar Nota"** | Registro de evolução diária | Grava em `hospitalization_logs` |
| **"Dar Alta"** (ao mover para última coluna) | Confirma alta e gera laudo | Gera discharge summary, atualiza status |
| **"Revisão MV"** | Envia para revisão pós-internação | Status → `revisao_pos_internacao` |
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
7. **Entrega** — Mover para ✅ Entregue → modal de pagamento → `cashier_entries` criado automaticamente.

### Kanban Columns
| Column | Icon | Status | Trigger |
|---|---|---|---|
| **Agendados** | 📅 | `scheduled` | Agendamento feito |
| **Recebido** | 📋 | `received` | Animal chegou |
| **Em Banho** | 🛁 | `bathing` | Serviço iniciado |
| **Em Tosa** | ✂️ | `grooming` | Tosa em andamento |
| **Aguardando Retirada** | ⏳ | `waiting_pickup` | Serviço finalizado |
| **Entregue** | ✅ | `delivered` | Animal retirado + pago |

### Inter-Module Relationships
- **Entrada:** ← **Recepção** (check-in B&T ou agendamento B&T)
- **Saída:** → **Caixa** (pagamento via `finishGroomingSessionAndRecord()` ao mover para "Entregue")

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Drag & Drop** | Move sessão entre etapas | Atualiza `grooming_sessions.status` |
| **"Confirmar Chegada"** | Marca animal como recebido | Status → `received` |
| **"Cancelar Sessão"** | Cancela agendamento | Status → `cancelled`, abre modal de confirmação |
| **Card (clique)** | Detalhe da sessão (serviços, preço, notas) | Exibe modal com `grooming_sessions` completo |
| **"Entregar"** (ao mover para ✅) | Confirma entrega + pagamento | Cria `cashier_entries` com valor do serviço |
| **WhatsApp (sugestão)** | Notifica tutor de prontidão | Após mover para "Aguardando Retirada" ou "Entregue" |

### UX Tips — Tricks for Speed
- **Pagamento automático**: Ao arrastar para "Entregue", o pagamento já é registrado no Caixa — sem etapa extra.
- **WhatsApp integrado**: Notificação ao tutor sobre prontidão do animal é sugerida automaticamente.
- **Agenda visual**: Use o `/dashboard/grooming/schedule` para visão de calendário de agendamentos futuros.

---

## MODULE 07 — CAIXA CENTRAL (CASHIER)
<!-- AI-CONTEXT: Financial hub. Manages payments, invoices, expenses, and daily cash sessions. -->

### Objective
Centralizar o controle financeiro: registrar pagamentos de consultas e serviços, controlar saídas de caixa, emitir relatórios e gerenciar a sessão diária do caixa.

### Happy Path — Receber Pagamento de Consulta
1. **Aba "Recebimentos"** → lista faturas pendentes de consultas finalizadas.
2. **"Registrar Pagamento"** → modal com valor, forma de pagamento, data.
3. **Confirmar** → `invoices.status` → `paid`, `cashier_entries` criado.

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
  - **Consultório** → consultas finalizadas geram `invoices`
  - **Grooming** → entrega do pet registra pagamento automaticamente
  - **Internação** → dias de internação geram cobrança
- **Não alimenta** outros módulos (terminal do fluxo financeiro).

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **"Registrar Pagamento"** (fatura) | Paga fatura de consulta | `invoices.status` → `paid` + `cashier_entries` |
| **"+ Adicionar Saída"** | Registra despesa (insumos, serviços) | Cria `cashier_outflows` |
| **"Abrir Caixa"** | Inicia sessão financeira do dia | Cria `cashier_sessions` |
| **"Fechar Caixa"** | Encerra sessão e totaliza | Atualiza `cashier_sessions.closed_at` + totais |
| **"Atualizar"** (refresh) | Recarrega todos os dados | Consulta todas as tabelas financeiras em paralelo |

### Roles with Access
`admin` | `owner` | `manager` | `accountant` | `receptionist`

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
- **Acesso exclusivo**: role = `admin`
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
| **Toggle módulos** (aba Clínica) | Ativa/desativa módulos (Grooming, Farmácia, etc.) | Atualiza `clinics.active_modules[]` |
| **"Convidar"** | Envia convite por email com role definido | Cria `invitations` + email automático |
| **Editar CRM-V | Valida e salva CRM-V do MV | Atualiza `profiles.crmv` |
| **"Upload Logo"** | Faz upload da logo da clínica | Salva em Supabase Storage + atualiza `clinics.logo_url` |
| **"+ Novo Template"** | Cria modelo de documento | Cria `document_templates` |
| **"Importar CSV"** (catálogo) | Importação em massa de produtos | Bulk insert em `catalog` |
| **Horário de Atendimento** | Define dias/horas de funcionamento | Atualiza `clinic_config.business_hours` |

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
- **Roles**: `admin` | `vet` apenas

### Happy Path — Dispensar Medicamento
1. **Localizar** — Buscar pelo nome do medicamento.
2. **Verificar estoque** — Card mostra quantidade atual vs. mínimo.
3. **"Dispensar"** — Modal → quantidade dispensada → confirmar.
4. **Log automático** — Movimento registrado com timestamp.

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
| **"+ Adicionar Medicamento"** | Cadastra novo item no estoque | Cria em `stock_items` (v2) + `pharmacy_stock` (legado) |
| **"Reposto"** | Incrementa quantidade | `stock_items.quantity += n` + log de reposição |
| **"Ajustar"** | Define quantidade exata (inventário) | `stock_items.quantity = n` |
| **"Dispensar"** | Decrementa quantidade | `stock_items.quantity -= n` + log de dispensação |
| **"Deletar"** | Remove item do estoque | Soft delete em `stock_items` |

### UX Tips — Tricks for Speed
- **Filtro "Crítico"**: Use para ver rapidamente o que precisa de reposição urgente.
- **Unidades suportadas**: ml, mg, comprimido, frasco, unidade, ampola, cápsula.
- **Duplo banco**: Sistema mantém compatibilidade com tabela legada `pharmacy_stock` — ambas são atualizadas.

---

## MODULE 10 — PACIENTES (PATIENTS)
<!-- AI-CONTEXT: Master directory of all pets in the clinic. Search, edit registrations, view history. -->

### Objective
Diretório completo de pets cadastrados na clínica. Permite busca, edição de cadastro, visualização de histórico de consultas/exames/internações e adição de novos pets.

### Happy Path — Ver Histórico de um Pet
1. **Buscar** — Digitar nome do pet, tutor, CPF ou raça no campo de busca.
2. **Card do pet** — Mostra espécie 🐶🐱🦎, raça, sexo, idade calculada, status de castração, tutor.
3. **"Ver Histórico"** — Abre `PetTimelineModal` com todos os atendimentos em ordem cronológica.

### UI Dictionary — Buttons & Actions
| Button / Action | Function | System Impact |
|---|---|---|
| **Campo de busca** (debounce 150ms) | Localiza pets por nome, tutor, CPF, raça | Consulta `patients` + `tutors` |
| **"+ Novo Pet"** | Cadastra novo pet vinculado a tutor existente | Cria em `patients`, vincula a `tutors` |
| **"Editar Cadastro"** | Abre modal de edição do pet | Atualiza `patients` |
| **"Ver Histórico"** | Timeline completa do pet | Leitura `consultations` + `exams` + `hospitalizations` + `grooming_sessions` |

### Pet Registration Fields
`name` | `species` (dog/cat/other) | `breed` | `gender` | `birth_date` | `photo_url` | `allergies` | `chronic_diseases` | `behavior_tags` | `neutered` | `microchip_id`

### Campos Clínicos do Pet — Detalhamento (aba "Paciente")

| Campo | Localização no Modal | Importância Clínica |
|---|---|---|
| **Alergias** (`allergies`) | Aba Paciente → seção "Dados Clínicos" | CRÍTICO — ícone de alerta vermelho (AlertTriangle). Previne reações anafiláticas. Deve ser consultado antes de qualquer prescrição. Exemplos: "Amoxicilina, látex, picada de abelha". |
| **Doenças Crônicas** (`chronic_diseases`) | Aba Paciente → seção "Dados Clínicos" | IMPORTANTE — ícone de alerta laranja. Informa condições pré-existentes que afetam protocolos de anestesia e medicação. Exemplos: "Diabetes mellitus, Leishmaniose, Hipotireoidismo". |
| **Microchip ID** (`microchip_id`) | Aba Paciente → seção "Dados Clínicos" | Identificação oficial ISO 11784/11785 (padrão 15 dígitos). Obrigatório para animais de companhia em muitos municípios. Permite rastreamento e prova de propriedade. |

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
- **Busca por microchip**: Futuramente o campo de busca do módulo Pacientes suportará busca direta por código de microchip.

---

## MODULE 11 — MENTOR (AI ASSISTANT)
<!-- AI-CONTEXT: This is the Mentor module self-description — used when users ask "what can Mentor do?". -->

### Objective
Assistente de onboarding e ajuda contextual em tempo real. Localiza animais no sistema, inicia tours guiados e responde perguntas em linguagem natural (português).

### Capabilities
1. **Localizar animal**: "Cadê o Bituca?" → busca no banco do dia → informa status e localização.
2. **Tour guiado**: "Como dou alta?" → inicia tour passo-a-passo com highlight de elementos UI.
3. **Navegação assistida**: "Me mostra a triagem" → redireciona + inicia tour.
4. **Voz**: Clique no microfone → fale a pergunta em pt-BR → Mentor processa.

### Pet Search Patterns (input recognized)
- "Cadê o [nome]?"
- "Onde está o [nome]?"
- "Localiza o [nome]"
- "Qual o status do [nome]?"
- "Procura o [nome]"

### Available Tours
| Tour ID | Label | What it Shows |
|---|---|---|
| `recepcao` | Recepção | Check-in e fila de espera |
| `sala-espera` | Sala de Espera | Fila e novo check-in |
| `triagem` | Triagem | Fila, voz, concluir triagem |
| `consulta` | Consultório | Gravação, SOAP, salvar prontuário |
| `exames` | Exames | Fila de exames, registrar resultado |
| `internacao` | Internação | Lista internados, dar alta hospitalar |
| `grooming` | Banho & Tosa | Fila kanban, registro por voz |
| `alta` | Alta | Quadro kanban, coluna de alta |

### Intent Keywords → Tour Mapping
| Keywords | Tour Activated |
|---|---|
| alta, liberar, finalizar consulta, prontuário | `alta` |
| triagem, sinais vitais, peso, temperatura | `triagem` |
| recepção, check-in, chegou, fila | `recepcao` |
| consulta, veterinário, soap, diagnóstico | `consulta` |
| exame, laboratório, laudo, resultado | `exames` |
| internação, internar, hospitalizar, UTI | `internacao` |
| banho, tosa, grooming, tosador | `grooming` |

---

## CROSS-MODULE PATTERNS
<!-- AI-CONTEXT: These patterns apply system-wide and should inform all answers about system behavior. -->

### Realtime Sync
- Todas as filas atualizam automaticamente via Supabase Realtime.
- Usuário nunca precisa recarregar a página para ver novos animais na fila.

### Multi-tenancy
- Toda operação é isolada por `clinic_id`.
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
| `admin` | Acesso total, incluindo Gestão |
| `vet` | Consultório, Farmácia, Exames, Internação |
| `assistant` | Triagem, Grooming, Internação |
| `receptionist` | Recepção, Caixa |
| `manager` | Caixa, relatórios |
| `accountant` | Caixa apenas |

### Status Flow (Consultation Lifecycle)
```
reception → triage → in_progress → waiting_exam → in_progress → completed
                                 ↘ medication → completed
                                 ↘ hospitalized → revisao_pos_internacao → completed
```

### CFMV Compliance Rules
1. Triagem exige `weight_kg` + `temperature_rectal` (campos obrigatórios).
2. Consultório exige `is_reviewed_by_vet = true` antes de alta.
3. Medicamentos controlados exigem sinalização "Receituário Azul".
4. Prontuário deve registrar CRM-V do MV responsável.

---

## FAQ — COMMON USER QUESTIONS
<!-- AI-CONTEXT: Use these Q&A pairs to answer frequent user questions directly without needing to search. -->

**Q: Como faço check-in de um animal?**
A: Na Recepção, busque o tutor pelo CPF ou nome no campo "Busca Inteligente", selecione o pet e clique em "Check-in". O animal aparecerá na fila de espera automaticamente.

**Q: O animal sumiu da fila — o que aconteceu?**
A: Provavelmente foi encaminhado para a próxima etapa. Use o Mentor para localizar: "Cadê o [nome do animal]?" — ele informa em qual módulo está.

**Q: Como dou alta a um animal?**
A: No Consultório, abra a consulta do animal, preencha o prontuário SOAP, marque o checkbox "Revisado pelo MV" e clique em "Dar Alta". O status muda para `completed`.

**Q: Como registro o resultado de um exame?**
A: No módulo Exames, clique no card do animal na fila ou use "Registrar Resultado" → preencha o laudo na textarea → salve. O animal retorna ao fluxo.

**Q: Como adicionar um novo medicamento ao estoque?**
A: Na Farmácia, clique "+ Adicionar Medicamento", preencha nome, quantidade, unidade e estoque mínimo, e salve.

**Q: Como convidar um novo funcionário?**
A: Na Gestão → aba "Usuários" → "Convidar" → informe o email e selecione o perfil (MV, Auxiliar, Recepcionista, etc.). O sistema envia o convite por email.

**Q: Por que não consigo fechar a consulta?**
A: A consulta não fecha sem o checkbox "Revisado pelo MV" marcado. Esse campo é obrigatório por lei (CFMV). Se o MV não assinou, o sistema bloqueia a alta.

**Q: Como ativo o módulo de Banho & Tosa?**
A: Na Gestão → aba "Clínica" → toggle do módulo "Grooming" → salvar. O módulo aparecerá no menu lateral imediatamente.

**Q: Como o pagamento do Banho & Tosa funciona?**
A: Ao arrastar o card do animal para a coluna "Entregue" no módulo Grooming, um modal de pagamento aparece. Ao confirmar, o valor é automaticamente lançado no Caixa Central.

**Q: Posso usar voz em qual módulo?**
A: Sim, em três módulos: **Triagem** (sinais vitais), **Consultório** (anamnese e SOAP) e **Banho & Tosa** (observações do serviço). Clique no ícone de microfone em cada um.

---

*END OF VETMAX_KNOWLEDGE_BASE — Version 1.0.0*
