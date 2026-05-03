# VetMax — Status do Projeto
> Atualizado em 2026-04-18 (Plano técnico: Módulo Convênios & Anti-Glosa) | SysMax Solutions

## 📖 Leitura Obrigatória

Antes de implementar qualquer feature, leia:
- **`CLAUDE.md`** — instruções para Claude Code
- **`vetmax-docs.md`** — domínio veterinário + fluxo clínico
- **`.clauderules`** — regras de negócio

**Skills correspondentes:**
- **Fluxo clínico / status / filas** → `/skills/clinical_flow.md`
- **Migration / query / schema** → `/skills/database.md`
- **IA / transcrição / RAG** → `/skills/ai_and_rag.md`
- **Padrões de código / componentes** → `/skills/development.md`

---

## DNA do Sistema (BlueSprint — Premissas Universais)

| Premissa | Status |
|----------|--------|
| **Dualidade Tutor/Pet** — Tutor = cliente LGPD, Pet = paciente CFMV | ✅ Implementado |
| **Motor Voice-to-Template** — IA mapeia fala → campos de templates | ✅ Implementado |
| **Feed Cronológico** — timeline unificada de todos os eventos do pet | ✅ Implementado (PetTimelineModal) |
| **"Cadastro Vivo"** — IA sugere atualização do cadastro ao fim do atendimento | ✅ Implementado (LiveRegistrationModal integrado ao ConsultationDetail) |
| **Stack** Next.js 16 + Supabase + Claude API + Tailwind v4 | ✅ Ativo |
| **Multi-tenancy** — clinic_id em todas as tabelas, RLS Supabase | ✅ Implementado |

---
 **Economia de Tokens:** - Sempre responda de forma concisa.
   - Não reescreva arquivos inteiros; mostre apenas o diff ou a função alterada.
   - Antes de ler um arquivo grande, resuma o que busca nele.
## Módulos — Estado Atual

### ✅ MÓDULO 1 — Recepção (`/dashboard/reception`)

**BlueSprint:**
| Feature | Status |
|---------|--------|
| Busca inteligente por nome, CPF do Tutor ou nome do Pet | ✅ |
| Modal unificado de cadastro Tutor + Pet | ✅ |
| Check-in obrigatório com Motivo da Visita | ✅ |
| Status Financeiro (Pago/Pendente) no check-in | ✅ |
| Acesso ao Feed cronológico do pet | ✅ PetTimelineModal |
| Badges/tags comportamentais do pet (Agressivo, Cardiopata, Alérgico) | ⚠️ Alertas de alergia e doença crônica. Tags ricas (agressivo) pendentes |
| Foto do pet | ✅ `uploadPetPhoto()` + UI no EditPetModal (bucket `pet-photos`) |

**Implementado além do BlueSprint:**
- Agendamentos — calendário com criação de consultas futuras (`/dashboard/reception/calendar`)
- Checkout / Caixa (`/dashboard/reception/checkout`)
- Checklist de check-in configurável pelo gestor
- Sub-navegação de recepção (ReceptionSubNav)
- Filtros por data e status na fila
- **Importador CSV** — bulk import de Tutores e Pets com validação de duplicatas

---

### ✅ MÓDULO 2 — Triagem (`/dashboard/triage`, `/dashboard/triage/[id]`)

**BlueSprint:**
| Feature | Status |
|---------|--------|
| Fila de espera (status = `triage`) | ✅ |
| Formulário de sinais vitais (peso + temp retal obrigatórios) | ✅ |
| Cor das Mucosas, TPC, FC, FR | ✅ |
| Queixa principal por voz (Web Speech API) | ✅ |
| Claude AI extrai campos da transcrição | ✅ |
| Alerta visual para pets Alérgicos / Doença Crônica | ✅ |
| Atualização de cadastro via sugestão da IA | ✅ LiveRegistrationModal no ConsultationDetail |

**Implementado além do BlueSprint:**
- Carteira de Vacinação inline na triagem (VaccinationCard com CRUD)
- Aba "Histórico de Hoje" com triagens realizadas + botão "Editar Triagem"
- Modo edição (`?edit=true`) sem regressão de status
- Blindagem de status: nunca regride consulta já avançada
- Exibição de `reproductive_status` e `medical_history` no card do paciente
- Realtime sync via Supabase subscriptions

---

### ✅ MÓDULO 3 — Consultório (`/dashboard/vet`, `/dashboard/vet/[id]`)

