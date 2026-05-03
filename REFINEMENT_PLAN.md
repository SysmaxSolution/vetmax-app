# 🎯 Plano de Refinamento VetMax — Layout HealthMax Idêntico

**Opus 4.6 Sprint**  
**Data:** 2026-04-06  
**Objetivo:** Layout pixel-perfect como HealthMax + Módulos Veterinários

---

## 🔍 DIAGNÓSTICO DE PROBLEMAS

### 1. DashboardHeader
**Status:** Funciona, mas visual pode melhorar
- ❌ Espaçamento inconsistente
- ❌ Responsividade em mobile não ideal
- ❌ Icons profissionais importados, mas espaçamento ruim
- ✅ Cores e tipografia OK

**Correção Necessária:**
- [ ] Ajustar padding/margin uniformemente
- [ ] Melhorar spacing no menu
- [ ] Refinar hover states
- [ ] Mobile: hide labels, show icons only

### 2. ReceptionWorkspace
**Status:** Bom, mas inconsistências
- ❌ Cards têm tamanho/padding variável
- ❌ Botões não estão padronizados (teal-600 é não-padrão)
- ❌ Spacing entre elementos inconsistente
- ✅ Estrutura está OK

**Correção Necessária:**
- [ ] Trocar teal-600 por blue-600 (padrão)
- [ ] Standardizar padding em cards
- [ ] Unificar border-radius
- [ ] Shadows devem ser `shadow-sm`

### 3. NurseWorkspace (Triagem)
**Status:** Boa estrutura, mas refinamento visual
- ❌ Título muito grande (3xl)
- ❌ Contador em destaque ruim
- ❌ Cards de triagem precisam consistência
- ✅ Ícones e cores OK

**Correção Necessária:**
- [ ] Título: 2xl (mais elegante)
- [ ] Contador: mover para card header
- [ ] Padronizar styling de cards
- [ ] Melhorar espaçamento

### 4. TriageForm
**Status:** Muita informação, layout ruim
- ❌ Muito conteúdo acumulado
- ❌ Formulário precisa ser mais compacto
- ❌ Cores de mucosa e CRT precisam refinamento visual
- ✅ Validações estão OK

**Correção Necessária:**
- [ ] Reorganizar seções com abas
- [ ] Compactar espaçamento
- [ ] Refinar visual de cores de mucosa
- [ ] Melhorar UX de CRT selection

### 5. SettingsClient
**Status:** Excelente, mas detalhes
- ❌ Checklist visual pode melhorar
- ✅ Abas estão boas
- ✅ Cards estão profissionais
- ✅ Responsividade OK

**Correção Necessária:**
- [ ] Refinar visual do checklist
- [ ] Melhorar feedback de edição
- [ ] Icons para checklist items

---

## 🚀 MÓDULOS VETERINÁRIOS A CRIAR

### 1. VetWorkspace (/dashboard/vet)
**Responsabilidade:** Atendimento clínico do MV

**Estrutura:**
```
VetWorkspace
├── Fila de Atendimento (triagens prontas)
├── Prontuário Eletrônico (rich text + IA)
├── Prescrição
└── Histórico de Consultas
```

**Componentes Novos:**
- `VetWorkspace.tsx` — Dashboard principal
- `ConsultationCard.tsx` — Card de consulta
- `ProntuarioEditor.tsx` — Editor de prontuário
- `PrescriptionForm.tsx` — Prescrição de medicamentos

### 2. ExamsModule (/dashboard/exams)
**Responsabilidade:** Gestão de exames

**Estrutura:**
```
ExamsWorkspace
├── Exames Pendentes
├── Resultados Recebidos
└── Histórico
```

### 3. PharmacyModule (/dashboard/pharmacy)
**Responsabilidade:** Dispensação e farmacêutica

**Estrutura:**
```
PharmacyWorkspace
├── Prescrições Pendentes
├── Medicamentos Dispensados
└── Estoque
```

---

## 📋 CHECKLIST DE REFINAMENTO

### FASE 1: Padronização Visual (HIGH PRIORITY)

**DashboardHeader:**
- [ ] Refatorar espaçamento (px-6 → max-width container)
- [ ] Ajustar padding vertical (py-3.5 → py-3)
- [ ] Menu items: gap-1 → gap-0, com border-b smooth
- [ ] Mobile: hide text labels, show icons only
- [ ] Hover states: color transition, not bg

**Cores Padrão:**
- [ ] blue-600 para ativo
- [ ] gray-600 para inactive
- [ ] gray-900 para texto
- [ ] Remover todas as cores alternativas (teal, amber, etc)

**Buttons:**
- [ ] Primary: bg-blue-600, hover:bg-blue-700
- [ ] Secondary: border border-gray-300, text-gray-700
- [ ] Size: px-4 py-2 (padrão), px-6 py-3 (large)
- [ ] Todos: rounded-lg, transition-colors

**Cards:**
- [ ] Padding: p-6 (padrão)
- [ ] Border: border-gray-200
- [ ] Shadow: shadow-sm (não shadow-md ou greater)
- [ ] Border-radius: rounded-lg (8px)

