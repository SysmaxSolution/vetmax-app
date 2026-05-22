# Sprint Petlove Inteligente — Resumo e Manual

Entregue em 2026-05-22.

## Sumário

A sprint dotou o VetMax de uma camada de inteligência sobre o convênio Petlove
(e qualquer outro provedor que seja semeado no mesmo padrão), para responder
antes do atendimento: "está coberto? a carência foi cumprida? quanto o tutor
paga?", e para identificar glosas depois.

---

## CHANGELOG

### Arquivos NOVOS

| Arquivo | Função |
|---|---|
| `supabase/migrations/0176_insurance_intelligence_layer.sql` | Migration aditiva: `pet_insurance.enrollment_date` + tabela `insurance_plan_coverage`. |
| `scripts/apply-0176-insurance-intelligence.js` | Aplicador da migration no Supabase remoto. |
| `scripts/seed-petlove-coverage.mjs` | Seed inicial dos 4 planos Petlove (Leve, Tranquilo, Ideal, Premium) × 27 procedimentos. |
| `src/lib/actions/insurance-coverage.ts` | Server actions: `getInsuranceCard(patientId)`, `checkProcedureCoverage(args)`, `checkBatchCoverage(args)`. |
| `src/lib/actions/insurance-checkout.ts` | Server actions: `previewConsultationInsurance(consultationId)`, `applyCheckoutInsuranceMarking(consultationId)`. |
| `src/lib/actions/petlove-glosas.ts` | Server actions: `getGlosasForRemittance(remittanceId)`, `getGlosaHistoryByProcedure()`. |
| `src/components/pet/InsuranceCard.tsx` | Card no prontuário do pet com plano, carência por categoria e badges. |
| `src/components/pet/CoverageChip.tsx` | Chip server-component reusável: `<CoverageChip patientId procedureName />`. |
| `src/components/financial/CheckoutInsurancePreview.tsx` | Prévia do caixa: split tutor agora × cartão Petlove × repasse. |
| `src/components/financial/TutorSummaryPrint.tsx` | Botão que abre janela de impressão com o resumo do atendimento para o tutor. |
| `src/components/financial/insurance/GlosasDashboard.tsx` | Painel de glosas por remessa: lista, top procedimentos, perda total. |
| `src/components/financial/insurance/GlosaHistoryHint.tsx` | Hint compacto com histórico de glosas (últimos 6 meses). |

### Arquivos MODIFICADOS

| Arquivo | O que mudou |
|---|---|
| `src/app/dashboard/patients/[id]/page.tsx` | + import e renderização do `InsuranceCard` no perfil do pet. Nenhum código removido. |
| `supabase/migrations/0176_*.sql` | + coluna `enrollment_date` em `pet_insurance` (aditiva, NULL permitido). |

### Migration aplicada

- **0176** — `pet_insurance.enrollment_date` + tabela `insurance_plan_coverage` (3 clínicas × 4 planos × 27 procedimentos = 324 registros semeados).

---

## MANUAL — Para quem nunca usou tecnologia

### 🐶 O que é Petlove?

A Petlove é um plano de saúde para o pet. O tutor paga uma mensalidade e a
Petlove paga uma parte dos atendimentos que o pet fizer na clínica. Como um
plano de saúde de gente, só que para cachorro e gato.

### 💡 O que mudou no VetMax?

Agora o sistema **entende quando o pet tem plano** e ajuda o veterinário a
não errar e a não perder dinheiro.

### 📋 As 5 telas novas, em linguagem simples

#### 1) **Cartão Azul do Convênio** (no prontuário do pet)

Quando você abre o prontuário de um pet que tem plano Petlove, agora aparece
um **cartão azul** no topo dizendo:

- Qual o plano (Leve, Tranquilo, Ideal ou Premium)
- Há quantos dias o tutor é cliente
- Que tipos de procedimento já podem ser feitos
- Que tipos ainda precisam esperar (carência)

> **Pense assim:** é como uma "carteirinha digital" que mostra na hora se você
> pode ou não atender aquele pet pelo plano hoje.

#### 2) **Selo de Cobertura ao escolher um procedimento**

Quando o veterinário vai marcar um procedimento (uma vacina, um exame, uma
cirurgia), o sistema mostra um **selo colorido** dizendo:

- 🟢 **Verde** — pode fazer, está coberto. O tutor paga só R$ X de taxa.
- 🟡 **Amarelo** — está coberto, mas o pet ainda está na carência. Falta XX
  dias para liberar.
- 🔴 **Vermelho** — esse procedimento não está no plano do pet. O tutor vai
  precisar pagar valor cheio (particular).
- ⚪ **Cinza** — sem plano ou sistema não conhece esse procedimento ainda.

> **Pense assim:** semáforo. Verde pode, amarelo cuidado, vermelho não. Evita
> fazer um procedimento que a Petlove vai recusar pagar depois.

#### 3) **Caixa Inteligente** (na hora do pagamento)

Antes, quando o tutor ia pagar, o caixa tinha que calcular na mão quanto era
do tutor e quanto era do plano. Agora o sistema mostra um **quadro azul**:

