# Sprint Petlove Inteligente — Resumo, Manual e Status Real

Entregue em 2026-05-22. **Auditoria + plug completo em 2026-05-22 (revisão).**

## Sumário

A sprint dotou o VetMax de uma camada de inteligência sobre o convênio Petlove
(e qualquer outro provedor seguindo o mesmo padrão), para responder antes do
atendimento: "está coberto? a carência foi cumprida? quanto o tutor paga?", e
para identificar glosas depois.

---

## ✅ Status real (após revisão completa)

| Feature | Plug | Aparece em |
|---|---|---|
| **Cartão Azul do Convênio** | ✅ | Perfil do pet, Triagem, Consulta MV, Exames, Internação |
| **Selo de Cobertura (chip verde/amarelo/vermelho)** | ✅ | Ao digitar medicação na seção clínica do consultório |
| **Caixa Inteligente** (split tutor × cartão × repasse) | ✅ | Modal de Checkout (caixa) |
| **Resumo para o Tutor** (botão imprimir) | ✅ | Rodapé do Caixa Inteligente |
| **Painel de Glosas** | ✅ | Tela de Revisão da Remessa |
| **Hint de Histórico de Glosas** | ✅ | Topo da Revisão + Perfil do pet |
| **Auto-aprendizado de copay** | ✅ | Roda automático em cada `applyReconciliation` |

---

## CHANGELOG

### Migrations
- **0176** — `pet_insurance.enrollment_date` + tabela `insurance_plan_coverage` (3 clínicas × 4 planos × 27 procedimentos = 324 registros semeados).

### Arquivos NOVOS

| Arquivo | Função |
|---|---|
| `supabase/migrations/0176_insurance_intelligence_layer.sql` | Migration aditiva |
| `scripts/apply-0176-insurance-intelligence.js` | Aplicador da migration |
| `scripts/seed-petlove-coverage.mjs` | Seed inicial dos 4 planos × 27 procedimentos |
| `src/lib/actions/insurance-coverage.ts` | Server actions de cobertura + auto-learn |
| `src/lib/actions/insurance-checkout.ts` | Server actions do caixa inteligente |
| `src/lib/actions/petlove-glosas.ts` | Server actions de glosas |
| `src/components/pet/InsuranceCard.tsx` | Cartão de convênio (server component) |
| `src/components/pet/CoverageChip.tsx` | Selo server (uso em telas server) |
| `src/components/pet/CoverageChipClient.tsx` | Selo client com debounce — uso em forms |
| `src/components/financial/CheckoutInsurancePreview.tsx` | Quadro azul do caixa |
| `src/components/financial/TutorSummaryPrint.tsx` | Botão imprimir resumo para o tutor |
| `src/components/financial/insurance/GlosasDashboard.tsx` | Painel vermelho de glosas |
| `src/components/financial/insurance/GlosaHistoryHint.tsx` | Hint compacto de glosas |

### Arquivos MODIFICADOS

| Arquivo | O que mudou |
|---|---|
| `src/app/dashboard/patients/[id]/page.tsx` | + import + render `InsuranceCard` + `GlosaHistoryHint` |
| `src/app/dashboard/triage/[id]/page.tsx` | + `getInsuranceCard` + prop ao TriageForm |
| `src/app/dashboard/vet/[id]/page.tsx` | + `getInsuranceCard` + prop ao ConsultationDetail |
| `src/app/dashboard/exams/[id]/page.tsx` | + `getInsuranceCard` + prop ao ExamDetail |
| `src/app/dashboard/financial/insurance-reconciliation/[id]/review/page.tsx` | + `GlosaHistoryHint` (topo) + `GlosasDashboard` (rodapé) |
| `src/components/triage/TriageForm.tsx` | + prop `insuranceCard` + render do card |
| `src/components/vet/ConsultationDetail.tsx` | + prop + render do card + passa `patientId` ao ClinicalActionsSection |
| `src/components/vet/ClinicalActionsSection.tsx` | + prop `patientId` + render do `CoverageChipClient` |
| `src/components/exams/ExamDetail.tsx` | + prop + render do card |
| `src/components/hospitalization/HospitalizationDetailModal.tsx` | + `getInsuranceCard` via useEffect + render do card |
| `src/components/reception/CheckoutModal.tsx` | + `CheckoutInsurancePreview` abaixo do InsuranceExportPanel |
| `src/lib/actions/petlove-reconciliation.ts` | + chamada de `learnCoverageFromRemittance` após reconcile |