**BlueSprint:**
| Feature | Status |
|---------|--------|
| Painel de contexto preenchido (vitais + queixa + alertas da triagem) | ✅ |
| Prontuário por voz + IA (blocos clínicos) | ✅ |
| Geração de documentos via IA com preenchimento de campos | ✅ |
| Impressão de documentos | ✅ React Portal (escapa de print:hidden) |
| Encaminhamento para Exames (`waiting_exam`) | ✅ |
| Finalização CFMV (`is_reviewed_by_vet`) | ✅ |
| Diagnóstico diferencial por IA | ✅ Claude Haiku |
| Farmácia Interna (medicações aplicadas + estoque) | ⚠️ Medicações aplicadas via `applied_medications`. Estoque não implementado |
| Calculadora de Prescrição (peso → dose automática) | ✅ `/api/prescription-calculator` (Claude Haiku), botão "⚡ Calcular (IA)" inline |
| Receituário Azul (medicamentos controlados) | ✅ Migration 0029, lista 30+ DCBs, badge "Receita Azul", auto-detecção por nome |
| Processamento RAG Iterativo entre blocos de áudio | ❌ Backlog futuro |

**Implementado além do BlueSprint:**
- Histórico do pet (últimas consultas) — PetTimelineModal
- Carteira de Vacinação (VaccinationCard) com voz + extração IA
- Aba "Histórico de Hoje" com atendimentos realizados + "Editar Consulta"
- `coat_color`, `reproductive_status`, `medical_history` no painel de contexto
- VaccineStatusBadges nos alertas clínicos
- Anexos de arquivos (AttachmentsSection)
- ClinicalActionsSection (ações clínicas rápidas)

---

### ✅ MÓDULO 4 — Gestão (`/dashboard/management`) — Admin only

**BlueSprint:**
| Feature | Status |
|---------|--------|
| RBAC — roles: admin, vet, assistant, receptionist | ✅ |
| Feature Flags — ligar/desligar módulos da clínica | ✅ `active_modules` na tabela `clinics` |
| Gestão de Templates — import PDF + extração IA de campos | ✅ |
| Gestão de Usuários — lista da equipe com troca de role | ✅ |
| Sistema de Convites por e-mail com token | ✅ `/invite/[token]` |
| Radar Kanban — visão macro de todos os pets em tempo real | ✅ `/dashboard/management/kanban` (admin) |
| Upload de PDF em branco com extração automática de campos | ✅ ImportTemplateModal |
| Configurações da clínica (nome, CNPJ, endereço, telefone) | ✅ ClinicSettingsTab |

**Implementado além do BlueSprint:**
- Catálogo de serviços/procedimentos (CatalogTab)
- Fluxo Contínuo (`continuous_flow`) — flag que controla passagem automática de bastão
- `flow_config` — configuração granular do fluxo por módulo
- Logo da clínica (`logo_url`)
- `user_limit` — trava de licença por número de usuários
- CRMV do veterinário no perfil

---

### ✅ Exames (`/dashboard/exams`, `/dashboard/exams/[id]`)

**BlueSprint (era Prioridade 4):**
| Feature | Status |
|---------|--------|
| Fila de exames (`status = waiting_exam`) | ✅ `getExamsQueue()` |
| Técnico registra laudo (`exam_notes`) | ✅ ExamDetail |
| Devolve ao MV (`waiting_exam → in_progress`) | ✅ `returnToVet()` |
| Aba "Histórico de Hoje" | ✅ `getExamsHistory()` + tab system |
| Botão "Editar Exame" no histórico | ✅ |

---

### ✅ Pet CRM (`/dashboard/patients`)

> **Não estava no BlueSprint original** — implementado como extensão do "Cadastro Vivo"

| Feature | Status |
|---------|--------|
| Listagem de todos os pets da clínica | ✅ PatientsWorkspace |
| Busca por nome do pet ou tutor | ✅ |
| Ficha rica: `coat_color`, `reproductive_status`, `medical_history` | ✅ Migration 0017 |
| Modal de Edição com abas Pet/Tutor — editar dados de ambos + vacinas | ✅ EditPetModal |
| Timeline completa do pet (PetTimelineModal) | ✅ |

---

### ✅ MÓDULO 5 — Internação (`/dashboard/hospitalization`)

