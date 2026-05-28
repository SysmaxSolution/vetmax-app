# SPRINT_STATUS — Internação Completa + Centro Cirúrgico

> Arquivo de contexto para **continuação da sprint em sessão remota (app do Claude / nuvem)**.
> A sessão da nuvem clona o `vetmax-app` do GitHub e **não tem acesso** à memória local
> (`~/.claude/.../memory`) nem ao plano local (`elegant-hopping-peach.md`). Este arquivo é a
> fonte de verdade do estado da sprint. Aprovada pelo PO em 2026-05-28.

## Arquitetura (2 módulos, 2 flags independentes)

Flags em `clinics.flow_config` (JSONB, sem migration — padrão `use_accounting_chart`), default `false`:

- **`internacao_completa`** — upgrade in-place de `/dashboard/hospitalization`. Flag off ⇒ tela atual intacta.
- **`centro_cirurgico`** — novo módulo `/dashboard/surgery` + item no menu lateral.

Helpers server: `isInternacaoCompleta()`/`isCentroCirurgico()` em `src/lib/actions/clinic-settings.ts`.
Hooks client: `internacaoCompleta`/`centroCirurgico` em `src/components/providers/ClinicConfigProvider.tsx`.

## Estado atual — FASE 0 CONCLUÍDA (neste commit)

- [x] `src/lib/actions/clinic-settings.ts` — flags + helpers `isInternacaoCompleta()`/`isCentroCirurgico()`.
- [x] `src/components/providers/ClinicConfigProvider.tsx` — hooks `internacaoCompleta`/`centroCirurgico`.
- [x] `src/components/management/Settings/SettingsWorkspace.tsx` — 2 toggles na aba "Acesso".
- [x] `src/components/layout/DashboardHeader.tsx` — item "Centro Cirúrgico" gated por `centroCirurgico`.
- [x] `src/config/access-catalog.ts` + `src/config/access-matrix.ts` — módulo `surgery` registrado.
- [x] `src/app/dashboard/surgery/page.tsx` — scaffold da rota.
- [x] `supabase/migrations/0196_internacao_completa_base.sql` — `clinical_vitals` (compartilhada hosp×surgery, XOR, IoT-ready) + ALTER `hospitalizations` (box_id, estimated_discharge, weight_at_admission, attending_vet_id, personal_belongings, diet_notes, fasting, **isolation_required**).
- [~] Fase 1 já iniciada: `HospitalizationKanban.tsx` (+92) e `hospitalization-prescriptions.ts` (+39) — isolamento/timeline em andamento.

> **Migration `0196` JÁ APLICADA no Supabase remoto** (confirmado via `migration list`; objetos
> `clinical_vitals` + colunas de `hospitalizations` presentes). **`0197` está OCUPADA** por
> `0197_audit_logs_lgpd.sql` (realocada de um `0188` duplicado). **Próximas migrations da sprint
> começam em `0198`.**
>
> ⚠️ **NÃO rode `supabase db push --include-all`** — o histórico de migrations tem ~19 prefixos
> duplicados pré-existentes (merges de branches) e muitas migrations aplicadas-mas-não-registradas.
> Aplique novas migrations via script `pg` direto (ex.: `scripts/apply-0196-internacao-base.mjs`),
> sempre com `IF NOT EXISTS`/idempotente.

## Roteiro restante

**Fase 1 — Internação Completa (CHECKPOINT do PO):**
1. **Alertas Ativos** — hook `useMedicationAlarm` plugado no `useMedicationScheduler` (tick 15s): bip via Web Audio API + Notification API (com permissão + fallback visual). Anti-spam: 1x por (prescription, janela de dose).
2. **Timeline imutável** — ao confirmar dose em `applyHospitalizationDose`/`MedicationApplicationModal`, injetar log não-editável em `hospitalization_records` (remédio, dose, hora, usuário logado).
3. **Mapa de Execução** — `ExecutionMapView.tsx`: grade horária (prescrições × horas) + folha imprimível. Nova `hospitalization_tasks`.
> **⇒ AVISAR O PO assim que alertas sonoros/push + Mapa de Execução estiverem visíveis ao enfermeiro.**

**Fase 1b — Abas clínicas + Regras 1/3/4:**
- Sinais Vitais (`VitalsTab.tsx` + `vitals.ts` → `clinical_vitals`).
- Fluidoterapia (`FluidTherapyCalculator.tsx` + `hospitalization-fluids.ts`) **com balanço hídrico (Regra 3)**.
- FIFO `stock_batches` + RPC reescrita (Regra 1).
- Conta (`InternacaoContaTab.tsx` + `hospitalization-charges.ts` + cron de diária) **com Alta Médica × Administrativa (Regra 4)**.
- Ficha enriquecida + leitos + **isolamento (Regra 2)** no Kanban/Mapa.