---

## MANUAL — Para quem nunca usou tecnologia

### 🐶 O que é Petlove?

A Petlove é um plano de saúde para o pet. O tutor paga uma mensalidade e a
Petlove paga uma parte dos atendimentos. Como um plano de saúde de gente,
só que para cachorro e gato.

### 💡 O que mudou no VetMax?

Agora o sistema **entende quando o pet tem plano** e ajuda o veterinário a
não errar e a não perder dinheiro.

### 📋 As 7 funcionalidades novas, em linguagem simples

#### 1) 💳 **Cartão Azul do Convênio**

Quando você abre um pet com plano Petlove, aparece um **cartão azul** no topo
mostrando:

- Plano contratado (Leve, Tranquilo, Ideal ou Premium)
- Há quantos dias o tutor é cliente
- Quais procedimentos já podem ser feitos
- Quais ainda estão em carência (e quantos dias faltam)

**Aparece em:** Perfil do pet, Triagem, Consulta MV, Exames, Internação

> **Pense assim:** é uma "carteirinha digital" sempre à vista durante o atendimento.

#### 2) 🚦 **Selo de Cobertura (semáforo)**

Quando o veterinário digita um nome de medicação ou procedimento, aparece um
selo colorido logo abaixo:

- 🟢 **Verde** — coberto. Mostra o copay (R$ X).
- 🟡 **Amarelo** — coberto, mas em carência. Mostra quantos dias faltam.
- 🔴 **Vermelho** — não coberto pelo plano. Cobrar particular.
- ⚪ **Cinza** — sem convênio ou procedimento desconhecido.

**Aparece em:** Seção clínica do prontuário (ao digitar o nome do medicamento)

#### 3) 💰 **Caixa Inteligente**

Quando o caixa abre uma fatura para cobrar, aparece um **quadro azul** com 4
caixinhas:

| Caixinha | O que significa |
|---|---|
| 💵 Cobrar do tutor agora no caixa | Coparticipação que **a clínica** cobra |
| 💳 Petlove cobra no cartão | Coparticipação que **a Petlove** cobra |
| 📄 Vai para "A Receber" Petlove | Valor que a Petlove vai pagar no fim do mês |
| 💚 Tutor economizou | Quanto custaria sem o plano |

**Aparece em:** Modal de Checkout no caixa

#### 4) 🖨️ **Resumo para o Tutor**

Botão **"Resumo para o tutor"** no rodapé do Caixa Inteligente. Abre uma
janela de impressão (vira PDF facilmente) com tudo que aconteceu — o tutor
leva pra casa.

#### 5) 🚫 **Painel de Glosas**

Quando você abre uma remessa Petlove fechada, aparece um **painel vermelho**
no final da página mostrando:

- Quantos atendimentos a Petlove **não pagou**
- Quanto a clínica perdeu (R$)
- Top procedimentos glosados
- Lista completa atendimento por atendimento

**Aparece em:** Revisão de Remessa (após a importação fechada)

#### 6) ⚠️ **Hint de Histórico de Glosas**

Caixa amarela compacta com os procedimentos que mais foram glosados nos
últimos 6 meses. Funciona como **aviso prévio** — antes de fazer aquele
procedimento, você lembra que a Petlove costuma recusar.

**Aparece em:** Topo da Revisão de Remessa + Perfil do pet (abaixo do cartão)

#### 7) 🤖 **Auto-aprendizado de Copay**

Toda vez que uma remessa fechada é conciliada, o sistema **automaticamente**
recalcula a coparticipação média de cada procedimento × plano e atualiza o
catálogo. Procedimentos novos da Petlove que ainda não estavam no catálogo
são **adicionados sozinhos**.

**Funcionamento:** invisível ao usuário, roda em background no `applyReconciliation`.