**BlueSprint:**
| Feature | Status |
|---------|--------|
| Kanban de leitos (Observação / Enfermaria / UTI / Alta) | ✅ HospitalizationKanban |
| Drag & Drop entre alas com feedback visual | ✅ |
| Modal de Alta Inteligente (Alta Definitiva ou Revisão Clínica) | ✅ DischargeModal inline |
| Evoluções periódicas de plantão com voz (Voice-to-Action) | ✅ HospitalizationDetailModal |
| IA extrai notas + medicações + estado do animal da fala | ✅ `extractHospitalizationVoice` |
| Medicações aplicadas estruturadas (nome, dose, via, posologia) | ✅ `StructuredMed[]` |
| Timeline de prontuário (registros cronológicos por internação) | ✅ coluna direita do modal |
| Log automático de movimentações de ala | ✅ `hospitalization_logs` migration 0024 |
| Status `hospitalized` no fluxo de consultas | ✅ migration 0023 |
| Alta Definitiva → encerra internação + fecha consulta | ✅ `confirmDischarge()` |
| Revisão Clínica → devolve para fila do MV (`revisao_pos_internacao`) | ✅ `sendToVetReview()` |
| **Drag-and-drop vinculado à Evolução (move só após salvar ficha)** | ✅ |
| Pre-fill automático do estado (UTI→Piorou, Enfermaria→Melhorou, Obs→Estável) | ✅ |
| `AdmitPetModal` — internar pet direto do Consultório | ✅ |
| **Alta Formal** — PDF com diagnóstico final, evolução, logs de ala, assinatura MV | ✅ **2026-04-16** |
| **Receituário de Alta** — `PrescriptionModal` com jsPDF, compartilhamento via Storage | ✅ **2026-04-16** |
| **Central de Documentos** — bucket `clinical-documents` + tabela `hospitalization_documents` | ✅ **2026-04-16** |

**Migrations:**
- `0019` — tabela `hospitalizations`
- `0022` — RLS consolidada (inclui hospitalizations)
- `0023` — status `hospitalized` no CHECK de `consultations`
- `0024` — tabela `hospitalization_logs`
- `0025` — bucket `clinical-documents` + tabela `hospitalization_documents`

---

### ✅ MÓDULO WhatsApp — Notificações para Tutores

> **Não estava no BlueSprint original** — implementado como módulo transversal (2026-04-17)

| Feature | Status |
|---------|--------|
| Modal de notificação (`WhatsAppNotificationModal`) com 11 triggers | ✅ |
| Geração de mensagem via Claude AI (contextual por trigger) | ✅ |
| Edição manual da mensagem antes do envio | ✅ |
| Seleção e envio de anexos (signed URLs do Storage) | ✅ |
| Configuração de credenciais Z-API/Sysmax no painel de Gestão | ✅ `WhatsappSettings.tsx` |
| Campos sensíveis mascarados na UI (primeiros 4 chars + `********`) | ✅ |
| `WhatsAppGateProvider` — gate global (botão visível só se configurado) | ✅ |
| Integração em Triagem, Consultório, Exames, Internação, Recepção | ✅ |

**Triggers disponíveis:**
- `triage_called` / `triage_completed` / `documents_sent` / `exam_completed`
- `hospitalization_update` / `hospitalization_discharge` / `hospitalization_evolution_saved`
- `hospitalization_status_changed` / `sent_to_review` / `consultation_finished` / `hospitalization_started`

---

### ⛔ Farmácia (`/dashboard/pharmacy`)

> **Extinto** por decisão SisMax (2026-04-10). Aplicações de medicação ficam no Consultório. Estoque futuro → Financeiro.
> A rota redireciona para `/dashboard/reception`.

---

## Infraestrutura e Segurança

| Item | Status |
|------|--------|
| Multi-tenancy (clinic_id em todas as tabelas) | ✅ |
| RLS Supabase — consolidada (migration 0022) | ✅ Aplicada no remoto |
| `createAdminClient` removido de server actions | ✅ timeline, pets, appointments |
| Bloqueio visual para clínicas `status = pending` | ✅ dashboard/layout.tsx |
| Signup público (`/register`) → `/onboarding` | ✅ Fluxo de auto-cadastro |
| Sistema de Convites com token + expiração | ✅ `/invite/[token]` |
| `user_limit` (trava de licença) | ✅ |
| `audit_logs` — tabela criada (migration 0020) | ✅ `logAudit()` em 13 actions críticas (pets, vet, triage, consultations, templates, hospitalizations, pharmacy) |
| Realtime sync (Supabase subscriptions) | ✅ useRealtimeSync |

---

## Migrations (39 aplicadas no remoto)

