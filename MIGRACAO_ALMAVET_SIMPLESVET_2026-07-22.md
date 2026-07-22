# Estudo de Migração — SimplesVet → Sysvetmax · Almavet (22/07/2026)

*Análise do export `20260722__Exportacao_Dados__RhDAHJmOmo__Almavet_Clinica_Veterinaria.xlsx` (23 abas). Estudo apenas — nenhuma migração executada.*

## 1. Inventário e qualidade

| Aba | Registros | Qualidade / observações |
|---|---|---|
| Responsáveis (tutores) | **803** | CPF 95% · telefone 97% · e-mail 72% · endereço 96% · nascimento 27% · petloveSaudeId 12% |
| Animais | **1.187** | 895 caninos, 291 felinos, 41 falecidos · nascimento 98% · raça 99% · sexo 98% · microchip 46% · castrado 94% |
| Consultas | **1.423** | ago/2022 → **22/07/2026 (hoje!)** · anamnese 99,9% · diagnóstico só 18 (texto vive na anamnese) |
| Pesos | **2.306** | peso + escore corporal (BCS) + data — histórico completo |
| Vacinas | **2.293** | = **1.415 aplicações + 878 lembretes** (`isReminder=True`) · tipo 100% · lote/validade 59% |
| Anexos | **2.805** | **TODOS com URL em `parse.vetsmart.com.br`** (tipo 1=exames: 2.677) |
| Orçamentos e Vendas | **912** | 637 vendas + 275 orçamentos · `services` e `payments` em JSON (tipo, parcelas, bandeira) |
| Serviços (catálogo) | 197 | nome, valor, categoria, duração |
| Insumos / Transações | 85 / 239 | estoque com min/max, distribuidor; movimentos +/− |
| Agenda | 176 | dez/2023 → mai/2026 (nada futuro relevante) |
| Despesas | 48 | contas pagas simples |
| Atestados e Termos | 29 | estruturados (tipo, evento, vet, CRMV) |
| Protocolos de Vacinas | 4 | V7/V10, doses, intervalos |
| Medicamentos 14 · Prescrições 5 · Cirurgias 5 · Exames 4 · Retornos 4 · Tags 9 · Categorias 22 | — | volumes mínimos — migrar como texto no histórico |

Higienização necessária: nomes com espaço à esquerda (` Camila…`), espécie com typo (`Canina`), datas em string, JSONs embutidos (drugs/surgeries/services/payments).

## 2. Mapeamento → schema Sysvetmax

| Origem | Destino | Status |
|---|---|---|
| Responsáveis | `tutors` (name, cpf, email, phone, street/number/neighborhood/city/state/cep, notes) | ✅ direto — **merge por CPF** (95%) |
| Animais | `patients` (species dog/cat, breed, gender, neutered, birth_date, microchip, color←pelage, behavior_tags←temperament, notes←rga/otherInfo, deceased_at←flag) | ✅ direto — merge nome+tutor (lição Petlove) |
| Consultas | `consultations` (anamnesis, vet_notes←physicalExam+treatment, suggested_diagnosis, weight, `inclusion_source='migracao_simplesvet'`, status completed) | ✅ direto — entram como histórico legado imutável |
| Vacinas (aplicações) | `patient_vaccines` — **cobertura 100%**: vaccine_type, dose_number/dose_total, manufacturer, lot_number, validity_date | ✅ direto |
| Vacinas (lembretes, 878) | `next_due_date` + recall WhatsApp existente | ✅ vira feature na virada |
| Anexos | `patient_attachments` (existe: file_url, file_name, document_date, notes) | ✅ direto — **após download dos arquivos** |
| Vendas/Orçamentos | `invoices`/histórico financeiro com flag legado (payments JSON → forma de pgto/parcelas) | ⚠️ decidir: registro histórico consultável, sem recriar caixa |
| Despesas | `financial_entries` (type despesa, category, payment_date) | ✅ direto |
| Serviços | `clinic_catalog` (item_type heurístico por categoria) | ✅ direto |
| Insumos/Transações | `stock_items` + lotes/movimentos | ✅ direto |
| Agenda | `appointments` (existe, com source) | ✅ só se quiserem histórico (nada futuro) |
| Atestados/Termos | `patient_attachments` (PDF gerado) ou notes | ⚠️ baixo volume, decidir formato |
| Protocolos de Vacinas | — | ⚠️ sem equivalente; 4 registros — configurar à mão |
| Pesos (2.306) | **SEM DESTINO HOJE** | ❌ gap — ver §3 |

## 3. Gaps de banco (migrations aditivas, `IF NOT EXISTS`)

1. **`patient_weights` (tabela nova)** — patient_id, clinic_id, weight_kg, body_score, measured_at, source, notes. Recebe os 2.306 registros e vira **feature de curva de peso** para todo o produto (dado clínico valioso que hoje só guardamos como "último peso").
2. **`tutors.rg` e `tutors.birth_date`** — campos novos (RG usado nos termos CFMV; nascimento 27% preenchido). `landlinePhone` e `referredBy` → concatenar em `notes` (não justificam coluna).
3. **`patients.size`** (porte P/M/G) — campo novo simples; usado por banho/tosa e dosagem. `rga` → notes.
4. **`migration_id_map` (tabela de staging)** — objectId SimplesVet → UUID nosso, por entidade. Garante idempotência (rodar 2×sem duplicar) e a **carga em 2 ondas** (§4).
5. Verificado que NÃO precisa: vacinas (patient_vaccines já cobre tudo), anexos (patient_attachments existe), despesas (financial_entries existe), agenda (appointments existe).

## 4. Riscos e plano de execução

1. **🔴 URGENTE — Anexos no Parse da Vetsmart**: os 2.805 arquivos (laudos de lab de 4 anos!) estão em `parse.vetsmart.com.br`. Quando o contrato encerrar, o acesso pode morrer. **Primeira ação da migração: script de download de todos os arquivos → Supabase Storage**, antes de qualquer outra coisa.
2. **A Almavet ainda usa a SimplesVet HOJE** (consulta registrada em 22/07). Migração em **2 ondas**: carga inicial agora + **delta no dia da virada** (novo export só do período). O `migration_id_map` viabiliza isso.
3. **Merge, não import**: a Almavet opera no Sysvetmax — casar tutores por CPF e pets por nome+tutor antes de criar (nunca delete+create). `petloveSaudeId` (12%/18%) ajuda a triangular com os vínculos Petlove existentes.
4. **CFMV**: consultas migradas entram como `completed` com origem marcada — são histórico legado, não passam pelo gate de revisão; imutabilidade preservada.
5. **Vacinas**: separar aplicações (1.415) de lembretes (878) pelo `isReminder` — lembrete NÃO é dose aplicada; alimenta o recall.
6. Feature flag como sempre: qualquer tela nova (curva de peso) condicionada a configuração.

**Esforço estimado do conjunto** (fora deste estudo): 2 migrations aditivas + script ETL idempotente + script de download de anexos + validação com a Lais ≈ 3–4 dias de trabalho focado, dominado pela conferência com ela (amostragem de prontuários).
