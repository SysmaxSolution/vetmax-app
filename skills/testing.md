# Testing — Estratégia de Testes (Unit, Integration, E2E)

**Data:** 2026-04-06  
**Criticidade:** 🔴 CRÍTICO — Bloqueador de Produção

---

## 🎯 Regra de Ouro

> **Toda alteração crítica (fluxo clínico, prescrição, exames) DEVE ter testes.**  
> **Cobertura mínima: 80%**  
> **Sem testes, não há deploy em produção.**

---

## 📊 Estrutura de Testes

```
tests/
├── unit/                    # Testes isolados
│   ├── actions/            # Server actions
│   ├── utils/              # Funções helpers
│   └── validators/         # Validação de input
│
├── integration/            # Testes com BD
│   ├── consultation/       # Fluxos de consulta
│   ├── prescription/       # Prescrições
│   └── exams/              # Exames
│
└── e2e/                    # Testes completos (playwright)
    ├── reception-flow.spec.ts
    ├── triage-flow.spec.ts
    └── prescription-flow.spec.ts
```

---

## 🧪 Unit Tests

**O testar:**
- Funções puras (cálculos, formatações)
- Validadores (CPF, peso, temperatura)
- Conversores (JSONB → object)

**Framework:** Jest (ou Vitest)

**Exemplo:**
```typescript
describe('Dosage Calculator', () => {
  it('calculates correct dosage: 0.1mg/kg × 20kg = 2mg', () => {
    expect(calculateDosage(0.1, 20)).toBe(2)
  })

  it('throws error if weight is invalid', () => {
    expect(() => calculateDosage(0.1, -5)).toThrow()
  })
})
```

---

## 🔗 Integration Tests

**O testar:**
- Fluxos clínicos completos (reception → triage → consultation)
- API endpoints (consulta criada, prescription armazenada)
- RLS policies (usuário de clínica A não vê dados de clínica B)

**Framework:** Jest + Supabase emulator

**Exemplo:**
```typescript
describe('Consultation Flow', () => {
  it('creates consultation and triages it', async () => {
    const consultation = await createConsultation(petId, tutorId)
    expect(consultation.status).toBe('reception')

    const triaged = await triageConsultation(consultation.id, vitals)
    expect(triaged.status).toBe('ready_for_vet')
    expect(triaged.vital_signs.weight_kg).toBe(22.5)
  })

  it('RLS blocks access to other clinic data', async () => {
    const clinic2Data = await getClinic2Consultations() // clinic 2
    expect(clinic2Data).toBeNull() // clinic 1 user vê null
  })
})
```

---

## 🎬 E2E Tests

**O testar:**
- Fluxo completo: Login → Recepção → Triagem → Consulta → Prescrição
- Casos de erro (medicamento controlado gera receituário azul)
- UX (botões habilitados/desabilitados, mensagens de erro)

**Framework:** Playwright

**Exemplo:**
```typescript
test('complete consultation flow', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000/login')
  await page.fill('[name="email"]', 'vet@clinic.com')
  await page.fill('[name="password"]', 'password123')
  await page.click('button[type="submit"]')

  // Recepção: criar consulta
  await page.click('text=Nova Consulta')
  await page.fill('[name="tutor_cpf"]', '123.456.789-00')
  await page.click('button:has-text("Buscar Tutor")')
  // ... selecionar pet, motivo, pagamento
  await page.click('button:has-text("Agendar")')

  // Triagem: coletar sinais vitais
  await page.goto('/dashboard/triage')
  await page.fill('[name="weight_kg"]', '22.5')
  // ... temperatura, mucosas, TPC
  await page.click('button:has-text("Concluir Triagem")')

  // Consulta: prescrever
  await page.goto('/dashboard/vet')
  // ... diagnóstico, medicamentos
  const prescription = await page.textContent('[data-testid="prescription"]')
  expect(prescription).toContain('Amoxicilina')
})
```

---

## 📈 Coverage Targets

**Mínimo aceitável por área:**
- Fluxo clínico: **90%** (critical business logic)
- API endpoints: **85%**
- Componentes UI: **70%** (menos crítico)
- Utilidades: **80%**

**Medir com:**
```bash
npm test -- --coverage
```

---

## ✅ Checklist Pré-Deploy

- [ ] Todos os testes passam (`npm test`)
- [ ] Coverage ≥ 80% (`npm test -- --coverage`)
- [ ] E2E testes rodaram em staging
- [ ] Sem testes skipped (`.skip()`, `.only()`)
- [ ] Performance tests passam (< 3s por fluxo)

---

**Última revisão:** 2026-04-06  
**Status:** ✅ Obrigatório antes de produção