| # | Arquivo | Conteúdo | Remoto |
|---|---------|----------|--------|
| 0001 | initial_schema | clinics, profiles, tutors, patients, consultations | ✅ |
| 0002 | reception_governance | regras de check-in, status flow | ✅ |
| 0003 | fix_payment_status_constraint | constraint de pagamento | ✅ |
| 0004 | expand_tutor_patient_fields | campos extras tutor/pet | ✅ |
| 0005 | add_emergency_contact | contato de emergência | ✅ |
| 0006 | add_vital_signs | vital_signs JSONB em consultations | ✅ |
| 0007 | document_templates | templates de documentos | ✅ |
| 0008 | patient_documents | documentos gerados | ✅ |
| 0009 | clinical_actions | applied_medications, referrals | ✅ |
| 0010 | appointments | tabela de agendamentos futuros | ✅ |
| 0011 | billing | faturamento/checkout | ✅ |
| 0012 | exam_notes | campo exam_notes em consultations | ✅ |
| 0013 | patient_attachments | anexos de arquivos | ✅ |
| 0014 | clinic_catalog | catálogo de serviços da clínica | ✅ |
| 0015 | clinic_settings | active_modules, continuous_flow, logo_url | ✅ |
| 0016 | patient_vaccines | tabela patient_vaccines (carteira de vacinação) | ✅ |
| 0017 | pet_clinical_fields | coat_color, reproductive_status, medical_history em patients | ✅ |
| 0018 | pet_photo_and_tags | photo_url + tags comportamentais (agressivo, etc.) em patients | ✅ |
| 0019 | hospitalizations | tabela hospitalizations (internação kanban) | ✅ |
| 0020 | audit_logs | tabela audit_logs com RLS para admins | ✅ |
| 0021 | view_patients | views/políticas de segurança em tutors e patients | ✅ |
| 0022 | rls_consolidation | Consolidação de todas as RLS policies (17 tabelas) | ✅ |
| 0023 | add_hospitalized_status | Adiciona `hospitalized` ao CHECK de `consultations.status` | ✅ |
| 0024 | hospitalization_logs | Tabela `hospitalization_logs` (trilha de movimentações de ala) | ✅ |
| 0025 | hospitalization_documents | Bucket `clinical-documents` + tabela `hospitalization_documents` com RLS | ✅ |
| 0026 | whatsapp_notifications | Tabela `whatsapp_notifications` (log de mensagens enviadas por clínica) | ✅ |
| 0027 | clinic_whatsapp_settings | Tabela `clinic_whatsapp_settings` (credenciais Z-API/Sysmax por clínica) | ✅ |
| 0028 | add_consultation_finished_trigger | Trigger de consulta concluída para disparo de WhatsApp | ✅ |
| 0029 | blue_prescription | Campo `is_controlled` em `applied_medications` + lista de 30+ DCBs controlados | ✅ |
| 0030 | missing_fk_indexes | 16 índices em FKs sem índice (performance) | ✅ |
| 0031 | pharmacy_stock | Tabelas `pharmacy_stock` + `stock_movements` com RLS (Módulo de Estoque) | ✅ |
| 0032 | grooming_sessions | Tabela `grooming_sessions` — Módulo Banho e Tosa | ✅ |
| 0033 | grooming_records | Tabela `grooming_records` — Registros de evolução grooming | ✅ |
| 0034 | insurance_providers | Convênios cadastrados por clínica (nome, planos, portal_url) | ✅ |
| 0035 | pet_insurance | Vínculo patient ↔ convênio (member_id, plan_type, coverage_status) | ✅ |
| 0036 | insurance_rules | Knowledge base de regras anti-glosa por procedimento + convênio | ✅ |
| 0037 | insurance_audit_log | Log de auditorias IA + colunas insurance_* em consultations | ✅ |
| 0038 | grooming_documents | Bucket `grooming-documents` + tabela `grooming_documents` com RLS | ✅ |
| 0039 | voice_triggers | Colunas `voice_start_triggers` / `voice_stop_triggers` em `clinics` | ✅ |
| 0034 | insurance_providers | Convênios cadastrados por clínica (nome, planos, portal_url) | ✅ |
| 0035 | pet_insurance | Vínculo patient ↔ convênio (member_id, plan_type, coverage_status) | ✅ |
| 0036 | insurance_rules | Knowledge base de regras anti-glosa por procedimento + convênio | ✅ |
| 0037 | insurance_audit_log | Log de auditorias IA + colunas insurance_* em consultations | ✅ |

---

### ✅ MÓDULO 8 — Banho e Tosa (`/dashboard/grooming`) — Workflow Completo · P0 em Andamento

**Visão Geral:** Fila de grooming com kanban, evoluções por voz (padrão Internação). Sem fluxo clínico CFMV.

**Implementado:**
| Feature | Status |
|---------|--------|
| Kanban grooming: Recebido → Em Banho → Em Tosa → Aguardando Retirada → Entregue | ✅ `GroomingKanban.tsx` |
| Check-in rápido via Recepção (botão ✂️ Banho/Tosa no TutorProfile) | ✅ `GroomingCheckinModal.tsx` |
| Modal de sessão com evoluções por voz (padrão HospitalizationDetailModal) | ✅ `GroomingDetailModal.tsx` |
| Assistente de voz hands-free (wake words, parser IA, auto-status) | ✅ `useGroomingVoiceAssistant.ts` |
| IA extrai serviços aplicados + produtos + comportamento + observações da fala | ✅ `extractGroomingVoice()` Claude Haiku |
| Timeline cronológica de registros por sessão | ✅ coluna direita do modal |
| Fotos e documentos por sessão (bucket `grooming-documents`) | ✅ migration 0038 |
| Wake words personalizáveis por clínica | ✅ migration 0039, `voice_start/stop_triggers` em `clinics` |
| Drag & drop entre colunas + confirmação de entrega | ✅ |
| Real-time sync via Supabase Realtime | ✅ `useRealtimeSync` |
| Triggers WhatsApp: `grooming_ready_for_pickup`, `grooming_delivered` | ✅ |
| Ativado/desativado via `active_modules` no painel de Gestão | ✅ |