**Fase 2 — Protocolos:** `prescription_templates` + `ProtocolPicker.tsx` (1-clique).

**Fase 3 — Centro Cirúrgico:** `surgery/page.tsx`, `SurgeryKanban.tsx` (Preparo→Sala→RPA), `SurgeryFichaModal.tsx` (acordeão: Checklist Pré-Op → Ficha Anestésica → Relatório), voz hands-free, `SurgeryKitPicker.tsx` (unroll insumos + RPC baixa estoque + lança na conta), botão "Encaminhar para Internação" (`createHospitalization`). Migrations: `surgeries`, `service_kits`/`service_kit_items`.

## 4 Regras de negócio mandatórias

1. **FIFO estoque por lotes** — criar `stock_batches` + backfill (1 lote/item) e reescrever RPC `rpc_apply_stock_consumption` p/ consumo FIFO em cascata (`expiry_date ASC NULLS LAST, received_at ASC`, `FOR UPDATE`), encerrar lotes zerados, espelhar somatório em `stock_items.quantity`. Mantém atomicidade + "nunca trava" (faltou ⇒ último lote negativo + `requires_reconciliation`). Restock/NF-e passam a popular `stock_batches`.
2. **Isolamento (risco biológico)** — `hospitalizations.isolation_required` (bool, já na 0196) ⇒ contorno vermelho/âmbar + ícone biossegurança no Kanban e no Mapa de Execução.
3. **Balanço hídrico** — botão "Registrar Saída" (urina/êmese/sangramento) em ML → `hospitalization_fluid_balance`; aba calcula Saldo = Entradas − Saídas.
4. **Alta Médica × Administrativa** (só sob `internacao_completa`) — "Dar Alta" → `ready_for_discharge` (cessa diária + alertas de medicação); só sai do Kanban (`discharged`) na alta administrativa, após conta liquidada (`hospitalization_charges` quitadas). Flag off ⇒ fluxo atual intacto.

## Convenções operacionais (obrigatório seguir)

- **Modo ByPass:** sprint aprovada — executar fases sem pausar para confirmar cada passo. Só pausar em erro crítico bloqueante, VETO Legal, ou no **CHECKPOINT da Fase 1**.
- **Branch/deploy:** PO autorizou **commit direto na `main` + deploy contínuo** nesta sprint.
- **Push:** sempre `git push vetmax main` (canônico, deploy Vercel) **e** `git push origin main` (espelho). Se origin divergir: `git push origin main --force`.
- **Migrations:** aditivas, `IF NOT EXISTS`, `clinic_id` em tudo. Aplicar no remoto após criar: `npx supabase db push --include-all --yes`. Conflito de prefixo ⇒ renomear para o próximo número livre. Histórico órfão ⇒ `npx supabase migration repair --status reverted <versao>`.
- **CFMV:** alta/prescrição exigem `is_reviewed_by_vet`; controlados ⇒ "Receituário Azul". Consentimento via engine Canva existente.
- **Terminologia UI:** Pet/Animal (não "Paciente"), Tutor (não "Dono"), Médico Veterinário/MV (não só "Médico").
- **Testes:** Playwright (`tests/e2e/sprint-master-i0*-*.spec.ts`, `testInfo.skip()`, seed find-or-update) + pytest.

## Reuso-chave da base

- Aprazamento: `useMedicationScheduler.ts` (tick 15s), `MedicationAlertBadge`, `MedicationApplicationModal.tsx`, `hospitalization-prescriptions.ts::applyHospitalizationDose`, tabela `hospitalization_dose_administrations`.
- Timeline: `hospitalization_records` (já recebe logs automáticos).
- Estoque atômico: RPC `rpc_apply_stock_consumption` (migration 0186) via `consumeStockForApplication` (`src/lib/actions/stock-consumption.ts`).
- Voz/IA: `useClinicalVoiceAssistant`, `useFocusedVoiceCapture`, `extractHospitalizationVoice` (`actions/pharmacy.ts`), `ai_extraction.ts`.
- Faturamento: `billing.ts::generateInvoice`. Salas: `rooms` (`type` inclui `surgery`/`hospitalization`).
- Gate de rota: `requireModuleAccess(moduleName)` (`src/lib/server/require-module.ts`).