**Spacing:**
- [ ] Seções: mb-8
- [ ] Cards: mb-6
- [ ] Elementos: mb-4
- [ ] Compact: mb-2

### FASE 2: Componentes Veterinários (MEDIUM PRIORITY)

- [ ] Criar VetWorkspace
- [ ] Criar ExamsWorkspace
- [ ] Criar PharmacyWorkspace
- [ ] Rotas: /dashboard/vet, /dashboard/exams, /dashboard/pharmacy
- [ ] Adicionar ao DashboardHeader (visibilidade por role)

### FASE 3: Refinamento Fino (LOW PRIORITY)

- [ ] Animações smooth (transitions)
- [ ] Loading states
- [ ] Empty states
- [ ] Error handling visual

---

## 📐 PADRÃO DE LAYOUT FINAL

```
┌─────────────────────────────────────────────────────────────────┐
│ VetMax — Clínica       Olá, João Silva    ⚙️  🚪                │
├─────────────────────────────────────────────────────────────────┤
│ 🏠 Rec  👥 Triagem  🩺 Consultório  🧪 Exames  💊 Farmácia      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ max-w-6xl mx-auto px-6 py-8                                    │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐
│ │ Page Title (2xl bold) — Subtitle                            │
│ ├─────────────────────────────────────────────────────────────┤
│ │                                                             │
│ │ [Card 1 — p-6, rounded-lg, shadow-sm]                     │
│ │ ┌─────────────────────────────────────────────────────┐  │
│ │ │ Section Header (lg bold)                            │  │
│ │ ├─────────────────────────────────────────────────────┤  │
│ │ │                                                     │  │
│ │ │ Content (grid, mb-4 spacing)                        │  │
│ │ │                                                     │  │
│ │ └─────────────────────────────────────────────────────┘  │
│ │                                                             │
│ │ [Card 2 — p-6, rounded-lg, shadow-sm]                     │
│ │ ...                                                         │
│ │                                                             │
│ └─────────────────────────────────────────────────────────────┘
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Cores Finais

```css
/* Primary */
--color-primary: #2563EB;      /* blue-600 */

/* Grayscale */
--color-text-primary: #111827;     /* gray-900 */
--color-text-secondary: #4B5563;   /* gray-600 */
--color-bg-default: #FFFFFF;       /* white */
--color-bg-subtle: #F9FAFB;        /* gray-50 */
--color-border: #E5E7EB;           /* gray-200 */

/* Semantic */
--color-success: #10B981;      /* green-500 */
--color-error: #EF4444;        /* red-500 */
--color-warning: #F59E0B;      /* amber-500 */
```

---

## 📦 Arquivos a Criar/Modificar

### Criar:
- [ ] `src/app/dashboard/vet/page.tsx`
- [ ] `src/components/vet/VetWorkspace.tsx`
- [ ] `src/components/vet/ConsultationCard.tsx`
- [ ] `src/components/vet/ProntuarioEditor.tsx`
- [ ] `src/app/dashboard/exams/page.tsx`
- [ ] `src/components/exams/ExamsWorkspace.tsx`
- [ ] `src/app/dashboard/pharmacy/page.tsx`
- [ ] `src/components/pharmacy/PharmacyWorkspace.tsx`

### Modificar:
- [ ] `src/components/layout/DashboardHeader.tsx` (refinement)
- [ ] `src/components/reception/ReceptionWorkspace.tsx` (colors, spacing)
- [ ] `src/components/triage/NurseWorkspace.tsx` (spacing, visual)
- [ ] `src/components/triage/TriageForm.tsx` (compacting, refactor)
- [ ] `src/components/settings/SettingsClient.tsx` (minor tweaks)

---

## ✅ Definição de Pronto

Layout é considerado **pronto** quando:
1. ✅ Todas as cores seguem padrão (blue-600, gray-*)
2. ✅ Todos os cards têm p-6, rounded-lg, shadow-sm
3. ✅ Spacing uniforme (mb-6 entre cards, mb-4 entre elementos)
4. ✅ DashboardHeader limpo e profissional
5. ✅ Responsivo (mobile, tablet, desktop)
6. ✅ Sem cores alternativas (teal, amber, etc)
7. ✅ Tipografia consistente
8. ✅ Ícones profissionais (Lucide, não emojis)
9. ✅ Botões padronizados
10. ✅ Módulos veterinários criados

---

## 🎯 Ordem de Execução

1. **DashboardHeader** (impacta todo o sistema)
2. **Colors & Spacing** (refactor global)
3. **ReceptionWorkspace** (refactor)
4. **NurseWorkspace** (refactor)
5. **SettingsClient** (refinement)
6. **VetWorkspace** (novo)
7. **ExamsWorkspace** (novo)
8. **PharmacyWorkspace** (novo)

---

**Estimated Time:** 2-3 horas com Opus  
**Build Validation:** npm run build após cada fase  
**Visual QA:** Chrome DevTools responsiveness