**Gaps identificados (Análise PM 2026-04-19):**

| Prioridade | Gap | Status |
|------------|-----|--------|
| 🔴 P0 | **Faturamento** — sem preço por serviço, sem total, sem checkout | 🔄 Em andamento (migration 0040) |
| 🔴 P0 | **Agendamento visual** — `scheduled_at` existe no DB mas sem UI/calendar | 🔄 Em andamento |
| 🟠 P1 | **Atribuição de profissional** — sem campo `assigned_to` (banhista/tosador) | ❌ Backlog |
| 🟠 P1 | **Analytics/KPIs** — sem dashboard (sessões/dia, receita, serviços top) | ❌ Backlog |
| 🟠 P1 | **Audit log de status** — mudanças de coluna sem rastreamento | ❌ Backlog |
| 🟡 P2 | **Integração com prontuário** — banhista não vê alergias/histórico clínico | ❌ Backlog |
| 🟡 P2 | **Produtos vinculados ao estoque** — `products_used` é texto livre | ❌ Backlog |
| 🟡 P2 | **Feedback/Avaliação do tutor** — sem star rating pós-serviço | ❌ Backlog |
| 🔵 P3 | **Busca e filtros** — sem busca por pet, sem filtro por serviço/data | ❌ Backlog |
| 🔵 P3 | **Alerta visual para agressivo** — `behavior=agressivo` sem destaque | ❌ Backlog |
| 🔵 P3 | **Comprovante imprimível** — sem recibo com assinatura de autorização | ❌ Backlog |
| 🔵 P3 | **Mobile responsiveness** — kanban 5 colunas quebra em celular | ❌ Backlog |

**Migrations aplicadas:**
- `0032` — `grooming_sessions` (clinic_id, patient_id, tutor_id, status, services_requested, box_number, scheduled_at)
- `0033` — `grooming_records` (session_id, services_applied JSONB, products_used JSONB, behavior, voice_transcription)
- `0038` — `grooming_documents` (bucket `grooming-documents` + tabela com RLS)
- `0039` — `voice_start_triggers` / `voice_stop_triggers` em `clinics`

**Arquivos:**
- `src/app/dashboard/grooming/page.tsx`
- `src/components/grooming/GroomingKanban.tsx`
- `src/components/grooming/GroomingDetailModal.tsx`
- `src/components/grooming/GroomingCheckinModal.tsx`
- `src/lib/actions/grooming.ts`
- `src/lib/actions/grooming-intent.ts`
- `src/hooks/useGroomingVoiceAssistant.ts`

---

### ✅ MÓDULO 10 — Convênios & Escudo Anti-Glosa — COMPLETO (2026-04-18)

**Visão Geral:** Elimina retrabalho e glosas de planos de saúde pet. Cadastro de convênios, base de regras anti-glosa, IA Auditora no prontuário e exportação para portal terceiro.

| Feature | Status |
|---------|--------|
| Cadastro de convênios (`insurance_providers`) | ✅ |
| Vínculo Pet ↔ Convênio (`pet_insurance`) | ✅ |
| Knowledge Base de regras anti-glosa (`insurance_rules`) | ✅ |
| IA Auditora (`runInsuranceAudit()` — Claude Haiku) | ✅ |
| `InsuranceAuditBanner` no Consultório (verde/amarelo/vermelho) | ✅ |
| `InsuranceExportPanel` no Checkout (JSON + código TUSS + "Copiar para portal") | ✅ |
| Log de auditoria (`insurance_audit_log`) | ✅ |
| Override do MV com justificativa obrigatória | ✅ |
| Gestão de convênios (`/dashboard/settings/insurance`) | ✅ |
| Aba "Convênio" no `EditPetModal` (Recepção) | ✅ |
| `saveVetNotes()` retorna `{ success, audit? }` — advisory, nunca quebra auto-save | ✅ |

**Migrations aplicadas:**
- `0034` — `insurance_providers`
- `0035` — `pet_insurance`
- `0036` — `insurance_rules`
- `0037` — `insurance_audit_log` + colunas `insurance_id`, `insurance_verified_at`, `insurance_override_reason` em `consultations`

**Arquivos:**
```
src/lib/actions/insurance-providers.ts
src/lib/actions/pet-insurance.ts
src/lib/actions/insurance-rules.ts
src/lib/actions/insurance-audit.ts
src/components/consultation/InsuranceAuditBanner.tsx
src/components/reception/InsuranceExportPanel.tsx
src/app/dashboard/settings/insurance/page.tsx
```

---