| Onde | Quanto |
|---|---|
| 💵 **Cobrar do tutor agora no caixa** | R$ X |
| 💳 **Petlove vai cobrar no cartão** (em até 30 dias) | R$ Y |
| 📄 **Vai pra "A Receber" do convênio** (a clínica recebe depois) | R$ Z |
| 💚 **Tutor economizou** | R$ W |

> **Pense assim:** uma planilha já pronta dizendo "esse aqui você cobra agora,
> esse aqui não cobra porque a Petlove desconta do cartão dele depois".

#### 4) **Resumo para o tutor levar pra casa**

Botão "Resumo para o tutor" — gera uma folha bonitinha para imprimir ou
salvar em PDF mostrando ao tutor:

- O que foi feito hoje
- Quanto custaria sem o plano (preço cheio)
- Quanto ele pagou no caixa
- Quanto a Petlove vai cobrar no cartão
- Quanto ele economizou usando o plano

> **Pense assim:** é como aquele papel que o supermercado dá no fim mostrando
> "você economizou R$ 50 com os descontos". Vira propaganda do bom serviço.

#### 5) **Painel de Glosas** (depois que a Petlove paga)

"Glosa" é quando a clínica fez o atendimento, mandou pra Petlove, mas a
Petlove **se recusou a pagar**. Acontece muito quando falta documento,
quando o procedimento estava em carência, ou quando passa do prazo.

Agora, quando a remessa fechada da Petlove chega no sistema, aparece um
**painel vermelho** mostrando:

- Quantos atendimentos não foram pagos
- Quanto a clínica perdeu (em reais)
- Quais procedimentos a Petlove mais recusou pagar
- A lista completa, atendimento por atendimento

> **Pense assim:** é como uma "lista do que tem que ir atrás" — sem o
> painel, esses valores ficariam perdidos. Agora a clínica vê e pode pedir
> revisão (recurso) na Petlove.

---

### 🎯 Como usar no dia a dia

#### Cenário 1: Tutor chega na recepção
1. Você abre o prontuário do pet
2. Vê o **cartão azul** lá em cima — confirma que tem plano Petlove ativo
3. Olha as carências: "Cirurgia faltam 45 dias" → ainda não pode operar
4. Atende normal

#### Cenário 2: Veterinário vai propor procedimento
1. Antes de fazer, dá uma olhada no selo de cobertura
2. Se for verde, faz tranquilo
3. Se for amarelo, conversa com o tutor: "Pode esperar X dias ou paga particular?"
4. Se for vermelho, já avisa o tutor que vai ser particular antes

#### Cenário 3: Cobrar no caixa
1. Olha o quadro azul "Caixa Inteligente"
2. Cobra do tutor só o que está em "Cobrar do tutor agora"
3. Avisa: "A Petlove vai descontar mais R$ Y no seu cartão até 30 dias"
4. Imprime o "Resumo para o tutor" e entrega — fideliza

#### Cenário 4: Final do mês quando a Petlove paga
1. Importa a remessa fechada como sempre
2. Abre o "Painel de Glosas"
3. Vê o que não veio: "Microchipagem do Bob não foi pago — R$ 10"
4. Junta documentação e pede recurso direto na Petlove
5. Sistema mostra o histórico — você aprende quais procedimentos a Petlove
   mais glosa e começa a tomar cuidado

---

### 🛠️ Para o pessoal de tecnologia

#### Como integrar em telas existentes

**Card de convênio** — já está no prontuário do pet automaticamente.

**Chip de cobertura** — use em qualquer tela:
```tsx
import CoverageChip from '@/components/pet/CoverageChip'
<CoverageChip patientId={pet.id} procedureName="Vacina V8" />
<CoverageChip patientId={pet.id} stockItemId={item.id} detailed />
```

**Prévia do caixa** — em qualquer tela de fechamento de consulta:
```tsx
import CheckoutInsurancePreview from '@/components/financial/CheckoutInsurancePreview'
<CheckoutInsurancePreview consultationId={consult.id} />
```

**Painel de glosas** — após import de remessa fechada:
```tsx
import GlosasDashboard from '@/components/financial/insurance/GlosasDashboard'
<GlosasDashboard remittanceId={remittance.id} />
```

#### Auto-aprendizado do catálogo

A tabela `insurance_plan_coverage` foi semeada com dados públicos da Petlove.
A cada remessa fechada importada, o sistema pode refinar `copay_amount` com a
média observada (TODO: ativar `learnCoverageFromRemittance(remittanceId)` no
fluxo de `applyReconciliation`).

#### Estendendo para outros provedores

Para suportar Porto Pet Saúde, Petsaúde, etc., basta semear a tabela
`insurance_plan_coverage` com os procedimentos × planos do novo provider.
Toda a lógica de UI já funciona genericamente — usa `provider_id`.

---

## Próximos passos sugeridos (fora do escopo)

- **Auto-aprendizado de copay** alimentado pelas remessas fechadas
- **Botão "Recurso de Glosa"** que monta o pacote (NF + prontuário + foto + autorização) e exporta PDF/ZIP
- **API/Browser automation com Portal Petlove Central** para autorizar atendimento direto do VetMax
- **IA preditiva de glosa** baseada em histórico (avisa amarelo antes de aprovar procedimento de risco)
- **Catálogo de cobertura compartilhado entre clínicas** (federalizar o seed)