---

### 🎯 Como usar no dia a dia

#### Cenário 1: Tutor chega na recepção
1. Recepcionista clica no nome do pet → vê o **cartão azul** com o plano
2. Vê a carência: "Cirurgia: 45d" → ainda não pode operar pelo plano
3. Conversa com o tutor antes de marcar

#### Cenário 2: Veterinário propõe procedimento
1. Vet digita "Vacina Antirrábica" no campo de medicação
2. Selo verde aparece: "Coberto · copay R$ 25,00"
3. Faz a vacina tranquilo — sabe que a Petlove vai pagar a maior parte

Outro caso:
1. Vet digita "Cirurgia castração"
2. Selo amarelo: "Em carência · faltam 60 dias"
3. Conversa com tutor: "Esperar 60 dias ou paga particular?"

#### Cenário 3: Cobrar no caixa
1. Caixa abre o Checkout
2. **Quadro azul** mostra:
   - Cobrar agora: R$ 30
   - Petlove cobrará no cartão: R$ 12,50
   - A receber Petlove: R$ 35
   - Tutor economizou: R$ 22,50
3. Cobra apenas R$ 30 do tutor
4. Clica "Resumo para o tutor" → imprime/PDF → entrega ao tutor

#### Cenário 4: Final do mês, importou remessa Petlove
1. Vai em Conciliação Petlove → abre a remessa fechada
2. No topo, vê o **hint amarelo**: "Microchipagem foi glosada 5× nos últimos 6 meses"
3. No rodapé, vê o **painel vermelho**: 12 atendimentos não pagos, perda R$ 178
4. Lista mostra quais foram — junta documentação e contesta na Petlove

---

### 🛠️ Para o pessoal de tecnologia

#### Componentes prontos para reuso

```tsx
// Card de convênio em qualquer tela server
import InsuranceCard from '@/components/pet/InsuranceCard'
import { getInsuranceCard } from '@/lib/actions/insurance-coverage'

const card = await getInsuranceCard(patientId)
{!('error' in card) && card.has_insurance && <InsuranceCard data={card} />}

// Selo de cobertura em forms client
import CoverageChipClient from '@/components/pet/CoverageChipClient'
<CoverageChipClient patientId={pet.id} procedureName={medName} />
<CoverageChipClient patientId={pet.id} stockItemId={item.id} detailed />

// Prévia do caixa
import CheckoutInsurancePreview from '@/components/financial/CheckoutInsurancePreview'
<CheckoutInsurancePreview
  consultationId={consult.id}
  patientName={pet.name}
  tutorName={tutor.name}
/>

// Painel de glosas
import GlosasDashboard from '@/components/financial/insurance/GlosasDashboard'
<GlosasDashboard remittanceId={remittance.id} />

// Hint de histórico de glosas
import GlosaHistoryHint from '@/components/financial/insurance/GlosaHistoryHint'
<GlosaHistoryHint limit={5} />
```

#### Estendendo para outros provedores

Para suportar Porto Pet Saúde, Petsaúde, etc., basta semear a tabela
`insurance_plan_coverage` com os procedimentos × planos do novo provider.
Toda a lógica de UI já funciona genericamente — usa `provider_id`.

#### Auto-aprendizado de copay

Implementado em `learnCoverageFromRemittance(remittanceId)` em
`src/lib/actions/insurance-coverage.ts`. Roda dentro de `applyReconciliation`
após a remessa ser conciliada. Refina copays com média móvel ponderada
(70% histórico + 30% nova observação) e adiciona procedimentos novos ao
catálogo automaticamente.

---

## Próximos passos sugeridos (fora do escopo)

- **Botão "Recurso de Glosa"** que monta o pacote (NF + prontuário + foto + autorização) e exporta PDF/ZIP
- **API/Browser automation com Portal Petlove Central** para autorizar atendimento direto do VetMax
- **IA preditiva de glosa** baseada em histórico (avisa amarelo antes de aprovar procedimento de risco)
- **Catálogo de cobertura compartilhado entre clínicas** (federalizar o seed)
- **Versão React Native do CoverageChipClient** para apps mobile da clínica