### ❌ MÓDULO 9 — Hotel Pet (`/dashboard/hotel`) — Backlog

**Visão Geral:** Hospedagem de pets com controle de alimentação, higienização, inventário e tarifário flexível. Recepção adaptada para check-in hoteleiro.

**BlueSprint:**
| Feature | Status |
|---------|--------|
| Recepção adaptada: check-in Daycare / Pernoite / Pet Sitting | ❌ |
| Kanban / Calendário de ocupação por quarto/box | ❌ |
| Modal de estadia com evoluções por voz (padrão Internação) | ❌ |
| IA extrai feed de atualização do pet (alimentação, higiene, atividades) | ❌ |
| Inventário de itens da estadia (coleira, ração, brinquedo...) | ❌ |
| Controle de higienização (banho agendado durante a hospedagem) | ❌ |
| Controle de alimentação (horários, quantidade, tipo de ração) | ❌ |
| Tarifário flexível por tipo (Daycare/Pernoite/Pet Sitting) + temporada | ❌ |
| Agendamento por temporada (feriados, alta/baixa temporada) | ❌ |
| Triggers WhatsApp: `hotel_checkin`, `hotel_update_sent`, `hotel_checkout` | ❌ |
| Configuração de quartos/boxes no painel de Gestão | ❌ |
| Configuração de tarifas no painel de Gestão | ❌ |

**Migrations planejadas (aguardam conclusão do Módulo Convênios):**
- `0038_hotel_rooms` — quartos/boxes com capacidade e tipo (cão pequeno/grande, gato)
- `0039_hotel_tariffs` — regras de tarifário (tipo × duração × temporada)
- `0040_hotel_stays` — estadias com check-in type, datas, quarto, status
- `0041_hotel_stay_records` — registros periódicos (alimentação, higiene, atividades, voz)

---

## Rotas Disponíveis

### Dashboard
| Rota | Componente | Status |
|------|-----------|--------|
| `/dashboard/reception` | ReceptionWorkspace | ✅ |
| `/dashboard/reception/calendar` | CalendarWorkspace | ✅ |
| `/dashboard/reception/checkout` | CheckoutWorkspace | ✅ |
| `/dashboard/triage` | NurseWorkspace | ✅ |
| `/dashboard/triage/[id]` | TriageForm | ✅ |
| `/dashboard/vet` | VetWorkspace | ✅ |
| `/dashboard/vet/[id]` | ConsultationDetail | ✅ |
| `/dashboard/exams` | ExamsWorkspace | ✅ |
| `/dashboard/exams/[id]` | ExamDetail | ✅ |
| `/dashboard/patients` | PatientsWorkspace | ✅ |
| `/dashboard/hospitalization` | HospitalizationKanban | ✅ |
| `/dashboard/grooming` | GroomingKanban | ✅ |
| `/dashboard/management` | ManagementWorkspace | ✅ admin only |
| `/dashboard/management/kanban` | KanbanBoard (Radar) | ✅ admin only |
| `/dashboard/pharmacy` | — | ⛔ redirect |
| `/dashboard/settings` | — | ⛔ redirect → /management |

### APIs
| Rota | Propósito | Status |
|------|-----------|--------|
| `/api/transcribe` | Áudio → texto (Whisper/Speech) | ✅ |
| `/api/suggest-diagnosis` | Diagnóstico diferencial IA | ✅ |
| `/api/process-template` | Preenchimento de template via IA | ✅ |
| `/api/process-template-with-file` | Template com arquivo de contexto | ✅ |
| `/api/voice-map-fields` | Mapeamento voz → campos de template | ✅ |
| `/api/update-clinic` | Salvar dados da clínica | ✅ |
| `/api/update-user-role` | Trocar role do usuário | ✅ |
| `/api/get-current-user` | Dados do usuário logado | ✅ |
| `/api/admin/fix-constraints` | Correção de constraints do DB | ✅ |
| `/api/keepalive` | Ping no Supabase para evitar pausa do free tier | ✅ |
| `/api/prescription-calculator` | Cálculo de dose por peso via Claude Haiku | ✅ |

### Públicas
| Rota | Propósito |
|------|-----------|
| `/login` | Autenticação |
| `/register` | Auto-cadastro → redireciona para `/onboarding` |
| `/onboarding` | Cadastro de clínica |
| `/reception` | Check-in público (QR code) |
| `/invite/[token]` | Aceite de convite de usuário |
| `/auth/callback` | Callback OAuth Supabase |

---

## Arquitetura de Dados

| Tabela | Propósito | Multi-tenant |
|--------|-----------|-------------|
| `clinics` | Dados da clínica, config, licença | — |
| `profiles` | Usuários com role e clinic_id | ✅ |
| `tutors` | Responsáveis legais dos pets | ✅ |
| `patients` | Animais + campos clínicos ricos | ✅ |
| `consultations` | Atendimentos com status flow | ✅ |
| `appointments` | Agendamentos futuros | ✅ |
| `document_templates` | Templates de laudos/receitas | ✅ |
| `patient_documents` | Documentos gerados com campos | ✅ |
| `applied_medications` | Medicações aplicadas no consultório | ✅ |
| `referrals_and_external_rx` | Encaminhamentos externos | ✅ |
| `patient_attachments` | Arquivos anexados ao pet | ✅ |
| `patient_vaccines` | Carteira de vacinação | ✅ |
| `clinic_catalog` | Catálogo de serviços/procedimentos | ✅ |
| `clinic_settings` | Configurações avançadas da clínica | ✅ |
| `invitations` | Convites por e-mail com token | ✅ |
| `hospitalizations` | Internações ativas com status de ala | ✅ |
| `hospitalization_records` | Evoluções periódicas de plantão | ✅ |
| `hospitalization_logs` | Trilha de movimentações entre alas | ✅ |
| `hospitalization_documents` | Metadados de arquivos anexados por internação | ✅ |
| `audit_logs` | Log de segurança — `logAudit()` em 13 actions críticas | ✅ |
| `pharmacy_stock` | Estoque de medicamentos com nível mínimo de alerta | ✅ |
| `stock_movements` | Histórico de entradas/saídas do estoque (Audit Trail) | ✅ |
| `whatsapp_notifications` | Log de mensagens WhatsApp enviadas por clínica | ✅ |
| `clinic_whatsapp_settings` | Credenciais Z-API/Sysmax por clínica (criptografadas) | ✅ |
| `grooming_sessions` | Sessões de banho e tosa (kanban independente) | ✅ |
| `grooming_records` | Registros de evolução por sessão (voz + manual) | ✅ |
| `insurance_providers` | Convênios cadastrados por clínica | ✅ migration 0034 |
| `pet_insurance` | Vínculo patient ↔ convênio (member_id, plan_type, coverage_status) | ✅ migration 0035 |
| `insurance_rules` | Knowledge base de regras anti-glosa por procedimento e convênio | ✅ migration 0036 |
| `insurance_audit_log` | Log de auditorias IA por consulta com sugestões e confirmação do MV | ✅ migration 0037 |
| `grooming_documents` | Metadados de fotos/PDFs por sessão de grooming | ✅ migration 0038 |

**Status flow:**
```
reception → triage → in_progress → waiting_exam → in_progress (loop exames)
                                 → hospitalized → (observation/ward/icu) → ready_for_discharge
                                                                         → discharged
                                                                         → revisao_pos_internacao
                                 → medication
                                 → completed
                                 → cancelled
```

---

## Navegação por Role

| Role | Tabs visíveis |
|------|--------------|
| `admin` | Recepção, Triagem, Consultório, Exames, Pacientes, Internação, Gestão, Radar Kanban |
| `vet` | Recepção, Consultório, Exames, Pacientes, Internação |
| `assistant` | Recepção, Triagem, Exames, Internação |
| `receptionist` | Recepção |

---

## Backlog BlueSprint — O que Falta

### ✅ Concluído na Sprint (2026-04-16)
- [x] **Alta Formal** — `generateDischargeSummary()` + `printDischargePdf()` no HospitalizationKanban
- [x] **Receituário de Alta** — `PrescriptionModal.tsx` + `generatePrescriptionPdf()` + `hospitalization_documents` (migration 0025)
- [x] **Foto do Pet** — `uploadPetPhoto()` em `pets.ts` + botão de upload no `EditPetModal`
- [x] **Cadastro Vivo** — `LiveRegistrationModal` integrado ao `ConsultationDetail.tsx`

### ✅ Concluído na Sprint (2026-04-17)
- [x] **Módulo WhatsApp** — `WhatsAppNotificationModal.tsx` com 11 triggers, geração de mensagem via Claude AI, suporte a anexos (signed URLs do Storage). `WhatsappSettings.tsx` no painel de Gestão com campos mascarados. `WhatsAppGateProvider.tsx` controla disponibilidade globalmente. Integrado em Triagem, Consultório, Exames, Internação, Recepção.
- [x] **API Keepalive** — `/api/keepalive?token=<KEEPALIVE_SECRET>`: ping mínimo no Supabase para evitar pausa do free tier (7 dias). Protegido por token. Chamado pelo Windows Task Scheduler a cada 5 dias.
- [x] **Migrations 0026/0027/0028** — `whatsapp_notifications` (log de mensagens enviadas), `clinic_whatsapp_settings` (credenciais Z-API/Sysmax por clínica), `add_consultation_finished_trigger`.

### ✅ Concluído na Sprint (2026-04-18)
- [x] **Tags Comportamentais Ricas** — `BehaviorTagsBadges` propagadas para Recepção (`ReceptionWorkspace`), Triagem (`NurseWorkspace`), Consultório (`VetWorkspace`) e Exames (`ExamsWorkspace`). `behavior_tags` adicionado aos 4 tipos de fila (`TriageQueueItem`, `VetQueueItem`, `ReceptionQueueItem`, `ExamQueueItem`) e seus respectivos SELECTs. `BehaviorTagsSelector` já presente no `EditPetModal` e `TutorPetModal`. Campo `behavior_tags` já no banco (migration 0018).
- [x] **Receituário Azul** — Migration 0029 (`is_controlled` em `applied_medications`), lista de 30+ DCBs em `ClinicalActionsSection`, auto-detecção por nome, badge "Receita Azul" na lista, alerta contextual no formulário
- [x] **Calculadora de Prescrição** — `/api/prescription-calculator` (Claude Haiku), botão "⚡ Calcular (IA)" inline no formulário de medicação, preenche o campo Dose automaticamente, requer `peso_kg` da triagem
- [x] **Audit Trail** — `logAudit()` instrumentado em 13 actions críticas: `pets.ts` (3), `vet.ts` (2), `triage.ts` (2), `consultations.ts` (3), `templates.ts` (2), `hospitalizations.ts` (3), `pharmacy.ts` (2+1 existente)
- [x] **Módulo de Estoque com Abatimento Automático** — Migration 0031 (`pharmacy_stock` + `stock_movements`). `src/lib/actions/stock.ts` com CRUD + `deductStockForMedication()`. Abatimento integrado em `pharmacy.ts` (Consultório) e `hospitalizations.ts` (Internação). UI em `/dashboard/pharmacy` (`PharmacyWorkspace.tsx`): tabela com status crítico/atenção/OK, modais de adicionar/repor/ajustar. Badge de alerta vermelho no header para admins. Audit Trail em `stock_movements` + `audit_logs`.

### 🔴 Sprint Atual — P0 Banho e Tosa (2026-04-19)

| Feature | Dificuldade | Detalhes |
|---------|-------------|----------|
| **Faturamento Grooming** | ⭐⭐ Médio | Migration 0040 (`price_total`, `service_prices JSONB`, `payment_status`). Preços do `clinic_catalog`. Total dinâmico no check-in. Aba Cobrança no modal. |
| **Agendamento Grooming** | ⭐⭐ Médio | UI para `scheduled_at` (já existe no DB). Coluna "Agendados" no Kanban. Date/time picker no check-in. |

### 🟡 Próxima Sprint — P1 Banho e Tosa

| Feature | Dificuldade | Detalhes |
|---------|-------------|----------|
| **Atribuição de profissional** | ⭐⭐ Médio | Campo `assigned_to` em `grooming_sessions`. Seletor de banhista/tosador no check-in. |
| **Analytics Grooming** | ⭐⭐⭐ Médio | Sessões/dia, receita do setor, serviços top. Queries agregadas em `/dashboard/grooming`. |
| **Audit log de status** | ⭐ Fácil | Tabela `grooming_status_log` (migration 0041). Registrar quem moveu cada card e quando. |

### 🟢 Backlog Futuro

| Feature | Dificuldade | Detalhes |
|---------|-------------|----------|
| **Módulo Financeiro / BI** | ⭐⭐⭐⭐ Difícil | Fluxo de caixa + dashboard gráficos. Tabelas `billing` existem (migration 0011). Requer nova rota, `recharts`, queries agregadas |

### 🟢 Baixa Prioridade / Futuro

| Feature | Dificuldade | Detalhes |
|---------|-------------|----------|
| **Módulo Hotel Pet** | ⭐⭐⭐⭐ Difícil | Check-in Daycare/Pernoite/Pet Sitting. Controle de alimentação, higienização, inventário de itens. Tarifário flexível + agendamento por temporada. Migrations 0038-0041 (aguardam Convênios). |
| **Emissão de Recibo** | ⭐ Muito Fácil | Recibo simplificado no checkout via `jsPDF`. Dados já em `billing` |
| ~~**Estoque de Medicamentos**~~ | ✅ | Migration 0031, `pharmacy_stock` + `stock_movements`, abatimento em Consultório e Internação, UI em `/dashboard/pharmacy`, badge de alerta no header |
| **Integração com Labs** | ⭐⭐⭐⭐ Difícil | Upload de laudos externos. Requer mapeamento de parceiros e formatos (DICOM/HL7) |
| **Processamento RAG Iterativo** | ⭐⭐⭐⭐⭐ Muito Difícil | IA conecta áudios de diferentes blocos da mesma consulta. Requer vector store e redesign do fluxo de transcrição |
| **Subscription Plans** | ⭐⭐⭐ Médio | Tabela `subscription_plans` + gate por plano + integração gateway (Stripe/Asaas) |
